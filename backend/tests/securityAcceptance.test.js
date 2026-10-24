const request = require('supertest');
const mongoose = require('mongoose');
const { MongoMemoryServer } = require('mongodb-memory-server');
const app = require('../src/app');
const AdminUser = require('../src/models/AdminUser');
const Tenant = require('../src/models/Tenant');
const BusinessContent = require('../src/models/BusinessContent');
const ChatbotConfiguration = require('../src/models/ChatbotConfiguration');
const ChatSession = require('../src/models/ChatSession');
const Lead = require('../src/models/Lead');
const TenantDailyUsage = require('../src/models/TenantDailyUsage');
const env = require('../src/config/env');
const { signAdminToken } = require('../src/services/tokenService');
const { retrieveKnowledge } = require('../src/services/knowledgeRetrievalService');
const { OllamaModelAdapter, ModelAdapterError } = require('../src/services/ollamaModelAdapter');

let mongoServer;
let adminCookie;
let adminToken;
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
  await Promise.all([
    AdminUser.deleteMany({}),
    Tenant.deleteMany({}),
    BusinessContent.deleteMany({}),
    ChatbotConfiguration.deleteMany({}),
    ChatSession.deleteMany({}),
    Lead.deleteMany({}),
    TenantDailyUsage.deleteMany({}),
  ]);

  const passwordHash = await AdminUser.hashPassword('SuperAdminPass123!');
  const admin = await AdminUser.create({
    email: 'security-admin@platform.test',
    passwordHash,
    role: 'admin',
    status: 'active',
  });

  adminToken = signAdminToken(admin);
  adminCookie = `${env.ADMIN_COOKIE_NAME}=${adminToken}`;

  tenantA = await Tenant.create({
    name: 'Alpha Health Clinic',
    slug: 'alpha-health',
    status: 'active',
  });

  tenantB = await Tenant.create({
    name: 'Beta Legal Services',
    slug: 'beta-legal',
    status: 'active',
  });

  await ChatbotConfiguration.create({
    tenantId: tenantA._id,
    displayName: 'Alpha Bot',
    welcomeMessage: 'Welcome to Alpha Health',
    enabled: true,
    fallbackMessage: 'Alpha is temporarily unavailable. Please call us.',
  });

  await ChatbotConfiguration.create({
    tenantId: tenantB._id,
    displayName: 'Beta Bot',
    welcomeMessage: 'Welcome to Beta Legal',
    enabled: true,
    fallbackMessage: 'Beta is temporarily unavailable.',
  });
});

