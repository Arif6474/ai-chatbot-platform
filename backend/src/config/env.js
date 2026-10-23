const path = require('path');
const dotenv = require('dotenv');

// Load environment variables from root directory first, then local if exists
dotenv.config({ path: path.resolve(__dirname, '../../../.env') });
dotenv.config();

const env = {
  NODE_ENV: process.env.NODE_ENV || 'development',
  PORT: parseInt(process.env.PORT, 10) || 5050,
  FRONTEND_URL: process.env.FRONTEND_URL || 'http://localhost:5173',
  MONGODB_URI: process.env.MONGODB_URI || '',
  MONGODB_DATABASE: process.env.MONGODB_DATABASE || 'ai_chatbot_platform',
  isProduction: process.env.NODE_ENV === 'production',
  isTest: process.env.NODE_ENV === 'test',
};

// Validate critical parameters in production
if (env.isProduction) {
  if (!process.env.MONGODB_URI) {
    console.warn('[CONFIG WARN] MONGODB_URI is not defined in production environment.');
  }
}

module.exports = env;
