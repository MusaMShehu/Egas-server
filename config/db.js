const mongoose = require('mongoose');


const connectDB = async() => {
  try {
    mongoose.set('strictQuery', false);
    const conn = await mongoose.connect(process.env.MONGODB_URI);
    console.log(`Database Connected: ${conn.connection.host}`);
  }
    catch (error) {
      console.log(error);
    }


  //   await mongoose.connect(uri, { useNewUrlParser: true, useUnifiedTopology: true });
  //   console.log('MongoDB connected');
  // } catch (err) {
  //   console.error('MongoDB connection error:', err.message);
  //   process.exit(1);
  // }
};
module.exports = connectDB;


// const mongoose = require('mongoose');

// const connectDB = async () => {
//   try {
//     mongoose.set('strictQuery', false);
    
//     const conn = await mongoose.connect(process.env.MONGODB_URI, {
//       useNewUrlParser: true,
//       useUnifiedTopology: true,
//       // Additional recommended options:
//       serverSelectionTimeoutMS: 5000, // Timeout after 5s instead of 30s
//       socketTimeoutMS: 45000, // Close sockets after 45s of inactivity
//       family: 4, // Use IPv4, skip trying IPv6
//     });
    
//     console.log(`MongoDB Connected: ${conn.connection.host}`);
    
//     // Handle connection events
//     mongoose.connection.on('error', (err) => {
//       console.error('MongoDB connection error:', err);
//     });
    
//     mongoose.connection.on('disconnected', () => {
//       console.log('MongoDB disconnected');
//     });
    
//   } catch (error) {
//     console.error('MongoDB connection failed:', error.message);
//     process.exit(1);
//   }
// };

// module.exports = connectDB;