describe('Step 11 — Security Hardening and Acceptance Tests', () => {
  // ───────────────────────────────────────────────────────────────────────────
  // A. Authentication and Authorization
  // ───────────────────────────────────────────────────────────────────────────
  describe('A. Authentication & Authorization Security', () => {
    it('rejects unauthenticated requests to all admin endpoints with 401 UNAUTHORIZED', async () => {
      const endpoints = [
        ['get', '/api/v1/admin/tenants'],
        ['post', '/api/v1/admin/tenants'],
        ['get', `/api/v1/admin/tenants/${tenantA.id}/content`],
        ['post', `/api/v1/admin/tenants/${tenantA.id}/content`],
        ['get', `/api/v1/admin/tenants/${tenantA.id}/chatbot-configuration`],
        ['put', `/api/v1/admin/tenants/${tenantA.id}/chatbot-configuration`],
        ['get', `/api/v1/admin/tenants/${tenantA.id}/leads`],
        ['get', `/api/v1/admin/tenants/${tenantA.id}/usage`],
        ['get', '/api/v1/admin/analytics/usage'],
        ['get', '/api/v1/admin/auth/me'],
      ];

      for (const [method, path] of endpoints) {
        const res = await request(app)[method](path);
        expect(res.status).toBe(401);
        expect(res.body.success).toBe(false);
        expect(['UNAUTHORIZED', 'INVALID_TOKEN']).toContain(res.body.error.code);
      }
    });

    it('rejects deactivated administrator accounts even with an unexpired token', async () => {
      await AdminUser.updateOne({ email: 'security-admin@platform.test' }, { status: 'disabled' });

      const res = await request(app)
        .get('/api/v1/admin/auth/me')
        .set('Cookie', adminCookie);

      expect(res.status).toBe(401);
      expect(res.body.error.code).toBe('ACCOUNT_INACTIVE');
    });

    it('rejects tampered or forged JWT tokens with 401 INVALID_TOKEN', async () => {
      const tamperedCookie = `${env.ADMIN_COOKIE_NAME}=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.tampered.signature`;
      const res = await request(app)
        .get('/api/v1/admin/tenants')
        .set('Cookie', tamperedCookie);

      expect(res.status).toBe(401);
      expect(res.body.error.code).toBe('INVALID_TOKEN');
    });

    it('supports Bearer token authorization header for non-browser API clients', async () => {
      const res = await request(app)
        .get('/api/v1/admin/tenants')
        .set('Authorization', `Bearer ${adminToken}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
    });
  });

  // ───────────────────────────────────────────────────────────────────────────
  // B. CSRF, CORS, and Browser Security Policy
  // ───────────────────────────────────────────────────────────────────────────
  describe('B. CSRF and CORS Security Policy', () => {
    const originalEnv = process.env.ENFORCE_STRICT_CSRF;

    beforeEach(() => {
      process.env.ENFORCE_STRICT_CSRF = 'true';
    });

    afterEach(() => {
      process.env.ENFORCE_STRICT_CSRF = originalEnv;
    });

    it('blocks state-changing mutations with disallowed Origin in strict CSRF mode', async () => {
      const res = await request(app)
        .post('/api/v1/admin/tenants')
        .set('Cookie', adminCookie)
        .set('Origin', 'https://malicious-attacker.com')
        .send({ name: 'Hacked Tenant', slug: 'hacked-tenant' });

      expect(res.status).toBe(403);
      expect(res.body.error.code).toBe('FORBIDDEN');
    });

    it('blocks cookie-authenticated state-changing mutations with missing Origin and Referer', async () => {
      const res = await request(app)
        .post('/api/v1/admin/tenants')
        .set('Cookie', adminCookie)
        .send({ name: 'CSRF Tenant', slug: 'csrf-tenant' });

      expect(res.status).toBe(403);
      expect(res.body.error.code).toBe('FORBIDDEN');
    });

    it('allows cookie-authenticated mutations when Origin matches ALLOWED_ORIGINS', async () => {
      const allowedOrigin = env.ALLOWED_ORIGINS[0] || 'http://localhost:3000';
      const res = await request(app)
        .post('/api/v1/admin/tenants')
        .set('Cookie', adminCookie)
        .set('Origin', allowedOrigin)
        .send({ name: 'Legitimate Tenant', slug: 'legitimate-tenant' });

      expect(res.status).toBe(201);
      expect(res.body.success).toBe(true);
    });

    it('allows Bearer-token API requests without Origin header even in strict CSRF mode', async () => {
      const res = await request(app)
        .post('/api/v1/admin/tenants')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ name: 'API Client Tenant', slug: 'api-client-tenant' });

      expect(res.status).toBe(201);
      expect(res.body.success).toBe(true);
    });

    it('enforces public CORS wildcard WITHOUT credentials on public chat and lead routes', async () => {
      const chatRes = await request(app)
        .post('/api/v1/public/chat/alpha-health/message')
        .set('Origin', 'https://arbitrary-customer-site.com')
        .send({ message: 'Hello' });

      expect(chatRes.headers['access-control-allow-origin']).toBe('*');
      expect(chatRes.headers['access-control-allow-credentials']).toBeUndefined();

      const leadRes = await request(app)
        .post('/api/v1/public/leads/alpha-health')
        .set('Origin', 'https://another-customer-site.org')
        .send({ name: 'Visitor', email: 'visitor@example.com' });

      expect(leadRes.headers['access-control-allow-origin']).toBe('*');
      expect(leadRes.headers['access-control-allow-credentials']).toBeUndefined();
    });
  });

  // ───────────────────────────────────────────────────────────────────────────
  // C. Strict Tenant Isolation
  // ───────────────────────────────────────────────────────────────────────────
  describe('C. Cross-Tenant Isolation Enforcement', () => {
    it('blocks tenant A from accessing or modifying tenant B business content (returns 404 without leaking existence)', async () => {
      const betaContent = await BusinessContent.create({
        tenantId: tenantB._id,
        title: 'Beta Secret Fees',
        body: 'Confidential billing details for Beta legal clients.',
        status: 'published',
      });

      // 1. GET by ID under tenant A route
      const getRes = await request(app)
        .get(`/api/v1/admin/tenants/${tenantA.id}/content/${betaContent.id}`)
        .set('Cookie', adminCookie);
      expect(getRes.status).toBe(404);
      expect(getRes.body.error.code).toBe('CONTENT_NOT_FOUND');

      // 2. PATCH under tenant A route
      const patchRes = await request(app)
        .patch(`/api/v1/admin/tenants/${tenantA.id}/content/${betaContent.id}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ title: 'Tampered Title' });
      expect(patchRes.status).toBe(404);
      expect(patchRes.body.error.code).toBe('CONTENT_NOT_FOUND');

      // Verify original content was not modified
      const unchanged = await BusinessContent.findById(betaContent._id);
      expect(unchanged.title).toBe('Beta Secret Fees');
    });

    it('blocks tenant A from accessing or updating tenant B leads', async () => {
      const betaLead = await Lead.create({
        tenantId: tenantB._id,
        name: 'Jane Beta Client',
        email: 'jane@beta.test',
        phone: '+15551234567',
        status: 'new',
      });

      // 1. GET lead under tenant A
      const getRes = await request(app)
        .get(`/api/v1/admin/tenants/${tenantA.id}/leads/${betaLead.id}`)
        .set('Cookie', adminCookie);
      expect(getRes.status).toBe(404);
      expect(getRes.body.error.code).toBe('LEAD_NOT_FOUND');

      // 2. PATCH lead status under tenant A
      const patchRes = await request(app)
        .patch(`/api/v1/admin/tenants/${tenantA.id}/leads/${betaLead.id}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ status: 'contacted' });
      expect(patchRes.status).toBe(404);
      expect(patchRes.body.error.code).toBe('LEAD_NOT_FOUND');

      // Verify lead remains 'new'
      const checkLead = await Lead.findById(betaLead._id);
      expect(checkLead.status).toBe('new');
    });

    it('enforces tenant-isolation on usage metrics (tenant A cannot view tenant B usage)', async () => {
      await TenantDailyUsage.create({
        tenantId: tenantB._id,
        date: '2026-10-24',
        successfulResponses: 99,
        fallbackResponses: 5,
        newSessions: 25,
      });

      const res = await request(app)
        .get(`/api/v1/admin/tenants/${tenantA.id}/usage?period=30d`)
        .set('Cookie', adminCookie);

      expect(res.status).toBe(200);
      expect(res.body.data.tenant.name).toBe('Alpha Health Clinic');
      // Tenant B's 99 responses must NOT appear in Tenant A's totals
      expect(res.body.data.totals.successfulResponses).toBe(0);
      expect(res.body.data.totals.totalResponses).toBe(0);
    });

    it('forbids cross-tenant sessionToken hijacking in public chat API', async () => {
      // Create session belonging to Tenant A
      const sessionA = await ChatSession.create({
        tenantId: tenantA._id,
      });

      // Attempt to use Tenant A's sessionToken on Tenant B's chat endpoint
      const res = await request(app)
        .post('/api/v1/public/chat/beta-legal/message')
        .send({
          message: 'Can I access this with Alpha token?',
          sessionToken: sessionA.sessionToken,
        });

      expect(res.status).toBe(404);
      expect(res.body.error.code).toBe('SESSION_NOT_FOUND');
    });
  });

  // ───────────────────────────────────────────────────────────────────────────
  // D. Mass Assignment & Privilege Escalation Prevention
  // ───────────────────────────────────────────────────────────────────────────
  describe('D. Mass Assignment & Input Sanitization', () => {
    it('rejects attempt to inject tenantId, _id, status, or source in public lead submission', async () => {
      const res = await request(app)
        .post('/api/v1/public/chat/alpha-health/leads')
        .send({
          name: 'Attacker',
          email: 'attacker@evil.test',
          tenantId: tenantB.id, // Mass assignment attempt
          status: 'qualified', // Privilege escalation attempt
          source: 'manual', // Spoofing attempt
          _id: new mongoose.Types.ObjectId().toString(),
        });

      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe('UNSUPPORTED_FIELD');
    });

    it('rejects attempt to inject unexpected fields in public chat message', async () => {
      const res = await request(app)
        .post('/api/v1/public/chat/alpha-health/message')
        .send({
          message: 'Hello',
          role: 'admin', // Unexpected field
          tenantId: tenantB.id,
        });

      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe('UNSUPPORTED_FIELD');
    });

    it('rejects unsupported query parameters in admin listings to prevent parameter pollution', async () => {
      const res = await request(app)
        .get(`/api/v1/admin/tenants/${tenantA.id}/content?unexpectedParam=payload`)
        .set('Cookie', adminCookie);

      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe('INVALID_QUERY');
    });

    it('rejects search queries exceeding maximum bounded length of 100 characters', async () => {
      const longSearch = 'a'.repeat(101);
      const res = await request(app)
        .get(`/api/v1/admin/tenants/${tenantA.id}/content?search=${longSearch}`)
        .set('Cookie', adminCookie);

      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe('INVALID_QUERY');
    });
  });

  // ───────────────────────────────────────────────────────────────────────────
  // E. Honeypot and Anti-Abuse
  // ───────────────────────────────────────────────────────────────────────────
  describe('E. Honeypot & Anti-Bot Protection', () => {
    it('silently returns synthetic 201 when honeypot field is filled without touching DB', async () => {
      const beforeCount = await Lead.countDocuments();

      const res = await request(app)
        .post('/api/v1/public/leads/alpha-health')
        .send({
          name: 'Spam Bot',
          email: 'bot@spam.com',
          website: 'http://spam-link.ru', // Honeypot field filled
        });

      expect(res.status).toBe(201);
      expect(res.body.success).toBe(true);
      expect(res.body.data.lead.id).toBe('lead_ack');

      // Verify zero records were created in the database
      const afterCount = await Lead.countDocuments();
      expect(afterCount).toBe(beforeCount);
    });

    it('honeypot returns identical synthetic 201 for nonexistent or inactive tenants (prevents slug enumeration)', async () => {
      const res = await request(app)
        .post('/api/v1/public/leads/nonexistent-business-slug')
        .send({
          name: 'Spam Bot',
          email: 'bot@spam.com',
          honeypot: 'bot-content',
        });

      expect(res.status).toBe(201);
      expect(res.body.success).toBe(true);
      expect(res.body.data.lead.id).toBe('lead_ack');
    });
  });

  // ───────────────────────────────────────────────────────────────────────────
  // F. Knowledge Retrieval & Model Failure Privacy Controls
  // ───────────────────────────────────────────────────────────────────────────
  describe('F. Knowledge Retrieval and Model Privacy Controls', () => {
    it('retrieves strictly published content; drafts and archived items are never exposed to the model', async () => {
      // 1. Published content
      await BusinessContent.create({
        tenantId: tenantA._id,
        title: 'Root Canal Therapy',
        body: 'Root canal treatments are painless and done under local anesthesia.',
        status: 'published',
      });

      // 2. Draft content with matching keywords
      await BusinessContent.create({
        tenantId: tenantA._id,
        title: 'Draft Root Canal Pricing',
        body: 'Confidential internal cost breakdown: $1200 per tooth.',
        status: 'draft',
      });

      // 3. Second draft content with matching keywords
      await BusinessContent.create({
        tenantId: tenantA._id,
        title: 'Draft Internal Root Canal Protocol',
        body: 'Discontinued legacy internal protocol from 2019.',
        status: 'draft',
      });

      const retrieved = await retrieveKnowledge({
        tenantId: tenantA.id,
        question: 'How much is root canal treatment and is it painful?',
      });

      expect(retrieved).toHaveLength(1);
      expect(retrieved[0].title).toBe('Root Canal Therapy');
      expect(retrieved[0].body).toContain('Root canal treatments are painless');
      // Must NOT leak draft pricing or draft protocol
      expect(retrieved[0].body).not.toContain('$1200');
      expect(retrieved[0].body).not.toContain('legacy internal protocol');
    });

    it('ensures model failure returns configured fallback message without leaking stack traces or provider URLs', async () => {
      const generateSpy = jest
        .spyOn(OllamaModelAdapter.prototype, 'generate')
        .mockRejectedValueOnce(new ModelAdapterError('Connection to http://127.0.0.1:11434 timed out after 30000ms'));

      const res = await request(app)
        .post('/api/v1/public/chat/alpha-health/message')
        .send({ message: 'What services do you offer?' });

      generateSpy.mockRestore();

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.response).toBe('Alpha is temporarily unavailable. Please call us.');
      expect(res.body.data.fallbackApplied).toBe(true);

      // Verify no sensitive internals are exposed
      const rawBody = JSON.stringify(res.body);
      expect(rawBody).not.toMatch(/11434/);
      expect(rawBody).not.toMatch(/127\.0\.0\.1/);
      expect(rawBody).not.toMatch(/stack/i);
    });

    it('ensures analytics responses strictly contain aggregated metrics and zero customer PII or session tokens', async () => {
      const res = await request(app)
        .get('/api/v1/admin/analytics/usage')
        .set('Cookie', adminCookie);

      expect(res.status).toBe(200);
      const rawJson = JSON.stringify(res.body);
      expect(rawJson).not.toMatch(/sessionToken/i);
      expect(rawJson).not.toMatch(/prompt/i);
      expect(rawJson).not.toMatch(/email/i);
      expect(rawJson).not.toMatch(/phone/i);
    });
  });
});
