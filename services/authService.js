const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const { redisClient } = require('../config/redis');

class AuthService {
  constructor() {
    this.accessTokenExpiry = process.env.JWT_EXPIRES_IN || '15m';
    this.refreshTokenExpiry = process.env.JWT_REFRESH_EXPIRES_IN || '7d';
    this.accessTokenExpirySeconds = 15 * 60; // 15 minutes
    this.refreshTokenExpirySeconds = 7 * 24 * 60 * 60; // 7 days
  }

  generateTokens(user) {
    const payload = {
      userId: user._id.toString(),
      email: user.email,
      role: user.role,
    };

    // Generate access token
    const accessToken = jwt.sign(
      payload,
      process.env.JWT_SECRET,
      { expiresIn: this.accessTokenExpiry }
    );

    // Generate refresh token with different secret
    const refreshToken = jwt.sign(
      { userId: user._id.toString() },
      process.env.JWT_REFRESH_SECRET,
      { expiresIn: this.refreshTokenExpiry }
    );

    // Store refresh token in Redis (allow multiple devices)
    this.storeRefreshToken(user._id.toString(), refreshToken);

    return {
      accessToken,
      refreshToken,
      expiresIn: this.accessTokenExpirySeconds,
    };
  }
  
  async storeRefreshToken(userId, refreshToken) {
    const key = `refresh:${userId}`;
    // Use a set to allow multiple refresh tokens per user
    await redisClient.sadd(key, refreshToken);
    await redisClient.expire(key, this.refreshTokenExpirySeconds);
  }

  async verifyAccessToken(token) {
    try {
      // Check if token is blacklisted
      const isBlacklisted = await this.isTokenBlacklisted(token);
      if (isBlacklisted) {
        return { valid: false, error: 'Token has been revoked' };
      }

      const decoded = jwt.verify(token, process.env.JWT_SECRET);
      return { valid: true, decoded };
    } catch (error) {
      return { valid: false, error: error.message };
    }
  }

  async verifyRefreshToken(refreshToken) {
    try {
      const decoded = jwt.verify(refreshToken, process.env.JWT_REFRESH_SECRET);
      
      // Check if refresh token exists in Redis
      const key = `refresh:${decoded.userId}`;
      const exists = await redisClient.sismember(key, refreshToken);
      
      if (!exists) {
        return { valid: false, error: 'Refresh token not found' };
      }

      return { valid: true, userId: decoded.userId };
    } catch (error) {
      return { valid: false, error: error.message };
    }
  }

  async refreshAccessToken(refreshToken) {
    const verification = await this.verifyRefreshToken(refreshToken);
    
    if (!verification.valid) {
      throw new Error('Invalid refresh token');
    }

    // Get user from database (this will be called from controller)
    // We return the userId to fetch user in controller
    return { userId: verification.userId };
  }

  async blacklistToken(token) {
    try {
      const decoded = jwt.decode(token);
      if (!decoded || !decoded.exp) return;

      // Calculate remaining TTL
      const ttl = decoded.exp - Math.floor(Date.now() / 1000);
      
      if (ttl > 0) {
        const key = `blacklist:${token}`;
        await redisClient.set(key, 'revoked', ttl);
      }
    } catch (error) {
      console.error('Token blacklist error:', error);
    }
  }

  async isTokenBlacklisted(token) {
    const key = `blacklist:${token}`;
    const result = await redisClient.get(key);
    return !!result;
  }

  async revokeAllUserTokens(userId) {
    const key = `refresh:${userId}`;
    await redisClient.del(key);
  }

  async revokeRefreshToken(userId, refreshToken) {
    const key = `refresh:${userId}`;
    await redisClient.srem(key, refreshToken);
  }

  generateSecureToken() {
    return crypto.randomBytes(32).toString('hex');
  }

  hashToken(token) {
    return crypto.createHash('sha256').update(token).digest('hex');
  }
}

module.exports = new AuthService();