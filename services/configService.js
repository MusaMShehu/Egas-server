const SystemConfig = require('../models/SystemConfig');
const FeatureFlag = require('../models/FeatureFlag');
const ErrorResponse = require('../utils/errorResponse');

/**
 * ConfigService
 * ---------------
 * Centralized access to system configuration and feature flags.
 * - SystemConfig: values (remnant threshold, tolerance, etc.)
 * - FeatureFlag: feature toggles
 *
 * Caching: In-memory cache for 60s to reduce DB hits on hot paths.
 * Redis caching optional (can be layered later).
 */

const CONFIG_CACHE_TTL_MS = 60 * 1000; // 60 seconds
const FLAG_CACHE_TTL_MS = 30 * 1000;   // 30 seconds

class ConfigService {
  constructor() {
    this.configCache = new Map(); // key → { value, expiresAt }
    this.flagCache = new Map();   // key → { enabled, expiresAt }
  }

  // =============================================
  // SYSTEM CONFIG
  // =============================================

  /**
   * Get a config value by key. Falls back to env var, then default.
   * @param {string} key
   * @param {*} defaultValue
   * @returns {Promise<*>}
   */
  async getConfig(key, defaultValue = null) {
    const normalized = key.toUpperCase();

    // Check cache
    const cached = this.configCache.get(normalized);
    if (cached && cached.expiresAt > Date.now()) {
      return cached.value;
    }

    // Query DB
    let doc = null;
    try {
      doc = await SystemConfig.findOne({ key: normalized }).lean();
    } catch (err) {
      // Fail-safe: if DB unavailable, use env fallback
      console.warn(`ConfigService: DB lookup failed for ${normalized}:`, err.message);
    }

    let value;
    if (doc) {
      value = doc.value;
    } else if (process.env[normalized] !== undefined) {
      value = this._coerceEnvValue(process.env[normalized]);
    } else {
      value = defaultValue;
    }

    // Cache
    this.configCache.set(normalized, {
      value,
      expiresAt: Date.now() + CONFIG_CACHE_TTL_MS,
    });

    return value;
  }

  /**
   * Get all configs in a category.
   */
  async getConfigsByCategory(category) {
    return SystemConfig.find({ category }).sort({ key: 1 }).lean();
  }

  /**
   * Get all configs (admin use).
   */
  async getAllConfigs() {
    return SystemConfig.find().sort({ category: 1, key: 1 }).lean();
  }

  /**
   * Set/update a config value (admin only).
   */
  async setConfig(key, value, { category, description, actorId, isEditable = true } = {}) {
    const normalized = key.toUpperCase();

    const doc = await SystemConfig.findOneAndUpdate(
      { key: normalized },
      {
        $set: {
          value,
          valueType: this._inferValueType(value),
          ...(category && { category }),
          ...(description && { description }),
          isEditable,
          updatedBy: actorId,
        },
      },
      { upsert: true, new: true, runValidators: true }
    );

    // Invalidate cache
    this.configCache.delete(normalized);

    return doc;
  }

  /**
   * Bulk seed configs (used at startup / migration).
   */
  async seedConfigs(configs) {
    const ops = configs.map((c) => ({
      updateOne: {
        filter: { key: c.key.toUpperCase() },
        update: {
          $setOnInsert: {
            key: c.key.toUpperCase(),
            value: c.value,
            valueType: this._inferValueType(c.value),
            category: c.category || 'general',
            description: c.description,
            isEditable: c.isEditable !== false,
          },
        },
      },
    }));

    if (ops.length === 0) return { upserted: 0 };

    const result = await SystemConfig.bulkWrite(ops);
    return { upserted: result.upsertedCount };
  }

  // =============================================
  // FEATURE FLAGS
  // =============================================

  /**
   * Check if a feature is enabled.
   * Resolution order:
   *   1. DB FeatureFlag (scope=global)
   *   2. Env var fallback
   *   3. false
   */
  async isFeatureEnabled(key) {
    const normalized = key.toUpperCase();

    // Check cache
    const cached = this.flagCache.get(normalized);
    if (cached && cached.expiresAt > Date.now()) {
      return cached.enabled;
    }

    let enabled = false;

    try {
      const flag = await FeatureFlag.findOne({
        key: normalized,
        scope: 'global',
      }).lean();

      if (flag) {
        enabled = flag.enabled;
      } else if (process.env[normalized] !== undefined) {
        enabled = this._coerceEnvValue(process.env[normalized]);
      }
    } catch (err) {
      console.warn(`ConfigService: flag lookup failed for ${normalized}:`, err.message);
      // Fallback to env
      if (process.env[normalized] !== undefined) {
        enabled = this._coerceEnvValue(process.env[normalized]);
      }
    }

    // Cache
    this.flagCache.set(normalized, {
      enabled,
      expiresAt: Date.now() + FLAG_CACHE_TTL_MS,
    });

    return !!enabled;
  }

  /**
   * Get all feature flags (admin use).
   */
  async getAllFlags() {
    return FeatureFlag.find().sort({ key: 1 }).lean();
  }

  /**
   * Set/update a feature flag.
   */
  async setFlag(key, enabled, { description, scope = 'global', scopeValue = null, actorId } = {}) {
    const normalized = key.toUpperCase();

    const doc = await FeatureFlag.findOneAndUpdate(
      { key: normalized, scope, scopeValue },
      {
        $set: {
          enabled,
          description,
          updatedBy: actorId,
        },
      },
      { upsert: true, new: true, runValidators: true }
    );

    // Invalidate cache (only for global scope)
    if (scope === 'global') {
      this.flagCache.delete(normalized);
    }

    return doc;
  }

  /**
   * Seed default feature flags.
   */
  async seedFlags(flags) {
    const ops = flags.map((f) => ({
      updateOne: {
        filter: { key: f.key.toUpperCase(), scope: 'global', scopeValue: null },
        update: {
          $setOnInsert: {
            key: f.key.toUpperCase(),
            enabled: f.enabled ?? false,
            description: f.description,
            scope: 'global',
            scopeValue: null,
          },
        },
      },
    }));

    if (ops.length === 0) return { upserted: 0 };

    const result = await FeatureFlag.bulkWrite(ops);
    return { upserted: result.upsertedCount };
  }

  // =============================================
  // CACHE MANAGEMENT
  // =============================================

  clearCache() {
    this.configCache.clear();
    this.flagCache.clear();
  }

  clearConfigCache(key) {
    if (key) this.configCache.delete(key.toUpperCase());
    else this.configCache.clear();
  }

  clearFlagCache(key) {
    if (key) this.flagCache.delete(key.toUpperCase());
    else this.flagCache.clear();
  }

  // =============================================
  // INTERNAL HELPERS
  // =============================================

  _inferValueType(value) {
    if (typeof value === 'number') return 'number';
    if (typeof value === 'boolean') return 'boolean';
    if (typeof value === 'object' && value !== null) return 'json';
    return 'string';
  }

  _coerceEnvValue(raw) {
    if (raw === 'true') return true;
    if (raw === 'false') return false;
    if (raw === 'null') return null;

    // Number
    const num = Number(raw);
    if (!Number.isNaN(num) && String(num) === raw) return num;

    // JSON
    if ((raw.startsWith('{') && raw.endsWith('}')) || (raw.startsWith('[') && raw.endsWith(']'))) {
      try {
        return JSON.parse(raw);
      } catch {
        return raw;
      }
    }

    return raw;
  }
}

module.exports = new ConfigService();