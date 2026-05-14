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





// const jwt = require('jsonwebtoken');
// const crypto = require('crypto');
// const { redisClient } = require('../config/redis');

// class AuthService {
//   constructor() {
//     this.accessTokenExpiry = process.env.JWT_EXPIRES_IN || '15m';
//     this.refreshTokenExpiry = process.env.JWT_REFRESH_EXPIRES_IN || '7d';
//     this.accessTokenExpirySeconds = 15 * 60; // 15 minutes
//     this.refreshTokenExpirySeconds = 7 * 24 * 60 * 60; // 7 days
//     this.redisAvailable = false;
    
//     // Check Redis connection
//     this.checkRedisConnection();
//   }

//   checkRedisConnection() {
//     try {
//       if (redisClient && redisClient.isConnected && redisClient.isConnected()) {
//         this.redisAvailable = true;
//         console.log('✅ Redis connected in AuthService');
//       } else {
//         console.log('⚠️ Redis not available in AuthService - using memory fallback');
//         this.redisAvailable = false;
//       }
//     } catch (error) {
//       console.error('❌ Redis connection check failed:', error.message);
//       this.redisAvailable = false;
//     }
//   }

//   generateTokens(user) {
//     const payload = {
//       userId: user._id.toString(),
//       email: user.email,
//       role: user.role,
//     };

//     // Generate access token
//     const accessToken = jwt.sign(
//       payload,
//       process.env.JWT_SECRET,
//       { expiresIn: this.accessTokenExpiry }
//     );

//     // Generate refresh token with different secret
//     const refreshToken = jwt.sign(
//       { userId: user._id.toString() },
//       process.env.JWT_REFRESH_SECRET,
//       { expiresIn: this.refreshTokenExpiry }
//     );

//     // Store refresh token (with Redis fallback)
//     this.storeRefreshToken(user._id.toString(), refreshToken).catch(console.error);

//     return {
//       accessToken,
//       refreshToken,
//       expiresIn: this.accessTokenExpirySeconds,
//     };
//   }
  
//   async storeRefreshToken(userId, refreshToken) {
//     if (this.redisAvailable) {
//       try {
//         const key = `refresh:${userId}`;
//         await redisClient.sadd(key, refreshToken);
//         await redisClient.expire(key, this.refreshTokenExpirySeconds);
//         console.log(`✅ Refresh token stored in Redis for user ${userId}`);
//       } catch (error) {
//         console.error('❌ Redis store failed:', error);
//         this.redisAvailable = false;
//         // Fall through to memory store
//       }
//     }
    
//     // Memory fallback (store in process memory - not ideal for production)
//     if (!this.redisAvailable) {
//       if (!this.memoryStore) this.memoryStore = new Map();
//       const key = `refresh:${userId}`;
//       if (!this.memoryStore.has(key)) {
//         this.memoryStore.set(key, new Set());
//       }
//       this.memoryStore.get(key).add(refreshToken);
//       console.log(`⚠️ Stored refresh token in memory for user ${userId}`);
//     }
//   }

//   async verifyRefreshToken(refreshToken) {
//     try {
//       // Verify JWT first
//       const decoded = jwt.verify(refreshToken, process.env.JWT_REFRESH_SECRET);
//       console.log('Refresh token decoded:', decoded);
      
//       // Check if refresh token exists in storage
//       const exists = await this.tokenExists(decoded.userId, refreshToken);
      
//       if (!exists) {
//         console.log(`Refresh token not found for user ${decoded.userId}`);
//         return { valid: false, error: 'Refresh token not found' };
//       }

//       return { valid: true, userId: decoded.userId };
//     } catch (error) {
//       console.error('Refresh token verification error:', error.message);
//       return { valid: false, error: error.message };
//     }
//   }

//   async tokenExists(userId, refreshToken) {
//     // Try Redis first
//     if (this.redisAvailable) {
//       try {
//         const key = `refresh:${userId}`;
//         const exists = await redisClient.sismember(key, refreshToken);
//         return exists === 1;
//       } catch (error) {
//         console.error('Redis check failed:', error);
//         this.redisAvailable = false;
//       }
//     }
    
//     // Memory fallback
//     if (this.memoryStore) {
//       const key = `refresh:${userId}`;
//       return this.memoryStore.has(key) && this.memoryStore.get(key).has(refreshToken);
//     }
    
//     return false;
//   }

//   async refreshAccessToken(refreshToken) {
//     try {
//       console.log('Attempting to refresh access token...');
//       const verification = await this.verifyRefreshToken(refreshToken);
      
//       if (!verification.valid) {
//         console.error('Refresh token verification failed:', verification.error);
//         throw new Error(verification.error || 'Invalid refresh token');
//       }

//       console.log('Refresh token verified for user:', verification.userId);
//       return { userId: verification.userId };
//     } catch (error) {
//       console.error('Refresh access token error:', error);
//       throw error;
//     }
//   }

//   async blacklistToken(token) {
//     try {
//       const decoded = jwt.decode(token);
//       if (!decoded || !decoded.exp) return;

//       const ttl = decoded.exp - Math.floor(Date.now() / 1000);
      
//       if (ttl > 0) {
//         if (this.redisAvailable) {
//           const key = `blacklist:${token}`;
//           await redisClient.set(key, 'revoked', ttl);
//           console.log(`Token blacklisted in Redis, expires in ${ttl}s`);
//         } else {
//           // Memory blacklist
//           if (!this.blacklist) this.blacklist = new Map();
//           this.blacklist.set(token, Date.now() + (ttl * 1000));
//           console.log(`Token blacklisted in memory, expires in ${ttl}s`);
//         }
//       }
//     } catch (error) {
//       console.error('Token blacklist error:', error);
//     }
//   }

//   async isTokenBlacklisted(token) {
//     try {
//       if (this.redisAvailable) {
//         const key = `blacklist:${token}`;
//         const result = await redisClient.get(key);
//         return !!result;
//       }
      
//       if (this.blacklist) {
//         const expiry = this.blacklist.get(token);
//         if (expiry && expiry > Date.now()) {
//           return true;
//         }
//         if (expiry) this.blacklist.delete(token);
//       }
//     } catch (error) {
//       console.error('Token blacklist check error:', error);
//     }
//     return false;
//   }

//   async revokeAllUserTokens(userId) {
//     const key = `refresh:${userId}`;
    
//     if (this.redisAvailable) {
//       try {
//         await redisClient.del(key);
//         console.log(`Revoked all tokens for user ${userId} in Redis`);
//       } catch (error) {
//         console.error('Redis revoke error:', error);
//       }
//     }
    
//     if (this.memoryStore) {
//       this.memoryStore.delete(key);
//     }
//   }

//   async revokeRefreshToken(userId, refreshToken) {
//     const key = `refresh:${userId}`;
    
//     if (this.redisAvailable) {
//       try {
//         await redisClient.srem(key, refreshToken);
//         console.log(`Revoked refresh token for user ${userId} in Redis`);
//       } catch (error) {
//         console.error('Redis revoke error:', error);
//       }
//     }
    
//     if (this.memoryStore && this.memoryStore.has(key)) {
//       this.memoryStore.get(key).delete(refreshToken);
//     }
//   }

//   generateSecureToken() {
//     return crypto.randomBytes(32).toString('hex');
//   }

//   hashToken(token) {
//     return crypto.createHash('sha256').update(token).digest('hex');
//   }
// }

// module.exports = new AuthService();