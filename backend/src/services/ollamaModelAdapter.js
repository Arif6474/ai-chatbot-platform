const env = require('../config/env');

const MAX_PROMPT_CHARACTERS = 16000;
const MAX_RESPONSE_CHARACTERS = 8000;

class ModelAdapterError extends Error {
  constructor(message, code) {
    super(message);
    this.name = 'ModelAdapterError';
    this.code = code;
  }
}

function validateAdapterConfig(config) {
  if (!config || typeof config.OLLAMA_BASE_URL !== 'string' || typeof config.OLLAMA_MODEL !== 'string' || !config.OLLAMA_MODEL.trim()) {
    throw new Error('Invalid Ollama adapter configuration');
  }
  if (!Number.isInteger(config.OLLAMA_TIMEOUT_MS) || config.OLLAMA_TIMEOUT_MS < 1000 || config.OLLAMA_TIMEOUT_MS > 120000) throw new Error('Invalid Ollama timeout configuration');
  if (!Number.isInteger(config.OLLAMA_OUTPUT_TOKENS) || config.OLLAMA_OUTPUT_TOKENS < 1 || config.OLLAMA_OUTPUT_TOKENS > 1024) throw new Error('Invalid Ollama output token configuration');
}

function validatePrompts(systemPrompt, userPrompt) {
  if (typeof systemPrompt !== 'string' || typeof userPrompt !== 'string' || !systemPrompt.trim() || !userPrompt.trim()) {
    throw new ModelAdapterError('Invalid model request', 'MODEL_INPUT_INVALID');
  }
  if (systemPrompt.length + userPrompt.length > MAX_PROMPT_CHARACTERS) {
    throw new ModelAdapterError('Model request is too large', 'MODEL_INPUT_TOO_LARGE');
  }
}

class OllamaModelAdapter {
  constructor({ fetchImpl = global.fetch, config = env } = {}) {
    validateAdapterConfig(config);
    if (typeof fetchImpl !== 'function') throw new Error('Fetch implementation is required');
    this.fetchImpl = fetchImpl;
    this.config = config;
  }

  async generate({ systemPrompt, userPrompt }) {
    validatePrompts(systemPrompt, userPrompt);
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.config.OLLAMA_TIMEOUT_MS);
    try {
      let response;
      try {
        response = await this.fetchImpl(`${this.config.OLLAMA_BASE_URL}/api/generate`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ model: this.config.OLLAMA_MODEL, system: systemPrompt, prompt: userPrompt, stream: false, options: { num_predict: this.config.OLLAMA_OUTPUT_TOKENS } }),
          signal: controller.signal,
        });
      } catch (error) {
        if (error?.name === 'AbortError') throw new ModelAdapterError('Model request timed out', 'MODEL_TIMEOUT');
        throw new ModelAdapterError('Model service is unavailable', 'MODEL_UNAVAILABLE');
      }
      if (!response?.ok) throw new ModelAdapterError('Model service returned an error', 'MODEL_SERVICE_ERROR');
      let payload;
      try { payload = await response.json(); } catch { throw new ModelAdapterError('Model service returned an invalid response', 'MODEL_RESPONSE_INVALID'); }
      if (!payload || typeof payload.response !== 'string' || !payload.response.trim() || payload.response.length > MAX_RESPONSE_CHARACTERS) {
        throw new ModelAdapterError('Model service returned an invalid response', 'MODEL_RESPONSE_INVALID');
      }
      return { text: payload.response.trim() };
    } finally {
      clearTimeout(timeout);
    }
  }
}

module.exports = { OllamaModelAdapter, ModelAdapterError, validateAdapterConfig, MAX_PROMPT_CHARACTERS, MAX_RESPONSE_CHARACTERS };
