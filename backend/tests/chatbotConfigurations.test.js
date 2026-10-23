const request = require('supertest');
const mongoose = require('mongoose');
const { MongoMemoryServer } = require('mongodb-memory-server');
const app = require('../src/app');
const AdminUser = require('../src/models/AdminUser');
const Tenant = require('../src/models/Tenant');
const ChatbotConfiguration = require('../src/models/ChatbotConfiguration');
const env = require('../src/config/env');
const { signAdminToken } = require('../src/services/tokenService');

let mongoServer;
let cookie;
let tenant;
let otherTenant;
const pathFor = (tenantId) => `/api/v1/admin/tenants/${tenantId}/chatbot-configuration`;

beforeAll(async () => {
  mongoServer = await MongoMemoryServer.create();
  await mongoose.connect(mongoServer.getUri());
});

afterAll(async () => {
  await mongoose.disconnect();
  await mongoServer?.stop();
});

beforeEach(async () => {
  await Promise.all([AdminUser.deleteMany({}), Tenant.deleteMany({}), ChatbotConfiguration.deleteMany({})]);
  const passwordHash = await AdminUser.hashPassword('AdminPass123!');
  const admin = await AdminUser.create({ email: 'admin@platform.test', passwordHash, role: 'admin', status: 'active' });
  cookie = `${env.ADMIN_COOKIE_NAME}=${signAdminToken(admin)}`;
  tenant = await Tenant.create({ name: 'Acme Dental', slug: 'acme-dental' });
  otherTenant = await Tenant.create({ name: 'Other Dental', slug: 'other-dental' });
});

