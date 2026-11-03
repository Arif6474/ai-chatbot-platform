const request = require('supertest');
const mongoose = require('mongoose');
const { MongoMemoryServer } = require('mongodb-memory-server');
const app = require('../src/app');
const Tenant = require('../src/models/Tenant');
const ChatbotConfiguration = require('../src/models/ChatbotConfiguration');
const ChatSession = require('../src/models/ChatSession');
const BusinessContent = require('../src/models/BusinessContent');
const { TenantCacheService, defaultTenantCache } = require('../src/services/tenantCacheService');
const { OllamaModelAdapter } = require('../src/services/ollamaModelAdapter');

let mongoServer;
let tenantA;
let tenantB;

beforeAll(async () => {
  mongoServer = await MongoMemoryServer.create();
  await mongoose.connect(mongoServer.getUri());
});

afterAll(async () => {
  await mongoose.disconnect();
  await mongoServer?.stop();
});

beforeEach(async () => {
  defaultTenantCache.clear();
  await Promise.all([
    Tenant.deleteMany({}),
    ChatbotConfiguration.deleteMany({}),
    ChatSession.deleteMany({}),
    BusinessContent.deleteMany({}),
  ]);

  tenantA = await Tenant.create({
    name: 'Tenant Alpha',
    slug: 'tenant-alpha',
    status: 'active',
  });

  await ChatbotConfiguration.create({
    tenantId: tenantA._id,
    displayName: 'Alpha Bot',
    welcomeMessage: 'Welcome to Alpha',
    enabled: true,
  });

  await BusinessContent.create({
    tenantId: tenantA._id,
    title: 'Alpha Hours',
    body: 'Open 9am to 5pm.',
    status: 'published',
  });

  tenantB = await Tenant.create({
    name: 'Tenant Beta',
    slug: 'tenant-beta',
    status: 'active',
  });

  await ChatbotConfiguration.create({
    tenantId: tenantB._id,
    displayName: 'Beta Bot',
    welcomeMessage: 'Welcome to Beta',
    enabled: true,
  });
});

describe('TenantCacheService Unit Tests', () => {
  it('returns fresh data on cache miss and fromCache: true on subsequent read', async () => {
    const cache = new TenantCacheService({ ttlMs: 1000 });

    const first = await cache.getTenantAndConfig('tenant-alpha');
    expect(first.fromCache).toBe(false);
    expect(first.tenant.name).toBe('Tenant Alpha');
    expect(first.config.displayName).toBe('Alpha Bot');

    const second = await cache.getTenantAndConfig('tenant-alpha');
    expect(second.fromCache).toBe(true);
    expect(second.tenant.name).toBe('Tenant Alpha');
    expect(second.config.displayName).toBe('Alpha Bot');
  });

  it('guarantees tenant isolation: entries for different tenants do not conflict', async () => {
    const cache = new TenantCacheService({ ttlMs: 1000 });

    const resA = await cache.getTenantAndConfig('tenant-alpha');
    const resB = await cache.getTenantAndConfig('tenant-beta');

    expect(resA.tenant.slug).toBe('tenant-alpha');
    expect(resA.config.displayName).toBe('Alpha Bot');

    expect(resB.tenant.slug).toBe('tenant-beta');
    expect(resB.config.displayName).toBe('Beta Bot');

    // Frozen / cloned copies: mutations do not leak
    expect(() => {
      'use strict';
      resA.tenant.name = 'Mutated';
    }).toThrow();

    const freshRead = await cache.getTenantAndConfig('tenant-alpha');
    expect(freshRead.tenant.name).toBe('Tenant Alpha');
  });

  it('handles negative caching for non-existent tenants', async () => {
    const cache = new TenantCacheService({ ttlMs: 1000, negativeTtlMs: 500 });

    const first = await cache.getTenantAndConfig('non-existent');
    expect(first.tenant).toBeNull();
    expect(first.config).toBeNull();
    expect(first.fromCache).toBe(false);

    const second = await cache.getTenantAndConfig('non-existent');
    expect(second.tenant).toBeNull();
    expect(second.config).toBeNull();
    expect(second.fromCache).toBe(true); // Served from negative cache
    expect(cache.getStats().misses).toBe(1);
    expect(cache.getStats().hits).toBe(1);
  });

  it('expires cache entries after TTL', async () => {
    const cache = new TenantCacheService({ ttlMs: 50 }); // 50ms TTL

    const first = await cache.getTenantAndConfig('tenant-alpha');
    expect(first.fromCache).toBe(false);

    // Wait for TTL expiration
    await new Promise((r) => setTimeout(r, 60));

    const second = await cache.getTenantAndConfig('tenant-alpha');
    expect(second.fromCache).toBe(false);
    expect(cache.getStats().misses).toBe(2);
  });

  it('invalidates cache entry by slug', async () => {
    const cache = new TenantCacheService({ ttlMs: 5000 });

    await cache.getTenantAndConfig('tenant-alpha');
    expect(cache.getStats().size).toBe(1);

    const invalidated = cache.invalidateSlug('tenant-alpha');
    expect(invalidated).toBe(true);
    expect(cache.getStats().size).toBe(0);

    const next = await cache.getTenantAndConfig('tenant-alpha');
    expect(next.fromCache).toBe(false);
  });

  it('invalidates cache entry by tenantId', async () => {
    const cache = new TenantCacheService({ ttlMs: 5000 });

    await cache.getTenantAndConfig('tenant-alpha');
    expect(cache.getStats().size).toBe(1);

    const invalidated = cache.invalidateTenantId(tenantA._id);
    expect(invalidated).toBe(true);
    expect(cache.getStats().size).toBe(0);
  });

  it('re-throws database error on cache miss without caching broken state', async () => {
    const cache = new TenantCacheService();
    const findOneSpy = jest.spyOn(Tenant, 'findOne').mockImplementationOnce(() => {
      throw new Error('MongoDB network partition');
    });

    await expect(cache.getTenantAndConfig('tenant-alpha')).rejects.toThrow('MongoDB network partition');
    findOneSpy.mockRestore();

    // Cache should remain empty
    expect(cache.getStats().size).toBe(0);
  });
});

