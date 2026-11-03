const env = require('../config/env');

/**
 * Custom error thrown when the in-process inference capacity or queue is exhausted.
 * HTTP 503 Service Unavailable indicates temporary server overload.
 */
class InferenceCapacityError extends Error {
  constructor(
    message = 'AI assistant is currently at maximum capacity. Please try again shortly.',
    code = 'INFERENCE_CAPACITY_EXCEEDED',
    statusCode = 503
  ) {
    super(message);
    this.name = 'InferenceCapacityError';
    this.code = code;
    this.statusCode = statusCode;
  }
}

/**
 * In-Process Inference Concurrency Manager
 *
 * NOTE: This concurrency limit applies per Node.js process. It manages local CPU/Ollama
 * inference workload within a single server instance. In a multi-process or clustered
 * deployment, each process independently enforces its configured capacity.
 */
class InferenceConcurrencyManager {
  /**
   * @param {Object} [options]
   * @param {number} [options.maxConcurrency] - Maximum active inferences per Node.js process
   * @param {number} [options.maxQueueSize] - Maximum waiting requests in queue
   * @param {number} [options.queueTimeoutMs] - Maximum time (ms) a request can wait in queue
   */
  constructor({
    maxConcurrency = env.OLLAMA_MAX_CONCURRENCY || 1,
    maxQueueSize = env.OLLAMA_MAX_QUEUE_SIZE !== undefined ? env.OLLAMA_MAX_QUEUE_SIZE : 5,
    queueTimeoutMs = 30000,
  } = {}) {
    this.maxConcurrency = Math.max(1, maxConcurrency);
    this.maxQueueSize = Math.max(0, maxQueueSize);
    this.queueTimeoutMs = queueTimeoutMs;
    this.activeCount = 0;
    this.queue = [];
  }

  get stats() {
    return {
      activeCount: this.activeCount,
      queueLength: this.queue.length,
      maxConcurrency: this.maxConcurrency,
      maxQueueSize: this.maxQueueSize,
    };
  }

  /**
   * Acquire a concurrency slot for inference.
   * Returns a release function that MUST be invoked in a `finally` block.
   * If capacity is exhausted, immediately throws InferenceCapacityError (503).
   *
   * @returns {Promise<() => void>} release function
   */
  async acquire() {
    if (this.activeCount < this.maxConcurrency) {
      this.activeCount++;
      return this._createRelease();
    }

    if (this.queue.length >= this.maxQueueSize) {
      throw new InferenceCapacityError(
        'AI assistant is currently at maximum capacity. Please try again shortly.',
        'INFERENCE_CAPACITY_EXCEEDED',
        503
      );
    }

    return new Promise((resolve, reject) => {
      let timer = null;
      const queueItem = { resolve, reject };

      if (this.queueTimeoutMs > 0) {
        timer = setTimeout(() => {
          const idx = this.queue.indexOf(queueItem);
          if (idx !== -1) {
            this.queue.splice(idx, 1);
          }
          reject(
            new InferenceCapacityError(
              'Request timed out while waiting for inference capacity.',
              'INFERENCE_QUEUE_TIMEOUT',
              503
            )
          );
        }, this.queueTimeoutMs);
      }

      queueItem.timer = timer;
      this.queue.push(queueItem);
    });
  }

  _createRelease() {
    let released = false;
    return () => {
      if (released) return;
      released = true;

      if (this.queue.length > 0) {
        const next = this.queue.shift();
        if (next.timer) {
          clearTimeout(next.timer);
        }
        // Promote next queued item; activeCount remains unchanged
        next.resolve(this._createRelease());
      } else {
        this.activeCount = Math.max(0, this.activeCount - 1);
      }
    };
  }

  /**
   * Drain any queued items and reset active counters (primarily for tests)
   */
  reset() {
    this.queue.forEach((item) => {
      if (item.timer) clearTimeout(item.timer);
      item.reject(new InferenceCapacityError('Manager reset', 'INFERENCE_MANAGER_RESET', 503));
    });
    this.queue = [];
    this.activeCount = 0;
  }
}

// Default singleton instance for the Node.js process
const defaultConcurrencyManager = new InferenceConcurrencyManager();

module.exports = {
  InferenceConcurrencyManager,
  InferenceCapacityError,
  defaultConcurrencyManager,
};
