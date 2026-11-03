const Tenant = require('../models/Tenant');
const ChatbotConfiguration = require('../models/ChatbotConfiguration');

const DEFAULT_TTL_MS = 60 * 1000; // 60 seconds short-TTL
const DEFAULT_NEGATIVE_TTL_MS = 10 * 1000; // 10 seconds for non-existent tenants

class TenantCacheService {
  constructor(options = {}) {
    this.ttlMs = options.ttlMs !== undefined ? options.ttlMs : DEFAULT_TTL_MS;
    this.negativeTtlMs = options.negativeTtlMs !== undefined ? options.negativeTtlMs : DEFAULT_NEGATIVE_TTL_MS;
    this.cache = new Map();
    this.idToSlug = new Map();
    this.stats = {
      hits: 0,
      misses: 0,
      sets: 0,
      invalidations: 0,
    };
  }

  _normalizeSlug(slug) {
    if (!slug || typeof slug !== 'string') return '';
    return slug.toLowerCase().trim();
  }

  /**
   * Deep clone a plain object/lean document to prevent cross-tenant or caller mutation
   */
  _safeClone(obj) {
    if (!obj) return null;
    return Object.freeze(JSON.parse(JSON.stringify(obj)));
  }

  /**
   * Get cached tenant and configuration by tenantSlug.
   * On cache miss, queries Tenant and ChatbotConfiguration from MongoDB.
   *
   * @param {string} slug
   * @returns {Promise<{ tenant: object|null, config: object|null, fromCache: boolean }>}
   */
  async getTenantAndConfig(slug) {
    const normalizedSlug = this._normalizeSlug(slug);
    if (!normalizedSlug) {
      return { tenant: null, config: null, fromCache: false };
    }

    const now = Date.now();
    const existing = this.cache.get(normalizedSlug);

    if (existing) {
      if (now < existing.expiresAt) {
        this.stats.hits++;
        return {
          tenant: this._safeClone(existing.tenant),
          config: this._safeClone(existing.config),
          fromCache: true,
        };
      }
      // Expired
      this.cache.delete(normalizedSlug);
      if (existing.tenant?._id) {
        this.idToSlug.delete(existing.tenant._id.toString());
      }
    }

    this.stats.misses++;

    // Fetch tenant from MongoDB
    const tenant = await Tenant.findOne({ slug: normalizedSlug }).lean();

    if (!tenant) {
      // Store negative cache entry to guard against repeated 404 queries
      this.cache.set(normalizedSlug, {
        tenant: null,
        config: null,
        expiresAt: now + this.negativeTtlMs,
      });
      return { tenant: null, config: null, fromCache: false };
    }

    // Fetch chatbot configuration for this tenant
    const config = await ChatbotConfiguration.findOne({ tenantId: tenant._id }).lean();

    // Cache the resolved tenant and config
    this.cache.set(normalizedSlug, {
      tenant,
      config,
      expiresAt: now + this.ttlMs,
    });
    this.idToSlug.set(tenant._id.toString(), normalizedSlug);
    this.stats.sets++;

    return {
      tenant: this._safeClone(tenant),
      config: this._safeClone(config),
      fromCache: false,
    };
  }

  /**
   * Invalidate cache entry by slug
   */
  invalidateSlug(slug) {
    const normalizedSlug = this._normalizeSlug(slug);
    if (!normalizedSlug) return false;

    const existing = this.cache.get(normalizedSlug);
    if (existing) {
      if (existing.tenant?._id) {
        this.idToSlug.delete(existing.tenant._id.toString());
      }
      this.cache.delete(normalizedSlug);
      this.stats.invalidations++;
      return true;
    }
    return false;
  }

  /**
   * Invalidate cache entry by tenantId
   */
  invalidateTenantId(tenantId) {
    if (!tenantId) return false;
    const idStr = tenantId.toString();
    const slug = this.idToSlug.get(idStr);

    if (slug) {
      this.idToSlug.delete(idStr);
      this.cache.delete(slug);
      this.stats.invalidations++;
      return true;
    }

    // Fallback scan in case idToSlug wasn't populated
    for (const [s, entry] of this.cache.entries()) {
      if (entry.tenant?._id && entry.tenant._id.toString() === idStr) {
        this.cache.delete(s);
        this.idToSlug.delete(idStr);
        this.stats.invalidations++;
        return true;
      }
    }

    return false;
  }

  /**
   * Clear entire cache
   */
  clear() {
    this.cache.clear();
    this.idToSlug.clear();
  }

  /**
   * Retrieve current cache statistics
   */
  getStats() {
    return {
      ...this.stats,
      size: this.cache.size,
    };
  }
}

const defaultTenantCache = new TenantCacheService();

module.exports = {
  TenantCacheService,
  defaultTenantCache,
  DEFAULT_TTL_MS,
  DEFAULT_NEGATIVE_TTL_MS,
};
