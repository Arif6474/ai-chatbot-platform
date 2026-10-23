const request = require('supertest');
const mongoose = require('mongoose');
const { MongoMemoryServer } = require('mongodb-memory-server');
const app = require('../src/app');
const Tenant = require('../src/models/Tenant');
const BusinessContent = require('../src/models/BusinessContent');
const ChatbotConfiguration = require('../src/models/ChatbotConfiguration');
const ChatSession = require('../src/models/ChatSession');
const { MAX_MESSAGE_LENGTH } = require('../src/controllers/publicChatController');
const { OllamaModelAdapter, ModelAdapterError } = require('../src/services/ollamaModelAdapter');

let mongoServer;
let activeTenant;
let otherTenant;
let inactiveTenant;

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
    Tenant.deleteMany({}),
    BusinessContent.deleteMany({}),
    ChatbotConfiguration.deleteMany({}),
    ChatSession.deleteMany({}),
  ]);

  // Seed active tenant with published content and enabled chatbot
  activeTenant = await Tenant.create({
    name: 'Smile Dental Clinic',
    slug: 'smile-dental',
    status: 'active',
  });

  await BusinessContent.create([
    {
      tenantId: activeTenant._id,
      title: 'Business Hours',
      body: 'We are open Monday to Friday from 8 AM to 6 PM.',
      status: 'published',
    },
    {
      tenantId: activeTenant._id,
      title: 'Draft Procedures',
      body: 'Internal staff notes about dental implants.',
      status: 'draft',
    },
  ]);

  await ChatbotConfiguration.create({
    tenantId: activeTenant._id,
    displayName: 'Smile Assistant',
    welcomeMessage: 'Welcome to Smile Dental!',
    enabled: true,
    fallbackMessage: 'Smile Dental staff will assist you shortly.',
  });

  // Seed second tenant
  otherTenant = await Tenant.create({
    name: 'Metro Physio Care',
    slug: 'metro-physio',
    status: 'active',
  });

  await ChatbotConfiguration.create({
    tenantId: otherTenant._id,
    displayName: 'Metro Assistant',
    enabled: true,
  });

  // Seed inactive tenant
  inactiveTenant = await Tenant.create({
    name: 'Dormant Legal Services',
    slug: 'dormant-legal',
    status: 'inactive',
  });

  await ChatbotConfiguration.create({
    tenantId: inactiveTenant._id,
    displayName: 'Legal Assistant',
    enabled: true,
  });
});

