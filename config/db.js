// const mongoose = require('mongoose');


// const connectDB = async() => {
//   try {
//     mongoose.set('strictQuery', false);
//     const conn = await mongoose.connect(process.env.MONGODB_URI);
//     console.log(`Database Connected: ${conn.connection.host}`);
//   }
//     catch (error) {
//       console.log(error);
//     }


  
// };
// module.exports = connectDB;


const mongoose = require('mongoose');

class connectDB {
  constructor() {
    this.retryCount = 0;
    this.maxRetries = 5;
    this.retryInterval = 5000;
    this.isConnected = false;
  }

  async connect() {
    const options = {
      maxPoolSize: parseInt(process.env.DB_POOL_SIZE) || 50,
      minPoolSize: 10,
      serverSelectionTimeoutMS: 5000,
      socketTimeoutMS: 45000,
      family: 4,
      retryWrites: true,
      w: 'majority',
      retryReads: true,
      heartbeatFrequencyMS: 10000,
      keepAliveInitialDelay: 300000,
      autoIndex: process.env.NODE_ENV === 'development',
    };

    try {
      mongoose.set('strictQuery', false);
      
      // Connection event handlers
      mongoose.connection.on('connected', () => {
        console.log('✅ MongoDB connected successfully');
        this.retryCount = 0;
        this.isConnected = true;
        
        // Log connection pool stats in production
        if (process.env.NODE_ENV === 'production') {
          setInterval(() => {
            const { poolSize, ready } = mongoose.connection;
            console.log(`📊 MongoDB Pool Stats - Size: ${poolSize}, Ready: ${ready}`);
          }, 60000);
        }
      });

      mongoose.connection.on('error', (err) => {
        console.error('❌ MongoDB connection error:', err);
        this.isConnected = false;
      });

      mongoose.connection.on('disconnected', () => {
        console.log('⚠️ MongoDB disconnected');
        this.isConnected = false;
        this.handleDisconnect();
      });

      mongoose.connection.on('reconnected', () => {
        console.log('🔄 MongoDB reconnected');
        this.isConnected = true;
      });

      // Graceful shutdown
      process.on('SIGINT', () => this.gracefulShutdown());
      process.on('SIGTERM', () => this.gracefulShutdown());

      const conn = await mongoose.connect(process.env.MONGODB_URI, options);
      
      // Create indexes in development only
      if (process.env.NODE_ENV === 'development') {
        await this.createIndexes();
      }
      
      return conn;

    } catch (error) {
      console.error('❌ MongoDB connection failed:', error.message);
      return this.handleDisconnect();
    }
  }

  async handleDisconnect() {
    this.retryCount++;
    
    if (this.retryCount > this.maxRetries) {
      console.error('❌ Max reconnection retries reached. Exiting...');
      process.exit(1);
    }

    const delay = this.retryInterval * Math.pow(2, this.retryCount - 1);
    console.log(`🔄 Retrying connection in ${delay/1000} seconds... (Attempt ${this.retryCount}/${this.maxRetries})`);

    setTimeout(() => this.connect(), delay);
  }

  async gracefulShutdown() {
    try {
      await mongoose.connection.close();
      console.log('✅ MongoDB connection closed through app termination');
      process.exit(0);
    } catch (err) {
      console.error('❌ Error during graceful shutdown:', err);
      process.exit(1);
    }
  }

  async createIndexes() {
    try {
      // User indexes
      await mongoose.model('User').collection.createIndexes([
        { key: { email: 1 }, unique: true },
        { key: { phone: 1 }, unique: true, sparse: true },
        { key: { 'addresses.location': '2dsphere' } },
        { key: { role: 1 } },
        { key: { isActive: 1 } }
      ]);

      // Order indexes
      await mongoose.model('Order').collection.createIndexes([
        { key: { userId: 1, createdAt: -1 } },
        { key: { orderId: 1 }, unique: true },
        { key: { reference: 1 }, unique: true, sparse: true },
        { key: { status: 1 } },
        { key: { paymentStatus: 1 } },
        { key: { deliveryAgentId: 1 } },
        { key: { 'deliveryAddress.coordinates': '2dsphere' } }
      ]);

      // Subscription indexes
      await mongoose.model('Subscription').collection.createIndexes([
        { key: { userId: 1, status: 1 } },
        { key: { endDate: 1 } },
        { key: { reference: 1 }, unique: true },
        { key: { status: 1, endDate: 1 } }
      ]);

      // Product indexes
      await mongoose.model('Product').collection.createIndexes([
        { key: { category: 1 } },
        { key: { price: 1 } },
        { key: { isActive: 1 } },
        { key: { name: 'text', description: 'text' } }
      ]);

      // Wallet indexes
      await mongoose.model('Wallet').collection.createIndexes([
        { key: { userId: 1 }, unique: true }
      ]);

      // Transaction indexes
      await mongoose.model('Transaction').collection.createIndexes([
        { key: { userId: 1, createdAt: -1 } },
        { key: { reference: 1 }, unique: true },
        { key: { status: 1 } }
      ]);

      // Support Ticket indexes
      await mongoose.model('SupportTicket').collection.createIndexes([
        { key: { user: 1, createdAt: -1 } },
        { key: { status: 1 } },
        { key: { assignedTo: 1, status: 1 } }
      ]);

      console.log('✅ Database indexes created successfully');
    } catch (error) {
      console.error('⚠️ Index creation warning:', error.message);
    }
  }
}

module.exports = new connectDB();