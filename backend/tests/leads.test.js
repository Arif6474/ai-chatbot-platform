const request = require('supertest');
const mongoose = require('mongoose');
const { MongoMemoryServer } = require('mongodb-memory-server');
const app = require('../src/app');
const AdminUser = require('../src/models/AdminUser');
const Tenant = require('../src/models/Tenant');
const Lead = require('../src/models/Lead');
const env = require('../src/config/env');
const { signAdminToken } = require('../src/services/tokenService');

let mongoServer;
let cookie;
let tenant;
let inactiveTenant;
let otherTenant;

const adminLeadsPath = (tenantId) => `/api/v1/admin/tenants/${tenantId}/leads`;
const publicChatLeadsPath = (slug) => `/api/v1/public/chat/${slug}/leads`;
const publicDirectLeadsPath = (slug) => `/api/v1/public/leads/${slug}`;

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
    Lead.deleteMany({}),
  ]);

  const passwordHash = await AdminUser.hashPassword('AdminPassword123!');
  const admin = await AdminUser.create({
    email: 'leads-admin@platform.test',
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

  inactiveTenant = await Tenant.create({
    name: 'Closed Practice',
    slug: 'closed-practice',
    status: 'inactive',
  });

  otherTenant = await Tenant.create({
    name: 'Other Clinic',
    slug: 'other-clinic',
    status: 'active',
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 1. Lead Data Model Unit Tests
// ─────────────────────────────────────────────────────────────────────────────
describe('Lead Model', () => {
  it('creates a valid lead with all fields and safe serialization', async () => {
    const lead = await Lead.create({
      tenantId: tenant._id,
      name: 'Alice Johnson',
      email: 'alice@example.com',
      phone: '+1 555-0199',
      message: 'I need to book a dental cleaning.',
      source: 'chatbot',
      status: 'new',
    });

    expect(lead.name).toBe('Alice Johnson');
    expect(lead.email).toBe('alice@example.com');
    expect(lead.phone).toBe('+1 555-0199');
    expect(lead.status).toBe('new');
    expect(lead.source).toBe('chatbot');

    const json = lead.toJSON();
    expect(json).toHaveProperty('id');
    expect(json).toHaveProperty('tenantId');
    expect(typeof json.id).toBe('string');
    expect(typeof json.tenantId).toBe('string');
    expect(json).not.toHaveProperty('_id');
    expect(json).not.toHaveProperty('__v');
  });

  it('requires at least one contact channel (email or phone)', async () => {
    await expect(
      Lead.create({
        tenantId: tenant._id,
        name: 'No Contact User',
      })
    ).rejects.toThrow();
  });

  it('allows creation with phone only (no email)', async () => {
    const lead = await Lead.create({
      tenantId: tenant._id,
      name: 'Bob Phone-Only',
      phone: '555-123-4567',
    });
    expect(lead.phone).toBe('555-123-4567');
    expect(lead.email).toBeNull();
  });

  it('allows creation with email only (no phone)', async () => {
    const lead = await Lead.create({
      tenantId: tenant._id,
      name: 'Carol Email-Only',
      email: 'carol@example.com',
    });
    expect(lead.email).toBe('carol@example.com');
    expect(lead.phone).toBeNull();
  });

  it('validates email format and rejects malformed email', async () => {
    await expect(
      Lead.create({
        tenantId: tenant._id,
        name: 'Bad Email',
        email: 'invalid-email-string',
      })
    ).rejects.toThrow(/valid email/i);
  });

  it('validates phone format and rejects malformed phone', async () => {
    await expect(
      Lead.create({
        tenantId: tenant._id,
        name: 'Bad Phone',
        phone: 'abc',
      })
    ).rejects.toThrow(/valid phone/i);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 2. Public Lead Submission Tests
// ─────────────────────────────────────────────────────────────────────────────
describe('Public Lead Submission API', () => {
  describe('via /api/v1/public/chat/:tenantSlug/leads', () => {
    it('successfully submits a lead and returns 201 with safe response', async () => {
      const res = await request(app)
        .post(publicChatLeadsPath('smile-dental'))
        .set('Origin', 'https://customer-site.example.com')
        .send({
          name: 'Jane Doe',
          email: 'jane@example.com',
          phone: '+1 555-0142',
          message: 'Interested in teeth whitening consultation.',
        });

      expect(res.status).toBe(201);
      expect(res.headers['access-control-allow-origin']).toBe('*');
      expect(res.body.success).toBe(true);
      expect(res.body.data.lead).toHaveProperty('id');
      expect(res.body.data.lead.name).toBe('Jane Doe');
      expect(res.body.data.lead.status).toBe('new');
      expect(res.body.data.lead).toHaveProperty('createdAt');

      // Verify lead was stored in database under the correct tenant
      const stored = await Lead.findById(res.body.data.lead.id);
      expect(stored).not.toBeNull();
      expect(stored.tenantId.toString()).toBe(tenant._id.toString());
      expect(stored.email).toBe('jane@example.com');
      expect(stored.phone).toBe('+1 555-0142');
      expect(stored.source).toBe('widget');
    });

    it('rejects nonexistent tenant with 404', async () => {
      const res = await request(app)
        .post(publicChatLeadsPath('nonexistent-tenant'))
        .send({
          name: 'Jane Doe',
          email: 'jane@example.com',
        });

      expect(res.status).toBe(404);
      expect(res.body.success).toBe(false);
      expect(res.body.error.code).toBe('TENANT_NOT_FOUND');
    });

    it('rejects inactive tenant with 403', async () => {
      const res = await request(app)
        .post(publicChatLeadsPath('closed-practice'))
        .send({
          name: 'Jane Doe',
          email: 'jane@example.com',
        });

      expect(res.status).toBe(403);
      expect(res.body.success).toBe(false);
      expect(res.body.error.code).toBe('TENANT_INACTIVE');
    });

    it('rejects invalid tenant slug format with 400', async () => {
      const res = await request(app)
        .post('/api/v1/public/chat/INVALID_SLUG!!/leads')
        .send({
          name: 'Jane Doe',
          email: 'jane@example.com',
        });

      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe('INVALID_TENANT_SLUG');
    });

    it('rejects unsupported and privileged fields (e.g. tenantId, status, notes)', async () => {
      const res = await request(app)
        .post(publicChatLeadsPath('smile-dental'))
        .send({
          name: 'Attacker',
          email: 'attacker@evil.com',
          tenantId: otherTenant.id,
          status: 'qualified',
          notes: 'Arbitrary admin notes injected by client',
        });

      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe('UNSUPPORTED_FIELD');
    });

    it('rejects attempt by public client to supply source parameter (400 UNSUPPORTED_FIELD)', async () => {
      const res = await request(app)
        .post(publicChatLeadsPath('smile-dental'))
        .send({
          name: 'Jane Doe',
          email: 'jane@example.com',
          source: 'manual',
        });

      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe('UNSUPPORTED_FIELD');
    });

    it('rejects submission with neither email nor phone', async () => {
      const res = await request(app)
        .post(publicChatLeadsPath('smile-dental'))
        .send({
          name: 'No Contact Method',
          message: 'Hello',
        });

      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe('VALIDATION_ERROR');
      expect(res.body.error.message).toMatch(/either email or phone/i);
    });

    it('rejects invalid email format', async () => {
      const res = await request(app)
        .post(publicChatLeadsPath('smile-dental'))
        .send({
          name: 'Bad Email',
          email: 'not-an-email',
        });

      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe('VALIDATION_ERROR');
    });

    it('rejects invalid phone format', async () => {
      const res = await request(app)
        .post(publicChatLeadsPath('smile-dental'))
        .send({
          name: 'Bad Phone',
          phone: '12',
        });

      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe('VALIDATION_ERROR');
    });

    it('rejects message exceeding length limit', async () => {
      const res = await request(app)
        .post(publicChatLeadsPath('smile-dental'))
        .send({
          name: 'Long Message',
          email: 'long@example.com',
          message: 'A'.repeat(1001),
        });

      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe('VALIDATION_ERROR');
      expect(res.body.error.message).toMatch(/exceed 1000/i);
    });

    it('honeypot: silently returns synthetic success without saving when bot field is filled', async () => {
      const countBefore = await Lead.countDocuments({});

      const res = await request(app)
        .post(publicChatLeadsPath('smile-dental'))
        .send({
          name: 'Spam Bot',
          email: 'bot@spam.com',
          website: 'http://spam-site.com', // honeypot trap field
        });

      expect(res.status).toBe(201);
      expect(res.body.success).toBe(true);

      // Verify no record was inserted into database
      const countAfter = await Lead.countDocuments({});
      expect(countAfter).toBe(countBefore);
    });

    it('honeypot: returns identical synthetic 201 on nonexistent and inactive tenants without querying DB', async () => {
      const resNonexistent = await request(app)
        .post(publicChatLeadsPath('nonexistent-tenant'))
        .send({
          name: 'Bot',
          email: 'bot@spam.com',
          website: 'http://spam.example',
        });

      const resInactive = await request(app)
        .post(publicChatLeadsPath('closed-practice'))
        .send({
          name: 'Bot',
          email: 'bot@spam.com',
          honeypot: 'spam_trap',
        });

      expect(resNonexistent.status).toBe(201);
      expect(resNonexistent.body.data.lead.id).toBe('lead_ack');
      expect(resInactive.status).toBe(201);
      expect(resInactive.body.data.lead.id).toBe('lead_ack');
    });

    it('handles CORS preflight OPTIONS request correctly', async () => {
      const res = await request(app)
        .options(publicChatLeadsPath('smile-dental'))
        .set('Origin', 'https://arbitrary-customer-site.com')
        .set('Access-Control-Request-Method', 'POST')
        .set('Access-Control-Request-Headers', 'Content-Type');

      expect(res.headers['access-control-allow-origin']).toBe('*');
      expect(res.headers['access-control-allow-credentials']).not.toBe('true');
      expect(res.status).toBeLessThan(300);
    });
  });

  describe('via /api/v1/public/leads/:tenantSlug', () => {
    it('successfully submits a lead via direct public lead route with contact_form source', async () => {
      const res = await request(app)
        .post(publicDirectLeadsPath('smile-dental'))
        .send({
          name: 'Direct Lead',
          email: 'direct@example.com',
          message: 'Direct enquiry.',
        });

      expect(res.status).toBe(201);
      expect(res.body.success).toBe(true);
      expect(res.body.data.lead.name).toBe('Direct Lead');

      const stored = await Lead.findById(res.body.data.lead.id);
      expect(stored.source).toBe('contact_form');
    });
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 3. Admin Lead Management API Tests
// ─────────────────────────────────────────────────────────────────────────────
describe('Admin Lead Management API', () => {
  beforeEach(async () => {
    // Seed test leads for tenant
    await Lead.create([
      {
        tenantId: tenant._id,
        name: 'Alice Smith',
        email: 'alice@test.com',
        phone: '555-0101',
        message: 'Interested in braces',
        status: 'new',
        source: 'chatbot',
      },
      {
        tenantId: tenant._id,
        name: 'Bob Jones',
        email: 'bob@test.com',
        phone: '555-0102',
        message: 'Root canal questions',
        status: 'contacted',
        source: 'widget',
      },
      {
        tenantId: tenant._id,
        name: 'Charlie Brown',
        email: 'charlie@test.com',
        status: 'qualified',
        source: 'chatbot',
      },
      {
        tenantId: otherTenant._id,
        name: 'Other Clinic Lead',
        email: 'other@test.com',
        status: 'new',
      },
    ]);
  });

  it('requires authentication for all admin lead endpoints', async () => {
    const listRes = await request(app).get(adminLeadsPath(tenant.id));
    const getRes = await request(app).get(`${adminLeadsPath(tenant.id)}/${new mongoose.Types.ObjectId()}`);
    const patchRes = await request(app).patch(`${adminLeadsPath(tenant.id)}/${new mongoose.Types.ObjectId()}`).send({ status: 'contacted' });

    expect(listRes.status).toBe(401);
    expect(getRes.status).toBe(401);
    expect(patchRes.status).toBe(401);
  });

  it('rejects invalid tenant IDs and nonexistent tenants', async () => {
    const invalidIdRes = await request(app)
      .get(adminLeadsPath('not-a-valid-id'))
      .set('Cookie', cookie);
    expect(invalidIdRes.status).toBe(400);
    expect(invalidIdRes.body.error.code).toBe('INVALID_ID');

    const nonexistentRes = await request(app)
      .get(adminLeadsPath(new mongoose.Types.ObjectId().toString()))
      .set('Cookie', cookie);
    expect(nonexistentRes.status).toBe(404);
    expect(nonexistentRes.body.error.code).toBe('TENANT_NOT_FOUND');
  });

  it('lists leads scoped to the specific tenant with pagination', async () => {
    const res = await request(app)
      .get(adminLeadsPath(tenant.id))
      .set('Cookie', cookie);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.leads).toHaveLength(3);
    expect(res.body.data.pagination).toEqual({
      total: 3,
      page: 1,
      limit: 10,
      pages: 1,
    });

    // Ensure otherTenant's lead is NOT present
    const emails = res.body.data.leads.map((l) => l.email);
    expect(emails).not.toContain('other@test.com');
  });

  it('filters leads by status', async () => {
    const res = await request(app)
      .get(`${adminLeadsPath(tenant.id)}?status=contacted`)
      .set('Cookie', cookie);

    expect(res.status).toBe(200);
    expect(res.body.data.leads).toHaveLength(1);
    expect(res.body.data.leads[0].name).toBe('Bob Jones');
    expect(res.body.data.leads[0].status).toBe('contacted');
  });

  it('filters leads by search term across name, email, and phone', async () => {
    const res = await request(app)
      .get(`${adminLeadsPath(tenant.id)}?search=555-0101`)
      .set('Cookie', cookie);

    expect(res.status).toBe(200);
    expect(res.body.data.leads).toHaveLength(1);
    expect(res.body.data.leads[0].name).toBe('Alice Smith');
  });

  it('rejects invalid query parameters', async () => {
    const badPage = await request(app)
      .get(`${adminLeadsPath(tenant.id)}?page=-1`)
      .set('Cookie', cookie);
    expect(badPage.status).toBe(400);

    const badStatus = await request(app)
      .get(`${adminLeadsPath(tenant.id)}?status=unknown_status`)
      .set('Cookie', cookie);
    expect(badStatus.status).toBe(400);

    const longSearch = await request(app)
      .get(`${adminLeadsPath(tenant.id)}?search=${'A'.repeat(101)}`)
      .set('Cookie', cookie);
    expect(longSearch.status).toBe(400);
    expect(longSearch.body.error.code).toBe('INVALID_QUERY');
  });

  it('retrieves a single lead by ID scoped to the tenant', async () => {
    const lead = await Lead.findOne({ tenantId: tenant._id, name: 'Alice Smith' });

    const res = await request(app)
      .get(`${adminLeadsPath(tenant.id)}/${lead.id}`)
      .set('Cookie', cookie);

    expect(res.status).toBe(200);
    expect(res.body.data.lead.name).toBe('Alice Smith');
    expect(res.body.data.lead.id).toBe(lead.id);
  });

  it('enforces tenant isolation: blocks accessing another tenant’s lead (returns 404)', async () => {
    const otherLead = await Lead.findOne({ tenantId: otherTenant._id });

    const res = await request(app)
      .get(`${adminLeadsPath(tenant.id)}/${otherLead.id}`)
      .set('Cookie', cookie);

    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe('LEAD_NOT_FOUND');
  });

  it('updates lead status and notes successfully', async () => {
    const lead = await Lead.findOne({ tenantId: tenant._id, name: 'Alice Smith' });

    const res = await request(app)
      .patch(`${adminLeadsPath(tenant.id)}/${lead.id}`)
      .set('Cookie', cookie)
      .send({
        status: 'contacted',
        notes: 'Called Alice; left a voicemail regarding consultation.',
      });

    expect(res.status).toBe(200);
    expect(res.body.data.lead.status).toBe('contacted');
    expect(res.body.data.lead.notes).toBe('Called Alice; left a voicemail regarding consultation.');

    const updated = await Lead.findById(lead.id);
    expect(updated.status).toBe('contacted');
    expect(updated.notes).toBe('Called Alice; left a voicemail regarding consultation.');
  });

  it('dedicated status endpoint updates status', async () => {
    const lead = await Lead.findOne({ tenantId: tenant._id, name: 'Alice Smith' });

    const res = await request(app)
      .patch(`${adminLeadsPath(tenant.id)}/${lead.id}/status`)
      .set('Cookie', cookie)
      .send({ status: 'qualified' });

    expect(res.status).toBe(200);
    expect(res.body.data.lead.status).toBe('qualified');
  });

  it('rejects attempt to modify forbidden internal fields (tenantId, source, _id)', async () => {
    const lead = await Lead.findOne({ tenantId: tenant._id, name: 'Alice Smith' });

    const res = await request(app)
      .patch(`${adminLeadsPath(tenant.id)}/${lead.id}`)
      .set('Cookie', cookie)
      .send({
        tenantId: otherTenant.id, // Forbidden ownership reassignment
      });

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('UNSUPPORTED_FIELD');

    // Verify tenantId remained unchanged in DB
    const unchanged = await Lead.findById(lead.id);
    expect(unchanged.tenantId.toString()).toBe(tenant._id.toString());
  });

  it('enforces tenant isolation on update: rejects updating another tenant’s lead', async () => {
    const otherLead = await Lead.findOne({ tenantId: otherTenant._id });

    const res = await request(app)
      .patch(`${adminLeadsPath(tenant.id)}/${otherLead.id}`)
      .set('Cookie', cookie)
      .send({ status: 'closed' });

    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe('LEAD_NOT_FOUND');
  });
});
