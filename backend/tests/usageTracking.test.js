const request = require('supertest');
const mongoose = require('mongoose');
const { MongoMemoryServer } = require('mongodb-memory-server');
const app = require('../src/app');
const AdminUser = require('../src/models/AdminUser');
const Tenant = require('../src/models/Tenant');
const ChatbotConfiguration = require('../src/models/ChatbotConfiguration');
const ChatSession = require('../src/models/ChatSession');
const TenantDailyUsage = require('../src/models/TenantDailyUsage');
const env = require('../src/config/env');
const { signAdminToken } = require('../src/services/tokenService');
const {
  recordUsageEvent,
  resolveDateRange,
  getPlatformUsageSummary,
  getTenantUsageSummary,
} = require('../src/services/usageTrackingService');
const { OllamaModelAdapter, ModelAdapterError } = require('../src/services/ollamaModelAdapter');

let mongoServer;
let cookie;
let tenant;
let otherTenant;

const platformUsagePath = '/api/v1/admin/analytics/usage';
const tenantUsagePath = (tenantId) => `/api/v1/admin/tenants/${tenantId}/usage`;
const publicMessagePath = (slug) => `/api/v1/public/chat/${slug}/message`;

beforeAll(async () => {
  mongoServer = await MongoMemoryServer.create();
  await mongoose.connect(mongoServer.getUri());
});

afterAll(async () => {
  await mongoose.disconnect();
  await mongoServer?.stop();
});

