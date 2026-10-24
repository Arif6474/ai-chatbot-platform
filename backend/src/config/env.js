const path = require('path');
const dotenv = require('dotenv');

// Load environment variables from root directory first, then local if exists
dotenv.config({ path: path.resolve(__dirname, '../../../.env') });
dotenv.config();

const isProduction = process.env.NODE_ENV === 'production';
const isTest = process.env.NODE_ENV === 'test';

const FRONTEND_URL = process.env.FRONTEND_URL || 'http://localhost:5173';

function parseBoundedInteger(value, defaultValue, name, minimum, maximum) {
  if (value === undefined || value === '') return defaultValue;
  if (!/^\d+$/.test(value)) throw new Error(`${name} must be an integer`);
  const parsed = Number(value);
  if (parsed < minimum || parsed > maximum) throw new Error(`${name} must be between ${minimum} and ${maximum}`);
  return parsed;
}

function parseOllamaBaseUrl(value) {
  let url;
  try {
    url = new URL(value || 'http://127.0.0.1:11434');
  } catch {
    throw new Error('OLLAMA_BASE_URL must be a valid HTTP or HTTPS URL');
  }
  if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password || url.pathname !== '/' || url.search || url.hash) {
    throw new Error('OLLAMA_BASE_URL must be an HTTP or HTTPS origin without credentials or a path');
  }
  return url.origin;
}

function parseOllamaModel(value) {
  const model = (value || 'qwen2.5:3b').trim();
  if (!model || model.length > 100 || /[\r\n]/.test(model)) {
    throw new Error('OLLAMA_MODEL must be a non-empty model name up to 100 characters');
  }
  return model;
}

const env = {
  NODE_ENV: process.env.NODE_ENV || 'development',
  PORT: parseInt(process.env.PORT, 10) || 5050,
  FRONTEND_URL,
  MONGODB_URI: process.env.MONGODB_URI || '',
  MONGODB_DATABASE: process.env.MONGODB_DATABASE || 'ai_chatbot_platform',
  JWT_SECRET: process.env.JWT_SECRET || (isProduction ? '' : 'dev_fallback_secret_for_local_development_only_min32chars'),
  JWT_EXPIRES_IN: process.env.JWT_EXPIRES_IN || '24h',
  ADMIN_COOKIE_NAME: process.env.ADMIN_COOKIE_NAME || 'admin_token',
  OLLAMA_BASE_URL: parseOllamaBaseUrl(process.env.OLLAMA_BASE_URL),
  OLLAMA_MODEL: parseOllamaModel(process.env.OLLAMA_MODEL),
  OLLAMA_TIMEOUT_MS: parseBoundedInteger(process.env.OLLAMA_TIMEOUT_MS, 30000, 'OLLAMA_TIMEOUT_MS', 1000, 120000),
  OLLAMA_OUTPUT_TOKENS: parseBoundedInteger(process.env.OLLAMA_OUTPUT_TOKENS, 300, 'OLLAMA_OUTPUT_TOKENS', 1, 1024),
  // Single source of truth for allowed browser origins.
  // Used by both CORS middleware and server-side CSRF origin validation.
  ALLOWED_ORIGINS: (() => {
    if (process.env.ALLOWED_ORIGINS) {
      return process.env.ALLOWED_ORIGINS.split(',').map((o) => o.trim()).filter(Boolean);
    }
    const origins = [FRONTEND_URL];
    if (!isProduction) {
      origins.push('http://localhost:5173', 'http://127.0.0.1:5173');
    }
    return [...new Set(origins)];
  })(),
  isProduction,
  isTest,
};

// Validate critical parameters in production
if (env.isProduction) {
  if (!process.env.MONGODB_URI) {
    throw new Error('[CONFIG FATAL] MONGODB_URI must be defined in production environment.');
  }
  if (!process.env.JWT_SECRET || process.env.JWT_SECRET.length < 32) {
    throw new Error('[CONFIG FATAL] JWT_SECRET must be defined and at least 32 characters long in production.');
  }
}

module.exports = env;
