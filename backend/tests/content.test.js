const request = require('supertest');
const mongoose = require('mongoose');
const { MongoMemoryServer } = require('mongodb-memory-server');
const app = require('../src/app');
const AdminUser = require('../src/models/AdminUser');
const Tenant = require('../src/models/Tenant');
const BusinessContent = require('../src/models/BusinessContent');
const env = require('../src/config/env');
const { signAdminToken } = require('../src/services/tokenService');

let mongoServer;
let cookie;
let adminToken;
let tenant;
let otherTenant;

const basePath = (tenantId) => `/api/v1/admin/tenants/${tenantId}/content`;
const contentPayload = { title: 'Opening hours', body: 'We are open from Monday through Friday.' };

beforeAll(async () => {
  mongoServer = await MongoMemoryServer.create();
  await mongoose.connect(mongoServer.getUri());
});

afterAll(async () => {
  await mongoose.disconnect();
  await mongoServer?.stop();
});

beforeEach(async () => {
  await Promise.all([AdminUser.deleteMany({}), Tenant.deleteMany({}), BusinessContent.deleteMany({})]);
  const passwordHash = await AdminUser.hashPassword('AdminPass123!');
  const admin = await AdminUser.create({ email: 'admin@platform.test', passwordHash, role: 'admin', status: 'active' });
  adminToken = signAdminToken(admin);
  cookie = `${env.ADMIN_COOKIE_NAME}=${adminToken}`;
  tenant = await Tenant.create({ name: 'Acme Dental', slug: 'acme-dental' });
  otherTenant = await Tenant.create({ name: 'Other Dental', slug: 'other-dental' });
});