beforeEach(async () => {
  await Promise.all([
    AdminUser.deleteMany({}),
    Tenant.deleteMany({}),
    ChatbotConfiguration.deleteMany({}),
    ChatSession.deleteMany({}),
    TenantDailyUsage.deleteMany({}),
  ]);

  const passwordHash = await AdminUser.hashPassword('AdminPassword123!');
  const admin = await AdminUser.create({
    email: 'analytics-admin@platform.test',
    passwordHash,
    role: 'admin',
    status: 'active',
  });

  cookie = `${env.ADMIN_COOKIE_NAME}=${signAdminToken(admin)}`;

  tenant = await Tenant.create({
    name: 'Smile Dental Clinic',
    slug: 'smile-dental',
    status: 'active',
  });

  otherTenant = await Tenant.create({
    name: 'Metro Legal Advisors',
    slug: 'metro-legal',
    status: 'active',
  });

  await ChatbotConfiguration.create({
    tenantId: tenant._id,
    displayName: 'Smile Assistant',
    welcomeMessage: 'Welcome to Smile Dental!',
    enabled: true,
    fallbackMessage: 'Dental service unavailable; call us directly.',
  });

  await ChatbotConfiguration.create({
    tenantId: otherTenant._id,
    displayName: 'Legal Assistant',
    welcomeMessage: 'Welcome to Metro Legal!',
    enabled: true,
    fallbackMessage: 'Legal assistant unavailable.',
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 1. Service-Level Unit & Concurrency Tests
// ─────────────────────────────────────────────────────────────────────────────
describe('Usage Tracking Service', () => {
  it('records events atomically and upserts daily records', async () => {
    const today = '2026-10-24';
    await recordUsageEvent({ tenantId: tenant._id, eventType: 'successfulResponse', date: today });
    await recordUsageEvent({ tenantId: tenant._id, eventType: 'successfulResponse', date: today });
    await recordUsageEvent({ tenantId: tenant._id, eventType: 'fallbackResponse', date: today });
    await recordUsageEvent({ tenantId: tenant._id, eventType: 'newSession', date: today });

    const record = await TenantDailyUsage.findOne({ tenantId: tenant._id, date: today });
    expect(record).not.toBeNull();
    expect(record.successfulResponses).toBe(2);
    expect(record.fallbackResponses).toBe(1);
    expect(record.newSessions).toBe(1);
  });

  it('handles concurrent updates safely without race conditions or lost increments', async () => {
    const today = '2026-10-24';
    const concurrentRequests = 25;

    await Promise.all(
      Array.from({ length: concurrentRequests }).map(() =>
        recordUsageEvent({ tenantId: tenant._id, eventType: 'successfulResponse', date: today })
      )
    );

    const record = await TenantDailyUsage.findOne({ tenantId: tenant._id, date: today });
    expect(record.successfulResponses).toBe(concurrentRequests);
  });

  it('safely handles E11000 duplicate-key collisions on first-time upserts and retries', async () => {
    const today = '2026-10-25';

    // Simulate an E11000 collision on the initial upsert attempt
    let firstCall = true;
    const originalUpdateOne = TenantDailyUsage.updateOne.bind(TenantDailyUsage);
    jest.spyOn(TenantDailyUsage, 'updateOne').mockImplementation(async (filter, update, options) => {
      if (firstCall && options?.upsert) {
        firstCall = false;
        // First concurrent worker actually inserts the document in DB
        await originalUpdateOne(filter, { $inc: { successfulResponses: 1 } }, { upsert: true });
        // Second concurrent worker receives E11000 from MongoDB
        const err = new Error('E11000 duplicate key error collection: tenantdailyusages index: tenantId_1_date_1 dup key');
        err.code = 11000;
        throw err;
      }
      return originalUpdateOne(filter, update, options);
    });

    // This call will hit the simulated E11000 error, catch it, and retry the update
    await recordUsageEvent({ tenantId: tenant._id, eventType: 'successfulResponse', date: today });

    TenantDailyUsage.updateOne.mockRestore();

    // The document should have both increments (1 from the winner + 1 from the retried request = 2)
    const record = await TenantDailyUsage.findOne({ tenantId: tenant._id, date: today });
    expect(record).not.toBeNull();
    expect(record.successfulResponses).toBe(2);
  });

  it('resolves valid date ranges and rejects malformed, impossible calendar dates, or reversed dates', () => {
    expect(() => resolveDateRange({ startDate: '2026-10-30', endDate: '2026-10-20' })).toThrow(
      /startDate cannot be after endDate/i
    );
    expect(() => resolveDateRange({ startDate: 'not-a-date' })).toThrow(/YYYY-MM-DD/);
    expect(() => resolveDateRange({ startDate: '2026-02-31' })).toThrow(/valid date/);
    expect(() => resolveDateRange({ endDate: '2026-13-45' })).toThrow(/valid date/);
    expect(() => resolveDateRange({ period: 'invalid_period' })).toThrow(/must be one of/);

    const range7d = resolveDateRange({ period: '7d' });
    expect(range7d).toHaveProperty('startDate');
    expect(range7d).toHaveProperty('endDate');
    expect(range7d.startDate <= range7d.endDate).toBe(true);
  });

  it('gives precedence to custom dates over period parameter', () => {
    const custom = resolveDateRange({ period: '7d', startDate: '2026-09-01', endDate: '2026-09-15' });
    expect(custom.startDate).toBe('2026-09-01');
    expect(custom.endDate).toBe('2026-09-15');
  });

  it('handles future date ranges and zero-activity ranges with 0% fallback rate', async () => {
    const futureSummary = await getTenantUsageSummary(tenant._id, {
      startDate: '2099-01-01',
      endDate: '2099-01-05',
    });
    expect(futureSummary.totals.totalResponses).toBe(0);
    expect(futureSummary.totals.successfulResponses).toBe(0);
    expect(futureSummary.totals.fallbackResponses).toBe(0);
    expect(futureSummary.totals.fallbackRate).toBe(0);
    expect(futureSummary.dailyTrends).toEqual([]);
  });

  it('handles tenants with zero usage cleanly without NaN or division by zero', async () => {
    const emptySummary = await getTenantUsageSummary(otherTenant._id, { period: '30d' });
    expect(emptySummary.totals.totalResponses).toBe(0);
    expect(emptySummary.totals.fallbackRate).toBe(0);
    expect(emptySummary.totals.lifetimeSessions).toBe(0);
  });

  it('aggregates platform and tenant metrics correctly with fallback rates', async () => {
    const d1 = '2026-10-20';
    const d2 = '2026-10-21';

    await recordUsageEvent({ tenantId: tenant._id, eventType: 'successfulResponse', count: 10, date: d1 });
    await recordUsageEvent({ tenantId: tenant._id, eventType: 'fallbackResponse', count: 2, date: d1 });
    await recordUsageEvent({ tenantId: otherTenant._id, eventType: 'successfulResponse', count: 5, date: d2 });

    const tenantSummary = await getTenantUsageSummary(tenant._id, { startDate: d1, endDate: d2 });
    expect(tenantSummary.totals.successfulResponses).toBe(10);
    expect(tenantSummary.totals.fallbackResponses).toBe(2);
    expect(tenantSummary.totals.totalResponses).toBe(12);
    expect(tenantSummary.totals.fallbackRate).toBe(16.67);

    const platformSummary = await getPlatformUsageSummary({ startDate: d1, endDate: d2 });
    expect(platformSummary.totals.successfulResponses).toBe(15);
    expect(platformSummary.totals.fallbackResponses).toBe(2);
    expect(platformSummary.totals.totalResponses).toBe(17);
    expect(platformSummary.tenantBreakdown).toHaveLength(2);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 2. Integration with Public Chat Workflow
// ─────────────────────────────────────────────────────────────────────────────
describe('Public Chat Usage Tracking Integration', () => {
  it('increments successfulResponses and newSessions on successful chat generation', async () => {
    const generateSpy = jest
      .spyOn(OllamaModelAdapter.prototype, 'generate')
      .mockResolvedValueOnce({
        text: 'We are open Monday to Friday 9am to 5pm.',
        metadata: { model: 'llama3:8b' },
      });

    const res = await request(app)
      .post(publicMessagePath('smile-dental'))
      .send({ message: 'What are your hours?' });

    generateSpy.mockRestore();

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);

    const usageRecord = await TenantDailyUsage.findOne({ tenantId: tenant._id });
    expect(usageRecord).not.toBeNull();
    expect(usageRecord.successfulResponses).toBe(1);
    expect(usageRecord.fallbackResponses).toBe(0);
    expect(usageRecord.newSessions).toBe(1);
  });

  it('increments fallbackResponses on model failure without counting as successful', async () => {
    const generateSpy = jest
      .spyOn(OllamaModelAdapter.prototype, 'generate')
      .mockRejectedValueOnce(new ModelAdapterError('Ollama offline'));

    const res = await request(app)
      .post(publicMessagePath('smile-dental'))
      .send({ message: 'Can I book an appointment?' });

    generateSpy.mockRestore();

    expect(res.status).toBe(200);
    expect(res.body.data.fallbackApplied).toBe(true);

    const usageRecord = await TenantDailyUsage.findOne({ tenantId: tenant._id });
    expect(usageRecord).not.toBeNull();
    expect(usageRecord.successfulResponses).toBe(0); // MUST NOT count as success
    expect(usageRecord.fallbackResponses).toBe(1); // MUST count as fallback
  });

  it('does NOT increment usage when request is rejected for validation or inactive tenant', async () => {
    // 1. Validation failure: empty message
    const badRes = await request(app)
      .post(publicMessagePath('smile-dental'))
      .send({ message: '' });
    expect(badRes.status).toBe(400);

    // 2. Inactive tenant
    await Tenant.updateOne({ _id: tenant._id }, { status: 'inactive' });
    const inactiveRes = await request(app)
      .post(publicMessagePath('smile-dental'))
      .send({ message: 'Hello' });
    expect(inactiveRes.status).toBe(403);

    // No usage document should exist
    const count = await TenantDailyUsage.countDocuments({ tenantId: tenant._id });
    expect(count).toBe(0);
  });

  it('ensures analytics recording failure does NOT turn a generated response into a 500 error', async () => {
    const generateSpy = jest
      .spyOn(OllamaModelAdapter.prototype, 'generate')
      .mockResolvedValueOnce({
        text: 'Our clinic is open for emergencies.',
        metadata: { model: 'llama3:8b' },
      });

    // Mock recordUsageEvent to fail with an unhandled DB error
    const updateSpy = jest.spyOn(TenantDailyUsage, 'updateOne').mockRejectedValue(new Error('Mongo network timeout'));

    const res = await request(app)
      .post(publicMessagePath('smile-dental'))
      .send({ message: 'Are you open?' });

    generateSpy.mockRestore();
    updateSpy.mockRestore();

    // The chat client MUST still receive the generated response successfully
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.response).toBe('Our clinic is open for emergencies.');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 3. Admin Analytics Endpoints & Privacy Verification
// ─────────────────────────────────────────────────────────────────────────────
describe('Admin Analytics API Endpoints', () => {
  beforeEach(async () => {
    const today = '2026-10-24';
    await recordUsageEvent({ tenantId: tenant._id, eventType: 'successfulResponse', count: 8, date: today });
    await recordUsageEvent({ tenantId: tenant._id, eventType: 'fallbackResponse', count: 1, date: today });
    await recordUsageEvent({ tenantId: tenant._id, eventType: 'newSession', count: 4, date: today });

    await recordUsageEvent({ tenantId: otherTenant._id, eventType: 'successfulResponse', count: 12, date: today });
    await recordUsageEvent({ tenantId: otherTenant._id, eventType: 'newSession', count: 6, date: today });
  });

  it('requires admin authentication for analytics routes', async () => {
    const unauthPlatform = await request(app).get(platformUsagePath);
    const unauthTenant = await request(app).get(tenantUsagePath(tenant.id));

    expect(unauthPlatform.status).toBe(401);
    expect(unauthTenant.status).toBe(401);
  });

  it('returns aggregated platform-wide usage metrics with period filters', async () => {
    const res = await request(app)
      .get(`${platformUsagePath}?period=30d`)
      .set('Cookie', cookie);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.totals).toMatchObject({
      totalTenants: 2,
      successfulResponses: 20,
      fallbackResponses: 1,
      totalResponses: 21,
    });
    expect(res.body.data.dailyTrends).toBeInstanceOf(Array);
    expect(res.body.data.tenantBreakdown).toHaveLength(2);
  });

  it('returns tenant-scoped usage metrics and enforces tenant isolation', async () => {
    const res = await request(app)
      .get(tenantUsagePath(tenant.id))
      .set('Cookie', cookie);

    expect(res.status).toBe(200);
    expect(res.body.data.tenant.name).toBe('Smile Dental Clinic');
    expect(res.body.data.totals.successfulResponses).toBe(8);
    expect(res.body.data.totals.fallbackResponses).toBe(1);

    // Verify otherTenant's numbers are completely excluded from this tenant's totals
    expect(res.body.data.totals.successfulResponses).not.toBe(20);
  });

  it('rejects invalid tenant IDs and nonexistent tenants', async () => {
    const badIdRes = await request(app)
      .get(tenantUsagePath('invalid-id'))
      .set('Cookie', cookie);
    expect(badIdRes.status).toBe(400);
    expect(badIdRes.body.error.code).toBe('INVALID_ID');

    const nonExistentRes = await request(app)
      .get(tenantUsagePath(new mongoose.Types.ObjectId().toString()))
      .set('Cookie', cookie);
    expect(nonExistentRes.status).toBe(404);
    expect(nonExistentRes.body.error.code).toBe('TENANT_NOT_FOUND');
  });

  it('rejects invalid query date filters with 400', async () => {
    const badDateRes = await request(app)
      .get(`${platformUsagePath}?startDate=2026/10/24`)
      .set('Cookie', cookie);
    expect(badDateRes.status).toBe(400);

    const impossibleDateRes = await request(app)
      .get(`${platformUsagePath}?startDate=2026-02-31`)
      .set('Cookie', cookie);
    expect(impossibleDateRes.status).toBe(400);
    expect(impossibleDateRes.body.error.code).toBe('INVALID_DATE');

    const reversedDateRes = await request(app)
      .get(`${platformUsagePath}?startDate=2026-10-30&endDate=2026-10-01`)
      .set('Cookie', cookie);
    expect(reversedDateRes.status).toBe(400);
  });

  it('rejects unsupported or oversized query parameters with 400', async () => {
    const unsupportedParamRes = await request(app)
      .get(`${platformUsagePath}?unknownParam=injection`)
      .set('Cookie', cookie);
    expect(unsupportedParamRes.status).toBe(400);
    expect(unsupportedParamRes.body.error.code).toBe('UNSUPPORTED_PARAMETER');

    const oversizedParamRes = await request(app)
      .get(`${platformUsagePath}?period=thisiswaytoolongtobevalid`)
      .set('Cookie', cookie);
    expect(oversizedParamRes.status).toBe(400);
    expect(oversizedParamRes.body.error.code).toBe('INVALID_PARAMETER');
  });

  it('ensures zero PII, customer prompts, or session tokens in analytics responses', async () => {
    const res = await request(app)
      .get(platformUsagePath)
      .set('Cookie', cookie);

    const rawJson = JSON.stringify(res.body);
    expect(rawJson).not.toMatch(/sessionToken/i);
    expect(rawJson).not.toMatch(/prompt/i);
    expect(rawJson).not.toMatch(/message/i);
    expect(rawJson).not.toMatch(/email/i);
    expect(rawJson).not.toMatch(/phone/i);
  });
});