describe('Public Chat API & Sessions (POST /api/v1/public/chat/:tenantSlug/message)', () => {
  const urlFor = (slug) => `/api/v1/public/chat/${encodeURIComponent(slug)}/message`;

  describe('1. Tenant and Configuration Checks', () => {
    it('successfully processes message for active tenant with enabled chatbot', async () => {
      const res = await request(app)
        .post(urlFor(activeTenant.slug))
        .send({ message: 'What are your business hours?' });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data).toHaveProperty('response');
      expect(res.body.data).toHaveProperty('sessionToken');
      expect(res.body.data.sessionToken).toMatch(/^[0-9a-fA-F]{48}$/);
    });

    it('returns 404 for unknown tenant slug', async () => {
      const res = await request(app)
        .post(urlFor('nonexistent-tenant'))
        .send({ message: 'Hello' });

      expect(res.status).toBe(404);
      expect(res.body.success).toBe(false);
      expect(res.body.error.code).toBe('TENANT_NOT_FOUND');
    });

    it('returns 403 for inactive tenant', async () => {
      const res = await request(app)
        .post(urlFor(inactiveTenant.slug))
        .send({ message: 'Hello' });

      expect(res.status).toBe(403);
      expect(res.body.success).toBe(false);
      expect(res.body.error.code).toBe('TENANT_INACTIVE');
    });

    it('returns 404 when chatbot configuration is missing', async () => {
      const unconfiguredTenant = await Tenant.create({
        name: 'Unconfigured Clinic',
        slug: 'unconfigured-clinic',
        status: 'active',
      });

      const res = await request(app)
        .post(urlFor(unconfiguredTenant.slug))
        .send({ message: 'Hello' });

      expect(res.status).toBe(404);
      expect(res.body.success).toBe(false);
      expect(res.body.error.code).toBe('CHATBOT_NOT_CONFIGURED');
    });

    it('returns 403 when chatbot configuration is disabled', async () => {
      await ChatbotConfiguration.updateOne({ tenantId: activeTenant._id }, { enabled: false });

      const res = await request(app)
        .post(urlFor(activeTenant.slug))
        .send({ message: 'Hello' });

      expect(res.status).toBe(403);
      expect(res.body.success).toBe(false);
      expect(res.body.error.code).toBe('CHATBOT_DISABLED');
    });

    it('rejects malformed tenant slug formats', async () => {
      const res = await request(app)
        .post(urlFor('INVALID_SLUG!@#'))
        .send({ message: 'Hello' });

      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe('INVALID_TENANT_SLUG');
    });

    describe('Public Chatbot Configuration Delivery (GET /api/v1/public/chat/:tenantSlug/config)', () => {
      it('returns strictly public presentation fields for active tenant', async () => {
        const res = await request(app).get(`/api/v1/public/chat/${activeTenant.slug}/config`);
        expect(res.status).toBe(200);
        expect(res.body.success).toBe(true);
        expect(res.body.data).toEqual({
          displayName: 'Smile Assistant',
          welcomeMessage: 'Welcome to Smile Dental!',
          primaryColor: '#2563eb',
          position: 'bottom-right',
          enabled: true,
        });
        // Internal IDs, secrets, fallback text, and database metadata must not be exposed
        expect(res.body.data).not.toHaveProperty('id');
        expect(res.body.data).not.toHaveProperty('_id');
        expect(res.body.data).not.toHaveProperty('__v');
        expect(res.body.data).not.toHaveProperty('fallbackMessage');
        expect(res.body.data).not.toHaveProperty('tenantId');
      });

      it('returns 404 for nonexistent tenant slug', async () => {
        const res = await request(app).get('/api/v1/public/chat/nonexistent-tenant/config');
        expect(res.status).toBe(404);
        expect(res.body.error.code).toBe('TENANT_NOT_FOUND');
      });

      it('returns 403 for inactive tenant', async () => {
        const res = await request(app).get(`/api/v1/public/chat/${inactiveTenant.slug}/config`);
        expect(res.status).toBe(403);
        expect(res.body.error.code).toBe('TENANT_INACTIVE');
      });

      it('returns 404 when chatbot configuration is missing', async () => {
        const unconfigured = await Tenant.create({ name: 'No Config', slug: 'no-config', status: 'active' });
        const res = await request(app).get(`/api/v1/public/chat/${unconfigured.slug}/config`);
        expect(res.status).toBe(404);
        expect(res.body.error.code).toBe('CHATBOT_NOT_CONFIGURED');
      });
    });
  });

  describe('2. Request Validation', () => {
    it('rejects empty or whitespace message', async () => {
      const emptyRes = await request(app)
        .post(urlFor(activeTenant.slug))
        .send({ message: '' });
      expect(emptyRes.status).toBe(400);
      expect(emptyRes.body.error.code).toBe('INVALID_MESSAGE');

      const wsRes = await request(app)
        .post(urlFor(activeTenant.slug))
        .send({ message: '   ' });
      expect(wsRes.status).toBe(400);
      expect(wsRes.body.error.code).toBe('INVALID_MESSAGE');
    });

    it('rejects non-string message', async () => {
      const res = await request(app)
        .post(urlFor(activeTenant.slug))
        .send({ message: 12345 });
      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe('INVALID_MESSAGE');
    });

    it('rejects oversized message', async () => {
      const res = await request(app)
        .post(urlFor(activeTenant.slug))
        .send({ message: 'a'.repeat(MAX_MESSAGE_LENGTH + 1) });
      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe('MESSAGE_TOO_LONG');
    });

    it('rejects non-object body', async () => {
      const res = await request(app)
        .post(urlFor(activeTenant.slug))
        .set('Content-Type', 'application/json')
        .send(JSON.stringify('plain string'));
      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe('VALIDATION_ERROR');
    });

    it('rejects unexpected or unsupported fields in request body', async () => {
      const res = await request(app)
        .post(urlFor(activeTenant.slug))
        .send({ message: 'Hello', unexpectedField: true, tenantId: 'malicious' });
      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe('UNSUPPORTED_FIELD');
    });

    it('rejects invalid session token format', async () => {
      const res = await request(app)
        .post(urlFor(activeTenant.slug))
        .send({ message: 'Hello', sessionToken: 'invalid-token-format' });
      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe('INVALID_SESSION_TOKEN');
    });
  });

  describe('3. Session Creation, Scoping, and Isolation', () => {
    it('creates a new session and increments messageCount upon successful chat', async () => {
      const res1 = await request(app)
        .post(urlFor(activeTenant.slug))
        .send({ message: 'Hello' });

      expect(res1.status).toBe(200);
      const token = res1.body.data.sessionToken;

      const sessionInDb = await ChatSession.findOne({ sessionToken: token });
      expect(sessionInDb).toBeDefined();
      expect(sessionInDb.tenantId.toString()).toBe(activeTenant._id.toString());
      expect(sessionInDb.messageCount).toBe(1);

      // Subsequent message reuses existing session
      const res2 = await request(app)
        .post(urlFor(activeTenant.slug))
        .send({ message: 'Another question', sessionToken: token });

      expect(res2.status).toBe(200);
      expect(res2.body.data.sessionToken).toBe(token);

      const updatedSession = await ChatSession.findOne({ sessionToken: token });
      expect(updatedSession.messageCount).toBe(2);
    });

    it('strictly forbids cross-tenant session token reuse', async () => {
      // Create session on activeTenant
      const res1 = await request(app)
        .post(urlFor(activeTenant.slug))
        .send({ message: 'Hello on tenant 1' });
      const tenant1Token = res1.body.data.sessionToken;

      // Attempt to reuse tenant1Token on otherTenant
      const res2 = await request(app)
        .post(urlFor(otherTenant.slug))
        .send({ message: 'Hello on tenant 2', sessionToken: tenant1Token });

      expect(res2.status).toBe(404);
      expect(res2.body.error.code).toBe('SESSION_NOT_FOUND');
    });

    it('generates cryptographically unpredictable session tokens', async () => {
      const resA = await request(app).post(urlFor(activeTenant.slug)).send({ message: 'Hello A' });
      const resB = await request(app).post(urlFor(activeTenant.slug)).send({ message: 'Hello B' });

      const tokenA = resA.body.data.sessionToken;
      const tokenB = resB.body.data.sessionToken;

      expect(tokenA).not.toBe(tokenB);
      expect(tokenA.length).toBe(48);
      expect(tokenB.length).toBe(48);
    });

    it('safely serializes ChatSession toJSON without leaking _id or __v', async () => {
      const session = await ChatSession.create({ tenantId: activeTenant._id });
      const json = session.toJSON();
      expect(json).toHaveProperty('id');
      expect(json).not.toHaveProperty('_id');
      expect(json).not.toHaveProperty('__v');
      expect(json.tenantId).toBe(activeTenant._id.toString());
    });
  });

  describe('4. Retrieval and Model Adapter Integration', () => {
    it('applies configured fallback message gracefully when model adapter fails without corrupting session', async () => {
      const generateSpy = jest
        .spyOn(OllamaModelAdapter.prototype, 'generate')
        .mockRejectedValueOnce(new ModelAdapterError('Model unavailable', 'MODEL_UNAVAILABLE'));

      const session = await ChatSession.create({ tenantId: activeTenant._id });

      const res = await request(app)
        .post(urlFor(activeTenant.slug))
        .send({ message: 'Hello model failure', sessionToken: session.sessionToken });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data).toHaveProperty('response');
      expect(res.body.data.fallbackApplied).toBe(true);
      expect(res.body.data.response).toBe('Smile Dental staff will assist you shortly.');
      expect(res.body.data.sessionToken).toBe(session.sessionToken);

      // Session messageCount should NOT be incremented for failed model requests
      const checkSession = await ChatSession.findById(session._id);
      expect(checkSession.messageCount).toBe(0);

      generateSpy.mockRestore();
    });

    it('never leaks stack traces, prompts, or provider URLs in public responses', async () => {
      const res = await request(app)
        .post(urlFor(activeTenant.slug))
        .send({ message: 'What are your hours?' });

      const bodyStr = JSON.stringify(res.body);
      expect(bodyStr).not.toContain('127.0.0.1');
      expect(bodyStr).not.toContain('11434');
      expect(bodyStr).not.toContain('UNTRUSTED_REFERENCE_DATA_JSON');
      expect(bodyStr).not.toContain('SYSTEM_INSTRUCTION');
      expect(bodyStr).not.toContain('Draft Procedures');
      expect(bodyStr).not.toContain('stack');
    });

    it('safely updates session messageCount atomically during concurrent requests with existing session', async () => {
      const session = await ChatSession.create({ tenantId: activeTenant._id });

      const [res1, res2] = await Promise.all([
        request(app).post(urlFor(activeTenant.slug)).send({ message: 'Msg 1', sessionToken: session.sessionToken }),
        request(app).post(urlFor(activeTenant.slug)).send({ message: 'Msg 2', sessionToken: session.sessionToken }),
      ]);

      expect(res1.status).toBe(200);
      expect(res2.status).toBe(200);

      const finalSession = await ChatSession.findById(session._id);
      expect(finalSession.messageCount).toBe(2);
    });

    it('handles first-request concurrent messages without sessionToken by creating distinct independent sessions', async () => {
      const [resA, resB] = await Promise.all([
        request(app).post(urlFor(activeTenant.slug)).send({ message: 'Visitor A' }),
        request(app).post(urlFor(activeTenant.slug)).send({ message: 'Visitor B' }),
      ]);

      expect(resA.status).toBe(200);
      expect(resB.status).toBe(200);
      expect(resA.body.data.sessionToken).not.toBe(resB.body.data.sessionToken);

      const count = await ChatSession.countDocuments({ tenantId: activeTenant._id });
      expect(count).toBe(2);
    });
  });
});
