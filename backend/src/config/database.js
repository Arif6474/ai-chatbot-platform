const mongoose = require('mongoose');
const env = require('./env');

let isConnected = false;

/**
 * Connect to MongoDB Atlas or local MongoDB instance.
 * Safe fallback if URI is not yet configured.
 */
async function connectDB() {
  if (!env.MONGODB_URI) {
    console.log('[DATABASE] Notice: MONGODB_URI is not set. Database connection skipped for Step 1 foundation.');
    return false;
  }

  try {
    const conn = await mongoose.connect(env.MONGODB_URI, {
      dbName: env.MONGODB_DATABASE,
      serverSelectionTimeoutMS: 5000,
    });

    isConnected = true;
    console.log(`[DATABASE] MongoDB connected successfully to host: ${conn.connection.host} (DB: ${env.MONGODB_DATABASE})`);
    return true;
  } catch (error) {
    isConnected = false;
    console.error(`[DATABASE ERROR] Failed to connect to MongoDB: ${error.message}`);
    return false;
  }
}

/**
 * Disconnect from MongoDB safely
 */
async function disconnectDB() {
  if (isConnected || mongoose.connection.readyState !== 0) {
    await mongoose.disconnect();
    isConnected = false;
    console.log('[DATABASE] MongoDB disconnected.');
  }
}

function getDatabaseStatus() {
  const stateMap = {
    0: 'disconnected',
    1: 'connected',
    2: 'connecting',
    3: 'disconnecting',
  };
  return stateMap[mongoose.connection.readyState] || 'unknown';
}

module.exports = {
  connectDB,
  disconnectDB,
  getDatabaseStatus,
};
