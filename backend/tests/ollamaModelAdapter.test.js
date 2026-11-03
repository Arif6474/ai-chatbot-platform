const { OllamaModelAdapter, ModelAdapterError, validateAdapterConfig, MAX_PROMPT_CHARACTERS, MAX_RESPONSE_CHARACTERS } = require('../src/services/ollamaModelAdapter');

const config = { OLLAMA_BASE_URL: 'http://127.0.0.1:11434', OLLAMA_MODEL: 'qwen2.5:3b', OLLAMA_TIMEOUT_MS: 1000, OLLAMA_OUTPUT_TOKENS: 100 };
const prompts = { systemPrompt: 'Use supplied facts only.', userPrompt: 'What are the opening hours?' };

describe('Ollama model adapter', () => {
  it('parses a successful provider response and sends bounded options', async () => {
    const fetchImpl = jest.fn().mockResolvedValue({ ok: true, json: async () => ({ response: ' Open Monday to Friday. ' }) });
    const adapter = new OllamaModelAdapter({ fetchImpl, config });
    await expect(adapter.generate(prompts)).resolves.toEqual({ text: 'Open Monday to Friday.' });
    expect(fetchImpl).toHaveBeenCalledWith(`${config.OLLAMA_BASE_URL}/api/generate`, expect.objectContaining({ method: 'POST' }));
    expect(JSON.parse(fetchImpl.mock.calls[0][1].body)).toMatchObject({ model: config.OLLAMA_MODEL, stream: false, options: { num_predict: 100, num_thread: 3 } });
  });

  it('respects explicitly configured OLLAMA_NUM_THREADS in generation options', async () => {
    const customConfig = { ...config, OLLAMA_NUM_THREADS: 4 };
    const fetchImpl = jest.fn().mockResolvedValue({ ok: true, json: async () => ({ response: 'Custom thread response.' }) });
    const adapter = new OllamaModelAdapter({ fetchImpl, config: customConfig });
    await adapter.generate(prompts);
    expect(JSON.parse(fetchImpl.mock.calls[0][1].body).options).toMatchObject({ num_predict: 100, num_thread: 4 });
  });

  it('returns safe error codes for timeout, connection, HTTP, and malformed responses', async () => {
    const timeout = new OllamaModelAdapter({ fetchImpl: jest.fn().mockRejectedValue(Object.assign(new Error('socket url'), { name: 'AbortError' })), config });
    await expect(timeout.generate(prompts)).rejects.toMatchObject({ code: 'MODEL_TIMEOUT' });
    const unavailable = new OllamaModelAdapter({ fetchImpl: jest.fn().mockRejectedValue(new Error('socket url')), config });
    await expect(unavailable.generate(prompts)).rejects.toMatchObject({ code: 'MODEL_UNAVAILABLE' });
    const httpError = new OllamaModelAdapter({ fetchImpl: jest.fn().mockResolvedValue({ ok: false, status: 500 }), config });
    await expect(httpError.generate(prompts)).rejects.toMatchObject({ code: 'MODEL_SERVICE_ERROR' });
    const malformed = new OllamaModelAdapter({ fetchImpl: jest.fn().mockResolvedValue({ ok: true, json: async () => ({ unexpected: true }) }), config });
    await expect(malformed.generate(prompts)).rejects.toMatchObject({ code: 'MODEL_RESPONSE_INVALID' });
  });

  it('rejects invalid or oversized inputs and provider output', async () => {
    const adapter = new OllamaModelAdapter({ fetchImpl: jest.fn(), config });
    await expect(adapter.generate({ systemPrompt: '', userPrompt: 'test' })).rejects.toMatchObject({ code: 'MODEL_INPUT_INVALID' });
    await expect(adapter.generate({ systemPrompt: 'x'.repeat(MAX_PROMPT_CHARACTERS), userPrompt: 'test' })).rejects.toMatchObject({ code: 'MODEL_INPUT_TOO_LARGE' });
    const oversized = new OllamaModelAdapter({ fetchImpl: jest.fn().mockResolvedValue({ ok: true, json: async () => ({ response: 'x'.repeat(MAX_RESPONSE_CHARACTERS + 1) }) }), config });
    await expect(oversized.generate(prompts)).rejects.toMatchObject({ code: 'MODEL_RESPONSE_INVALID' });
  });

  it('validates adapter configuration without exposing infrastructure errors', () => {
    expect(() => validateAdapterConfig({ ...config, OLLAMA_MODEL: '' })).toThrow(/Invalid Ollama adapter configuration/);
    expect(() => validateAdapterConfig({ ...config, OLLAMA_TIMEOUT_MS: 120001 })).toThrow(/Invalid Ollama timeout configuration/);
    expect(() => validateAdapterConfig({ ...config, OLLAMA_OUTPUT_TOKENS: 0 })).toThrow(/Invalid Ollama output token configuration/);
    expect(() => validateAdapterConfig({ ...config, OLLAMA_OUTPUT_TOKENS: 1025 })).toThrow(/Invalid Ollama output token configuration/);
    expect(() => validateAdapterConfig({ ...config, OLLAMA_NUM_THREADS: 0 })).toThrow(/Invalid Ollama thread configuration/);
    expect(() => validateAdapterConfig({ ...config, OLLAMA_NUM_THREADS: 65 })).toThrow(/Invalid Ollama thread configuration/);
    expect(() => validateAdapterConfig({ ...config, OLLAMA_NUM_THREADS: 'four' })).toThrow(/Invalid Ollama thread configuration/);
    expect(() => new OllamaModelAdapter({ fetchImpl: null, config })).toThrow(/Fetch implementation/);
    expect(new ModelAdapterError('Model service is unavailable', 'MODEL_UNAVAILABLE').message).not.toContain('127.0.0.1');
  });

  it('passes an abort signal and clears the timeout timer upon completion', async () => {
    const clearTimeoutSpy = jest.spyOn(global, 'clearTimeout');
    let capturedSignal;
    const fetchImpl = jest.fn().mockImplementation((url, options) => {
      capturedSignal = options.signal;
      return Promise.resolve({ ok: true, json: async () => ({ response: 'Valid answer.' }) });
    });
    const adapter = new OllamaModelAdapter({ fetchImpl, config });
    const result = await adapter.generate(prompts);
    expect(result).toEqual({ text: 'Valid answer.' });
    expect(capturedSignal).toBeDefined();
    expect(capturedSignal.aborted).toBe(false);
    expect(clearTimeoutSpy).toHaveBeenCalled();
    clearTimeoutSpy.mockRestore();
  });
});