describe('Admin chatbot configuration', () => {
  it('requires authentication for all configuration routes', async () => {
    const get = await request(app).get(pathFor(tenant.id));
    const post = await request(app).post(pathFor(tenant.id)).send({});
    const patch = await request(app).patch(pathFor(tenant.id)).send({ displayName: 'Help Desk' });
    expect([get.status, post.status, patch.status]).toEqual([401, 401, 401]);
  });

  it('creates one default configuration per valid tenant with safe serialization', async () => {
    const created = await request(app).post(pathFor(tenant.id)).set('Cookie', cookie).send({});
    expect(created.status).toBe(201);
    expect(created.body.data.configuration).toMatchObject({ tenantId: tenant.id, displayName: 'Assistant', welcomeMessage: 'Hello! How can I help you today?', primaryColor: '#2563eb', position: 'bottom-right', enabled: true, fallbackMessage: null });
    expect(created.body.data.configuration).toHaveProperty('id');
    expect(created.body.data.configuration).not.toHaveProperty('_id');
    expect(created.body.data.configuration).not.toHaveProperty('__v');
    const read = await request(app).get(pathFor(tenant.id)).set('Cookie', cookie);
    expect(read.status).toBe(200);
  });

  it('validates tenant IDs and nonexistent tenants', async () => {
    const invalid = await request(app).post(pathFor('not-an-id')).set('Cookie', cookie).send({});
    expect(invalid.status).toBe(400);
    const missing = await request(app).post(pathFor(new mongoose.Types.ObjectId().toString())).set('Cookie', cookie).send({});
    expect(missing.status).toBe(404);
    const missingConfig = await request(app).get(pathFor(tenant.id)).set('Cookie', cookie);
    expect(missingConfig.status).toBe(404);
    expect(missingConfig.body.error.code).toBe('CONFIG_NOT_FOUND');
  });

  it('updates only valid supported settings and normalizes color and an empty fallback', async () => {
    await ChatbotConfiguration.create({ tenantId: tenant._id });
    const updated = await request(app).patch(pathFor(tenant.id)).set('Cookie', cookie).send({ displayName: 'Acme Helper', welcomeMessage: 'Welcome to Acme.', primaryColor: '#AABBCC', position: 'bottom-left', fallbackMessage: '   ' });
    expect(updated.status).toBe(200);
    expect(updated.body.data.configuration).toMatchObject({ displayName: 'Acme Helper', primaryColor: '#aabbcc', position: 'bottom-left', fallbackMessage: null });
    const invalidColor = await request(app).patch(pathFor(tenant.id)).set('Cookie', cookie).send({ primaryColor: 'blue' });
    expect(invalidColor.status).toBe(400);
    const invalidPosition = await request(app).patch(pathFor(tenant.id)).set('Cookie', cookie).send({ position: 'top-right' });
    expect(invalidPosition.status).toBe(400);
    const invalidMessage = await request(app).patch(pathFor(tenant.id)).set('Cookie', cookie).send({ welcomeMessage: ' ' });
    expect(invalidMessage.status).toBe(400);
    const directModelNormalization = await ChatbotConfiguration.create({ tenantId: otherTenant._id, fallbackMessage: '   ' });
    expect(directModelNormalization.fallbackMessage).toBeNull();
  });

  it('rejects protected fields and leaves tenant ownership unchanged', async () => {
    const config = await ChatbotConfiguration.create({ tenantId: tenant._id });
    const createInjection = await request(app).post(pathFor(otherTenant.id)).set('Cookie', cookie).send({ tenantId: tenant.id, enabled: false });
    expect(createInjection.status).toBe(400);
    const updateInjection = await request(app).patch(pathFor(tenant.id)).set('Cookie', cookie).send({ tenantId: otherTenant.id, _id: config.id });
    expect(updateInjection.status).toBe(400);
    expect((await ChatbotConfiguration.findById(config.id)).tenantId.toString()).toBe(tenant.id);
  });

  it('keeps configurations isolated by tenant', async () => {
    const config = await ChatbotConfiguration.create({ tenantId: tenant._id, displayName: 'Tenant A bot' });
    const readOther = await request(app).get(pathFor(otherTenant.id)).set('Cookie', cookie);
    expect(readOther.status).toBe(404);
    const updateOther = await request(app).patch(pathFor(otherTenant.id)).set('Cookie', cookie).send({ displayName: 'Stolen bot' });
    expect(updateOther.status).toBe(404);
    expect((await ChatbotConfiguration.findById(config.id)).displayName).toBe('Tenant A bot');
  });

  it('rejects duplicate and concurrent creates with a conflict response', async () => {
    const responses = await Promise.all([
      request(app).post(pathFor(tenant.id)).set('Cookie', cookie).send({}),
      request(app).post(pathFor(tenant.id)).set('Cookie', cookie).send({}),
    ]);
    expect(responses.map((response) => response.status).sort()).toEqual([201, 409]);
    expect(await ChatbotConfiguration.countDocuments({ tenantId: tenant._id })).toBe(1);
  });

  it('enables and disables an existing configuration through the scoped route', async () => {
    await ChatbotConfiguration.create({ tenantId: tenant._id });
    const disabled = await request(app).patch(`${pathFor(tenant.id)}/enabled`).set('Cookie', cookie).send({ enabled: false });
    expect(disabled.status).toBe(200);
    expect(disabled.body.data.configuration.enabled).toBe(false);
    const enabled = await request(app).patch(`${pathFor(tenant.id)}/enabled`).set('Cookie', cookie).send({ enabled: true });
    expect(enabled.status).toBe(200);
    expect(enabled.body.data.configuration.enabled).toBe(true);
    const invalidBoolean = await request(app).patch(`${pathFor(tenant.id)}/enabled`).set('Cookie', cookie).send({ enabled: 'false' });
    expect(invalidBoolean.status).toBe(400);
  });

  it('enforces strict CSRF checks for mutations', async () => {
    process.env.ENFORCE_STRICT_CSRF = 'true';
    try {
      const blocked = await request(app).post(pathFor(tenant.id)).set('Cookie', cookie).send({});
      expect(blocked.status).toBe(403);
      const allowed = await request(app).post(pathFor(tenant.id)).set('Cookie', cookie).set('Origin', env.FRONTEND_URL).send({});
      expect(allowed.status).toBe(201);
    } finally {
      delete process.env.ENFORCE_STRICT_CSRF;
    }
  });
});
