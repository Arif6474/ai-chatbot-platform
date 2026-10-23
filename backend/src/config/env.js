const path = require('path');
const dotenv = require('dotenv');

// Load environment variables from root directory first, then local if exists
dotenv.config({ path: path.resolve(__dirname, '../../../.env') });
dotenv.config();

const isProduction = process.env.NODE_ENV === 'production';
const isTest = process.env.NODE_ENV === 'test';

const env = {
  NODE_ENV: process.env.NODE_ENV || 'development',
  PORT: parseInt(process.env.PORT, 10) || 5050,
  FRONTEND_URL: process.env.FRONTEND_URL || 'http://localhost:5173',
  MONGODB_URI: process.env.MONGODB_URI || '',
  MONGODB_DATABASE: process.env.MONGODB_DATABASE || 'ai_chatbot_platform',
  JWT_SECRET: process.env.JWT_SECRET || (isProduction ? '' : 'dev_fallback_secret_for_local_development_only_min32chars'),
  JWT_EXPIRES_IN: process.env.JWT_EXPIRES_IN || '24h',
  ADMIN_COOKIE_NAME: process.env.ADMIN_COOKIE_NAME || 'admin_token',
  isProduction,
  isTest,
};

// Validate critical parameters in production
if (env.isProduction) {
  if (!process.env.MONGODB_URI) {
    console.warn('[CONFIG WARN] MONGODB_URI is not defined in production environment.');
  }
  if (!process.env.JWT_SECRET || process.env.JWT_SECRET.length < 32) {
    throw new Error('[CONFIG FATAL] JWT_SECRET must be defined and at least 32 characters long in production.');
  }
}

module.exports = env;
