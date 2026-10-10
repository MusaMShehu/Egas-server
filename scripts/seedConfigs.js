/**
 * Seed default SystemConfig values and FeatureFlags.
 * Run once per environment: node scripts/seedConfigs.js
 */

require('dotenv').config();
const connectDB = require('../config/db');
const ConfigService = require('../services/configService');

const CONFIGS = [
  // Remnant
  {
    key: 'MINIMUM_REMNANT_DELIVERY_KG',
    value: 6,
    category: 'remnant',
    description: 'Minimum accumulated remnant kg for delivery eligibility',
  },
  {
    key: 'REMNANT_EXPIRY_DAYS',
    value: 180,
    category: 'remnant',
    description: 'Days after which remnant entries expire (0 = never)',
  },

  // Plant
  {
    key: 'PLANT_VARIANCE_TOLERANCE_KG',
    value: 0.2,
    category: 'plant',
    description: 'Maximum variance (kg) between requested and plant-confirmed quantity before dispute',
  },
  {
    key: 'PLANT_SETTLEMENT_PERIOD_DAYS',
    value: 7,
    category: 'settlement',
    description: 'Default settlement period in days',
  },
  {
    key: 'PLANT_AUTO_APPROVE_SETTLEMENT',
    value: false,
    category: 'settlement',
    description: 'Auto-approve settlement drafts on generation',
  },
  {
    key: 'PLANT_MAX_RETRY_ATTEMPTS',
    value: 3,
    category: 'plant',
    description: 'Max plant retry attempts per delivery before escalation',
  },
  {
    key: 'PLANT_SEARCH_RADIUS_KM',
    value: 30,
    category: 'plant',
    description: 'Default radius (km) for plant discovery',
  },
];

const FLAGS = [
  {
    key: 'PARTNER_PLANT_WORKFLOW',
    enabled: false,
    description: 'Enable partner plant refill workflow',
  },
  {
    key: 'CYLINDER_LEDGER',
    enabled: false,
    description: 'Enable cylinder registration, tag, and custody tracking',
  },
  {
    key: 'REMNANT_LEDGER',
    enabled: false,
    description: 'Enable append-only remnant ledger',
  },
  {
    key: 'PLANT_SETTLEMENT',
    enabled: false,
    description: 'Enable plant settlement generation and approval',
  },
  {
    key: 'PLANT_DISPUTES',
    enabled: false,
    description: 'Enable dispute creation and resolution',
  },
  {
    key: 'AGENT_PLANT_SELECTION',
    enabled: false,
    description: 'Allow agents to select refill plants',
  },
];

const run = async () => {
  console.log('🚀 Seeding SystemConfig + FeatureFlags...');

  try {
    await connectDB.connect();

    const configResult = await ConfigService.seedConfigs(CONFIGS);
    console.log(`✅ Configs seeded (new): ${configResult.upserted}`);

    const flagResult = await ConfigService.seedFlags(FLAGS);
    console.log(`✅ Flags seeded (new): ${flagResult.upserted}`);

    console.log('🎉 Seeding complete.');
    process.exit(0);
  } catch (error) {
    console.error('❌ Seeding failed:', error);
    process.exit(1);
  }
};

run();