describe('Public Chat API Integration with In-Memory Cache', () => {
  it('serves public configuration from cache on warm requests', async () => {
    const res1 = await request(app).get('/api/v1/public/chat/tenant-alpha/config');
    expect(res1.status).toBe(200);
    expect(res1.body.data.displayName).toBe('Alpha Bot');

    // Second call hits cache
    const res2 = await request(app).get('/api/v1/public/chat/tenant-alpha/config');
    expect(res2.status).toBe(200);
    expect(res2.body.data.displayName).toBe('Alpha Bot');
  });

  it('supports session continuity with parallelized retrieval', async () => {
    const generateSpy = jest
      .spyOn(OllamaModelAdapter.prototype, 'generate')
      .mockResolvedValue({
        text: 'Alpha Dental opens 9am to 5pm.',
        metadata: { model: 'qwen2.5:3b' },
      });

    // 1. Initial message creates a new session
    const res1 = await request(app)
      .post('/api/v1/public/chat/tenant-alpha/message')
      .send({ message: 'What are your hours?' });

    expect(res1.status).toBe(200);
    expect(res1.body.success).toBe(true);
    const token = res1.body.data.sessionToken;
    expect(token).toBeDefined();

    // Check session in DB
    const session1 = await ChatSession.findOne({ sessionToken: token });
    expect(session1.messageCount).toBe(1);

    // 2. Follow-up message on same session
    const res2 = await request(app)
      .post('/api/v1/public/chat/tenant-alpha/message')
      .send({ sessionToken: token, message: 'Are you open weekends?' });

    expect(res2.status).toBe(200);
    expect(res2.body.data.sessionToken).toBe(token);

    const session2 = await ChatSession.findOne({ sessionToken: token });
    expect(session2.messageCount).toBe(2);

    generateSpy.mockRestore();
  });

  it('returns 404 for invalid/unknown session token on existing tenant', async () => {
    const fakeToken = '1234567890abcdef1234567890abcdef1234567890abcdef';
    const res = await request(app)
      .post('/api/v1/public/chat/tenant-alpha/message')
      .send({ sessionToken: fakeToken, message: 'Hello' });

    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe('SESSION_NOT_FOUND');
  });

  it('rejects malformed tenant slugs without hitting cache or database', async () => {
    const res = await request(app)
      .post('/api/v1/public/chat/INVALID_SLUG!/message')
      .send({ message: 'Hello' });

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('INVALID_TENANT_SLUG');
  });

  it('returns 403 when tenant is inactive (even if cached)', async () => {
    await Tenant.updateOne({ _id: tenantA._id }, { status: 'inactive' });

    const res = await request(app)
      .post('/api/v1/public/chat/tenant-alpha/message')
      .send({ message: 'Hello' });

    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe('TENANT_INACTIVE');
  });

  it('returns 403 when chatbot is disabled (even after config change)', async () => {
    await ChatbotConfiguration.updateOne({ tenantId: tenantA._id }, { enabled: false });

    const res = await request(app)
      .post('/api/v1/public/chat/tenant-alpha/message')
      .send({ message: 'Hello' });

    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe('CHATBOT_DISABLED');
  });
});