describe('Admin content management', () => {
  it('requires administrator authentication', async () => {
    const res = await request(app).get(basePath(tenant.id));
    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe('UNAUTHORIZED');
  });

  it('creates draft content and serializes safe fields', async () => {
    const res = await request(app).post(basePath(tenant.id)).set('Cookie', cookie).send(contentPayload);
    expect(res.status).toBe(201);
    expect(res.body.data.content).toMatchObject({ title: contentPayload.title, body: contentPayload.body, status: 'draft', tenantId: tenant.id });
    expect(res.body.data.content).toHaveProperty('id');
    expect(res.body.data.content).not.toHaveProperty('_id');
    expect(res.body.data.content).not.toHaveProperty('__v');
  });

  it('validates IDs, tenants, body fields and length limits', async () => {
    const invalidId = await request(app).post(basePath('bad-id')).set('Cookie', cookie).send(contentPayload);
    expect(invalidId.status).toBe(400);
    const missingTenant = await request(app).post(basePath(new mongoose.Types.ObjectId().toString())).set('Cookie', cookie).send(contentPayload);
    expect(missingTenant.status).toBe(404);
    const invalidBody = await request(app).post(basePath(tenant.id)).set('Cookie', cookie).send({ title: 'A', body: 'tiny' });
    expect(invalidBody.status).toBe(400);
    const whitespaceTitle = await request(app).post(basePath(tenant.id)).set('Cookie', cookie).send({ title: '   ', body: contentPayload.body });
    expect(whitespaceTitle.status).toBe(400);
    const nullBody = await request(app).post(basePath(tenant.id)).set('Cookie', cookie).send({ title: contentPayload.title, body: null });
    expect(nullBody.status).toBe(400);
    const tooLong = await request(app).post(basePath(tenant.id)).set('Cookie', cookie).send({ title: 'A'.repeat(151), body: contentPayload.body });
    expect(tooLong.status).toBe(400);
  });

  it('rejects protected or unsupported fields instead of allowing mass assignment', async () => {
    const res = await request(app).post(basePath(tenant.id)).set('Cookie', cookie).send({ ...contentPayload, tenantId: otherTenant.id, _id: new mongoose.Types.ObjectId().toString(), internal: true });
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('UNSUPPORTED_FIELD');
    expect(await BusinessContent.countDocuments()).toBe(0);
  });

  it('lists only the selected tenant with bounded pagination and status filtering', async () => {
    await BusinessContent.create([
      { tenantId: tenant._id, title: 'First item', body: 'First item content.', status: 'draft' },
      { tenantId: tenant._id, title: 'Published item', body: 'Published item content.', status: 'published' },
      { tenantId: otherTenant._id, title: 'Private item', body: 'Private item content.', status: 'published' },
    ]);
    const res = await request(app).get(`${basePath(tenant.id)}?page=1&limit=1&status=published`).set('Cookie', cookie);
    expect(res.status).toBe(200);
    expect(res.body.data.contents).toHaveLength(1);
    expect(res.body.data.contents[0].title).toBe('Published item');
    expect(res.body.data.pagination).toMatchObject({ total: 1, page: 1, limit: 1, pages: 1 });
    const invalid = await request(app).get(`${basePath(tenant.id)}?limit=101`).set('Cookie', cookie);
    expect(invalid.status).toBe(400);
  });

  it('reads and updates a content record only through its owning tenant', async () => {
    const content = await BusinessContent.create({ tenantId: tenant._id, ...contentPayload });
    const invalidContentId = await request(app).get(`${basePath(tenant.id)}/not-an-id`).set('Cookie', cookie);
    expect(invalidContentId.status).toBe(400);
    const missingContent = await request(app).get(`${basePath(tenant.id)}/${new mongoose.Types.ObjectId()}`).set('Cookie', cookie);
    expect(missingContent.status).toBe(404);
    const readWrongTenant = await request(app).get(`${basePath(otherTenant.id)}/${content.id}`).set('Cookie', cookie);
    expect(readWrongTenant.status).toBe(404);
    const updateWrongTenant = await request(app).patch(`${basePath(otherTenant.id)}/${content.id}`).set('Cookie', cookie).send({ title: 'Stolen title' });
    expect(updateWrongTenant.status).toBe(404);
    const publishWrongTenant = await request(app).patch(`${basePath(otherTenant.id)}/${content.id}/status`).set('Cookie', cookie).send({ status: 'published' });
    expect(publishWrongTenant.status).toBe(404);
    expect((await BusinessContent.findById(content.id)).status).toBe('draft');
    const update = await request(app).patch(`${basePath(tenant.id)}/${content.id}`).set('Cookie', cookie).send({ title: 'Updated hours', body: 'Updated business opening hours.' });
    expect(update.status).toBe(200);
    expect(update.body.data.content.title).toBe('Updated hours');
    const massAssignment = await request(app).patch(`${basePath(tenant.id)}/${content.id}`).set('Cookie', cookie).send({ tenantId: otherTenant.id });
    expect(massAssignment.status).toBe(400);
    expect(massAssignment.body.error.code).toBe('UNSUPPORTED_FIELD');
  });

  it('transitions content between draft and published states', async () => {
    const content = await BusinessContent.create({ tenantId: tenant._id, ...contentPayload });
    const published = await request(app).patch(`${basePath(tenant.id)}/${content.id}/status`).set('Cookie', cookie).send({ status: 'published' });
    expect(published.status).toBe(200);
    expect(published.body.data.content.status).toBe('published');
    const draft = await request(app).patch(`${basePath(tenant.id)}/${content.id}/status`).set('Cookie', cookie).send({ status: 'draft' });
    expect(draft.status).toBe(200);
    expect(draft.body.data.content.status).toBe('draft');
    const invalid = await request(app).patch(`${basePath(tenant.id)}/${content.id}/status`).set('Cookie', cookie).send({ status: 'archived' });
    expect(invalid.status).toBe(400);
  });

  it('enforces CSRF origin checks for cookie-authenticated mutations in strict mode', async () => {
    process.env.ENFORCE_STRICT_CSRF = 'true';
    try {
      const blocked = await request(app).post(basePath(tenant.id)).set('Cookie', cookie).send(contentPayload);
      expect(blocked.status).toBe(403);
      const disallowedOrigin = await request(app).post(basePath(tenant.id)).set('Cookie', cookie).set('Origin', 'https://attacker.example').send(contentPayload);
      expect(disallowedOrigin.status).toBe(403);
      const disallowedReferer = await request(app).post(basePath(tenant.id)).set('Cookie', cookie).set('Referer', 'https://attacker.example/form').send(contentPayload);
      expect(disallowedReferer.status).toBe(403);
      const permitted = await request(app).post(basePath(tenant.id)).set('Cookie', cookie).set('Origin', env.FRONTEND_URL).send(contentPayload);
      expect(permitted.status).toBe(201);
      const bearerClient = await request(app).post(basePath(tenant.id)).set('Authorization', `Bearer ${adminToken}`).send({ title: 'Bearer client', body: contentPayload.body });
      expect(bearerClient.status).toBe(201);
    } finally {
      delete process.env.ENFORCE_STRICT_CSRF;
    }
  });
});
