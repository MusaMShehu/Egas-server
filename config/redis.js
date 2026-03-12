const Redis = require('ioredis');

class RedisClient {
  constructor() {
    this.client = null;
    this.subscriber = null;
    this.isConnected = false;
  }

  async connect() {
    const options = {
      host: process.env.REDIS_HOST || 'localhost',
      port: parseInt(process.env.REDIS_PORT) || 6379,
      password: process.env.REDIS_PASSWORD,
      retryStrategy: (times) => {
        const delay = Math.min(times * 50, 2000);
        return delay;
      },
      maxRetriesPerRequest: 3,
      enableReadyCheck: true,
      lazyConnect: true,
      keepAlive: 30000,
    };

    this.client = new Redis(options);
    this.subscriber = new Redis(options);

    // Event handlers
    this.client.on('connect', () => {
      console.log('✅ Redis connected successfully');
      this.isConnected = true;
    });

    this.client.on('error', (error) => {
      console.error('❌ Redis error:', error);
      this.isConnected = false;
    });

    this.client.on('close', () => {
      console.log('⚠️ Redis connection closed');
      this.isConnected = false;
    });

    try {
      await this.client.connect();
      await this.subscriber.connect();
      
      // Test connection
      await this.client.ping();
    } catch (error) {
      console.error('Failed to connect to Redis:', error);
    }
  }

  async get(key) {
    try {
      if (!this.isConnected) return null;
      const data = await this.client.get(key);
      return data ? JSON.parse(data) : null;
    } catch (error) {
      console.error('Redis get error:', error);
      return null;
    }
  }

  async set(key, value, ttlSeconds = 300) {
    try {
      if (!this.isConnected) return false;
      const stringValue = JSON.stringify(value);
      await this.client.setex(key, ttlSeconds, stringValue);
      return true;
    } catch (error) {
      console.error('Redis set error:', error);
      return false;
    }
  }

  async del(key) {
    try {
      if (!this.isConnected) return false;
      await this.client.del(key);
      return true;
    } catch (error) {
      console.error('Redis del error:', error);
      return false;
    }
  }

  async delPattern(pattern) {
    try {
      if (!this.isConnected) return 0;
      const keys = await this.client.keys(pattern);
      if (keys.length > 0) {
        await this.client.del(...keys);
      }
      return keys.length;
    } catch (error) {
      console.error('Redis delPattern error:', error);
      return 0;
    }
  }

  async sadd(key, value) {
    try {
      if (!this.isConnected) return 0;
      return await this.client.sadd(key, value);
    } catch (error) {
      console.error('Redis sadd error:', error);
      return 0;
    }
  }

  async srem(key, value) {
    try {
      if (!this.isConnected) return 0;
      return await this.client.srem(key, value);
    } catch (error) {
      console.error('Redis srem error:', error);
      return 0;
    }
  }

  async smembers(key) {
    try {
      if (!this.isConnected) return [];
      return await this.client.smembers(key);
    } catch (error) {
      console.error('Redis smembers error:', error);
      return [];
    }
  }

  async expire(key, seconds) {
    try {
      if (!this.isConnected) return false;
      return await this.client.expire(key, seconds);
    } catch (error) {
      console.error('Redis expire error:', error);
      return false;
    }
  }

  async quit() {
    try {
      if (this.client) await this.client.quit();
      if (this.subscriber) await this.subscriber.quit();
      this.isConnected = false;
    } catch (error) {
      console.error('Redis quit error:', error);
    }
  }
}

// Cache middleware factory
const createCacheMiddleware = (duration = 300, keyPrefix = 'cache') => {
  return async (req, res, next) => {
    // Skip caching for non-GET requests
    if (req.method !== 'GET') {
      return next();
    }

    // Skip caching for authenticated user-specific data
    if (req.user && req.originalUrl.includes('/me')) {
      return next();
    }

    const key = `${keyPrefix}:${req.originalUrl || req.url}`;
    
    try {
      const cachedData = await redisClient.get(key);
      
      if (cachedData) {
        return res.status(200).json({
          success: true,
          cached: true,
          data: cachedData
        });
      }

      // Store original json method
      const originalJson = res.json;
      
      // Override res.json to cache the response
      res.json = function(data) {
        if (res.statusCode === 200 && data.success !== false) {
          redisClient.set(key, data, duration);
        }
        originalJson.call(this, data);
      };

      next();
    } catch (error) {
      console.error('Cache middleware error:', error);
      next();
    }
  };
};

const redisClient = new RedisClient();
module.exports = { redisClient, createCacheMiddleware };