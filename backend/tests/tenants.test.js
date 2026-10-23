const request = require('supertest');
const mongoose = require('mongoose');
const { MongoMemoryServer } = require('mongodb-memory-server');
const app = require('../src/app');
const AdminUser = require('../src/models/AdminUser');
const Tenant = require('../src/models/Tenant');
const env = require('../src/config/env');
const { signAdminToken } = require('../src/services/tokenService');

let mongoServer;
let adminUser;
let adminCookie;
let adminToken;

beforeAll(async () => {
  mongoServer = await MongoMemoryServer.create();
  const uri = mongoServer.getUri();
  await mongoose.connect(uri);
});

afterAll(async () => {
  await mongoose.disconnect();
  await mongoServer.stop();
});

beforeEach(async () => {
  await AdminUser.deleteMany({});
  await Tenant.deleteMany({});

  // Seed active admin for authenticated requests
  const passwordHash = await AdminUser.hashPassword('AdminPass123!');
  adminUser = await AdminUser.create({
    email: 'admin@platform.test',
    passwordHash,
    role: 'admin',
    status: 'active',
  });

  adminToken = signAdminToken(adminUser);
  adminCookie = `${env.ADMIN_COOKIE_NAME}=${adminToken}`;
});

describe('Admin Tenant Management Endpoints', () => {
  const sampleTenantData = {
    name: 'Acme Dental Care',
    slug: 'acme-dental-care',
    contactEmail: 'contact@acmedental.test',
    websiteUrl: 'https://acmedental.test',
    businessType: 'Dental Practice',
    status: 'active',
  };

  describe('1. Unauthenticated Access Protection', () => {
    it('rejects GET /api/v1/admin/tenants without auth', async () => {
      const res = await request(app).get('/api/v1/admin/tenants');
      expect(res.status).toBe(401);
      expect(res.body.success).toBe(false);
      expect(res.body.error.code).toBe('UNAUTHORIZED');
    });

    it('rejects POST /api/v1/admin/tenants without auth', async () => {
      const res = await request(app)
        .post('/api/v1/admin/tenants')
        .send(sampleTenantData);
      expect(res.status).toBe(401);
      expect(res.body.success).toBe(false);
      expect(res.body.error.code).toBe('UNAUTHORIZED');
    });

    it('rejects GET /api/v1/admin/tenants/:id without auth', async () => {
      const fakeId = new mongoose.Types.ObjectId().toString();
      const res = await request(app).get(`/api/v1/admin/tenants/${fakeId}`);
      expect(res.status).toBe(401);
      expect(res.body.success).toBe(false);
      expect(res.body.error.code).toBe('UNAUTHORIZED');
    });

    it('rejects PATCH /api/v1/admin/tenants/:id without auth', async () => {
      const fakeId = new mongoose.Types.ObjectId().toString();
      const res = await request(app)
        .patch(`/api/v1/admin/tenants/${fakeId}`)
        .send({ name: 'Updated Name' });
      expect(res.status).toBe(401);
      expect(res.body.success).toBe(false);
      expect(res.body.error.code).toBe('UNAUTHORIZED');
    });

    it('rejects PATCH /api/v1/admin/tenants/:id/status without auth', async () => {
      const fakeId = new mongoose.Types.ObjectId().toString();
      const res = await request(app)
        .patch(`/api/v1/admin/tenants/${fakeId}/status`)
        .send({ status: 'inactive' });
      expect(res.status).toBe(401);
      expect(res.body.success).toBe(false);
      expect(res.body.error.code).toBe('UNAUTHORIZED');
    });

    it('rejects access when token belongs to deactivated admin', async () => {
      await AdminUser.findByIdAndUpdate(adminUser._id, { status: 'disabled' });
      const res = await request(app)
        .get('/api/v1/admin/tenants')
        .set('Cookie', adminCookie);
      expect(res.status).toBe(401);
      expect(res.body.error.code).toBe('ACCOUNT_INACTIVE');
    });
  });

  describe('2. Tenant Creation (POST /api/v1/admin/tenants)', () => {
    it('creates a tenant successfully with all valid fields', async () => {
      const res = await request(app)
        .post('/api/v1/admin/tenants')
        .set('Cookie', adminCookie)
        .send(sampleTenantData);

      expect(res.status).toBe(201);
      expect(res.body.success).toBe(true);
      expect(res.body.data.tenant).toBeDefined();
      expect(res.body.data.tenant.name).toBe('Acme Dental Care');
      expect(res.body.data.tenant.slug).toBe('acme-dental-care');
      expect(res.body.data.tenant.contactEmail).toBe('contact@acmedental.test');
      expect(res.body.data.tenant.websiteUrl).toBe('https://acmedental.test');
      expect(res.body.data.tenant.businessType).toBe('Dental Practice');
      expect(res.body.data.tenant.status).toBe('active');
      expect(res.body.data.tenant.id).toBeDefined();
      expect(res.body.data.tenant._id).toBeUndefined();
      expect(res.body.data.tenant.__v).toBeUndefined();
    });

    it('creates a tenant and auto-derives normalized slug from name when slug is omitted', async () => {
      const res = await request(app)
        .post('/api/v1/admin/tenants')
        .set('Cookie', adminCookie)
        .send({ name: 'Apex Law & Consulting Group' });

      expect(res.status).toBe(201);
      expect(res.body.success).toBe(true);
      expect(res.body.data.tenant.slug).toBe('apex-law-consulting-group');
      expect(res.body.data.tenant.status).toBe('active');
      expect(res.body.data.tenant.contactEmail).toBeNull();
      expect(res.body.data.tenant.websiteUrl).toBeNull();
    });

    it('normalizes custom slug with uppercase and special characters', async () => {
      const res = await request(app)
        .post('/api/v1/admin/tenants')
        .set('Cookie', adminCookie)
        .send({
          name: 'Urban Fitness Studio',
          slug: '  Urban_Fitness--Studio!!  ',
        });

      expect(res.status).toBe(201);
      expect(res.body.data.tenant.slug).toBe('urban-fitness-studio');
    });

    it('rejects duplicate slug with 409 Conflict', async () => {
      await Tenant.create(sampleTenantData);

      const res = await request(app)
        .post('/api/v1/admin/tenants')
        .set('Cookie', adminCookie)
        .send({
          name: 'Another Acme Branch',
          slug: 'acme-dental-care',
        });

      expect(res.status).toBe(409);
      expect(res.body.success).toBe(false);
      expect(res.body.error.code).toBe('SLUG_CONFLICT');
      expect(res.body.error.message).toMatch(/already exists/i);
    });

    it('rejects creation when name is missing or too short', async () => {
      const res1 = await request(app)
        .post('/api/v1/admin/tenants')
        .set('Cookie', adminCookie)
        .send({ slug: 'my-tenant' });

      expect(res1.status).toBe(400);
      expect(res1.body.error.code).toBe('VALIDATION_ERROR');

      const res2 = await request(app)
        .post('/api/v1/admin/tenants')
        .set('Cookie', adminCookie)
        .send({ name: 'A' });

      expect(res2.status).toBe(400);
      expect(res2.body.error.code).toBe('VALIDATION_ERROR');
    });

    it('rejects creation when slug is invalid after normalization', async () => {
      const res = await request(app)
        .post('/api/v1/admin/tenants')
        .set('Cookie', adminCookie)
        .send({ name: 'Valid Name', slug: '---' });

      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe('VALIDATION_ERROR');
    });

    it('rejects invalid email format', async () => {
      const res = await request(app)
        .post('/api/v1/admin/tenants')
        .set('Cookie', adminCookie)
        .send({
          name: 'Valid Name',
          contactEmail: 'not-an-email',
        });

      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe('VALIDATION_ERROR');
      expect(res.body.error.message).toMatch(/valid contact email/i);
    });

    it('rejects invalid website URL format', async () => {
      const res = await request(app)
        .post('/api/v1/admin/tenants')
        .set('Cookie', adminCookie)
        .send({
          name: 'Valid Name',
          websiteUrl: 'ftp://invalid-protocol.com',
        });

      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe('VALIDATION_ERROR');
      expect(res.body.error.message).toMatch(/valid HTTP or HTTPS URL/i);
    });

    it('rejects invalid status value', async () => {
      const res = await request(app)
        .post('/api/v1/admin/tenants')
        .set('Cookie', adminCookie)
        .send({
          name: 'Valid Name',
          status: 'pending',
        });

      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe('VALIDATION_ERROR');
    });

    it('rejects unsupported fields (mass assignment prevention)', async () => {
      const res = await request(app)
        .post('/api/v1/admin/tenants')
        .set('Cookie', adminCookie)
        .send({
          name: 'Valid Name',
          role: 'superuser',
          isInternalAdmin: true,
          plan: 'enterprise_unlimited',
        });

      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe('UNSUPPORTED_FIELD');
      expect(res.body.error.message).toMatch(/Unsupported field\(s\) provided/i);
    });
  });

  describe('3. Tenant Listing & Pagination (GET /api/v1/admin/tenants)', () => {
    beforeEach(async () => {
      await Tenant.create([
        { name: 'Alpha Auto Repairs', slug: 'alpha-auto', status: 'active', businessType: 'Automotive' },
        { name: 'Beta Beauty Salon', slug: 'beta-beauty', status: 'active', businessType: 'Personal Care' },
        { name: 'Gamma Graphic Design', slug: 'gamma-design', status: 'inactive', businessType: 'Creative Agency' },
        { name: 'Delta Dental Clinic', slug: 'delta-dental', status: 'active', businessType: 'Healthcare' },
        { name: 'Epsilon Energy Consultants', slug: 'epsilon-energy', status: 'inactive', businessType: 'Consulting' },
      ]);
    });

    it('lists tenants with default pagination', async () => {
      const res = await request(app)
        .get('/api/v1/admin/tenants')
        .set('Cookie', adminCookie);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.tenants).toHaveLength(5);
      expect(res.body.data.pagination).toEqual({
        total: 5,
        page: 1,
        limit: 10,
        pages: 1,
      });
    });

    it('paginates results correctly with custom limit and page', async () => {
      const resPage1 = await request(app)
        .get('/api/v1/admin/tenants?page=1&limit=2')
        .set('Cookie', adminCookie);

      expect(resPage1.status).toBe(200);
      expect(resPage1.body.data.tenants).toHaveLength(2);
      expect(resPage1.body.data.pagination).toEqual({
        total: 5,
        page: 1,
        limit: 2,
        pages: 3,
      });

      const resPage2 = await request(app)
        .get('/api/v1/admin/tenants?page=2&limit=2')
        .set('Cookie', adminCookie);

      expect(resPage2.status).toBe(200);
      expect(resPage2.body.data.tenants).toHaveLength(2);
      expect(resPage2.body.data.pagination.page).toBe(2);
    });

    it('filters tenants by status', async () => {
      const activeRes = await request(app)
        .get('/api/v1/admin/tenants?status=active')
        .set('Cookie', adminCookie);

      expect(activeRes.status).toBe(200);
      expect(activeRes.body.data.tenants).toHaveLength(3);
      activeRes.body.data.tenants.forEach((t) => {
        expect(t.status).toBe('active');
      });

      const inactiveRes = await request(app)
        .get('/api/v1/admin/tenants?status=inactive')
        .set('Cookie', adminCookie);

      expect(inactiveRes.status).toBe(200);
      expect(inactiveRes.body.data.tenants).toHaveLength(2);
      inactiveRes.body.data.tenants.forEach((t) => {
        expect(t.status).toBe('inactive');
      });
    });

    it('filters tenants by search query matching name or slug', async () => {
      const resName = await request(app)
        .get('/api/v1/admin/tenants?search=dental')
        .set('Cookie', adminCookie);

      expect(resName.status).toBe(200);
      expect(resName.body.data.tenants).toHaveLength(1);
      expect(resName.body.data.tenants[0].slug).toBe('delta-dental');

      const resSlug = await request(app)
        .get('/api/v1/admin/tenants?search=gamma')
        .set('Cookie', adminCookie);

      expect(resSlug.status).toBe(200);
      expect(resSlug.body.data.tenants).toHaveLength(1);
      expect(resSlug.body.data.tenants[0].slug).toBe('gamma-design');
    });

    it('rejects invalid query parameters', async () => {
      const resPage = await request(app)
        .get('/api/v1/admin/tenants?page=-1')
        .set('Cookie', adminCookie);
      expect(resPage.status).toBe(400);
      expect(resPage.body.error.code).toBe('INVALID_QUERY');

      const resLimit = await request(app)
        .get('/api/v1/admin/tenants?limit=500')
        .set('Cookie', adminCookie);
      expect(resLimit.status).toBe(400);
      expect(resLimit.body.error.code).toBe('INVALID_QUERY');

      const resStatus = await request(app)
        .get('/api/v1/admin/tenants?status=archived')
        .set('Cookie', adminCookie);
      expect(resStatus.status).toBe(400);
      expect(resStatus.body.error.code).toBe('INVALID_QUERY');
    });
  });

  describe('4. Tenant Retrieval (GET /api/v1/admin/tenants/:id)', () => {
    it('retrieves an existing tenant by ID', async () => {
      const tenant = await Tenant.create(sampleTenantData);

      const res = await request(app)
        .get(`/api/v1/admin/tenants/${tenant._id}`)
        .set('Cookie', adminCookie);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.tenant.name).toBe(sampleTenantData.name);
      expect(res.body.data.tenant.slug).toBe(sampleTenantData.slug);
      expect(res.body.data.tenant.id).toBe(tenant._id.toString());
      expect(res.body.data.tenant._id).toBeUndefined();
      expect(res.body.data.tenant.__v).toBeUndefined();
    });

    it('returns 400 for invalid MongoDB ID format', async () => {
      const res = await request(app)
        .get('/api/v1/admin/tenants/invalid-id-string')
        .set('Cookie', adminCookie);

      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
      expect(res.body.error.code).toBe('INVALID_ID');
    });

    it('returns 404 for nonexistent tenant ID', async () => {
      const fakeId = new mongoose.Types.ObjectId().toString();
      const res = await request(app)
        .get(`/api/v1/admin/tenants/${fakeId}`)
        .set('Cookie', adminCookie);

      expect(res.status).toBe(404);
      expect(res.body.success).toBe(false);
      expect(res.body.error.code).toBe('TENANT_NOT_FOUND');
    });
  });

  describe('5. Tenant Update (PATCH /api/v1/admin/tenants/:id)', () => {
    let tenant;

    beforeEach(async () => {
      tenant = await Tenant.create(sampleTenantData);
    });

    it('updates permitted fields successfully', async () => {
      const res = await request(app)
        .patch(`/api/v1/admin/tenants/${tenant._id}`)
        .set('Cookie', adminCookie)
        .send({
          name: 'Acme Dental Specialists',
          businessType: 'Cosmetic Dentistry',
          contactEmail: 'info@acmedental.test',
          websiteUrl: 'https://new-acme.test',
        });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.tenant.name).toBe('Acme Dental Specialists');
      expect(res.body.data.tenant.businessType).toBe('Cosmetic Dentistry');
      expect(res.body.data.tenant.contactEmail).toBe('info@acmedental.test');
      expect(res.body.data.tenant.websiteUrl).toBe('https://new-acme.test');
    });

    it('updates slug with proper normalization and uniqueness check', async () => {
      const res = await request(app)
        .patch(`/api/v1/admin/tenants/${tenant._id}`)
        .set('Cookie', adminCookie)
        .send({ slug: 'acme-specialists' });

      expect(res.status).toBe(200);
      expect(res.body.data.tenant.slug).toBe('acme-specialists');
    });

    it('allows keeping the same slug without collision', async () => {
      const res = await request(app)
        .patch(`/api/v1/admin/tenants/${tenant._id}`)
        .set('Cookie', adminCookie)
        .send({ slug: tenant.slug, name: 'Renamed Acme' });

      expect(res.status).toBe(200);
      expect(res.body.data.tenant.name).toBe('Renamed Acme');
    });

    it('rejects slug update if duplicate with another tenant', async () => {
      await Tenant.create({ name: 'Other Business', slug: 'other-biz' });

      const res = await request(app)
        .patch(`/api/v1/admin/tenants/${tenant._id}`)
        .set('Cookie', adminCookie)
        .send({ slug: 'other-biz' });

      expect(res.status).toBe(409);
      expect(res.body.error.code).toBe('SLUG_CONFLICT');
    });

    it('allows clearing optional fields by sending null or empty string', async () => {
      const res = await request(app)
        .patch(`/api/v1/admin/tenants/${tenant._id}`)
        .set('Cookie', adminCookie)
        .send({
          contactEmail: null,
          websiteUrl: '',
          businessType: null,
        });

      expect(res.status).toBe(200);
      expect(res.body.data.tenant.contactEmail).toBeNull();
      expect(res.body.data.tenant.websiteUrl).toBeNull();
      expect(res.body.data.tenant.businessType).toBeNull();
    });

    it('rejects unsupported fields or mass assignment attempts', async () => {
      const res = await request(app)
        .patch(`/api/v1/admin/tenants/${tenant._id}`)
        .set('Cookie', adminCookie)
        .send({
          name: 'Updated Name',
          status: 'inactive', // status must be updated via dedicated /status endpoint
          _id: new mongoose.Types.ObjectId().toString(),
          adminSecret: 'secret123',
        });

      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe('UNSUPPORTED_FIELD');
    });

    it('rejects empty update payload', async () => {
      const res = await request(app)
        .patch(`/api/v1/admin/tenants/${tenant._id}`)
        .set('Cookie', adminCookie)
        .send({});

      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe('VALIDATION_ERROR');
    });

    it('returns 404 for nonexistent tenant', async () => {
      const fakeId = new mongoose.Types.ObjectId().toString();
      const res = await request(app)
        .patch(`/api/v1/admin/tenants/${fakeId}`)
        .set('Cookie', adminCookie)
        .send({ name: 'New Name' });

      expect(res.status).toBe(404);
      expect(res.body.error.code).toBe('TENANT_NOT_FOUND');
    });
  });

  describe('6. Tenant Status Activation & Deactivation (PATCH /api/v1/admin/tenants/:id/status)', () => {
    let tenant;

    beforeEach(async () => {
      tenant = await Tenant.create(sampleTenantData);
    });

    it('deactivates an active tenant with audit log', async () => {
      const consoleSpy = jest.spyOn(console, 'log').mockImplementation();

      const res = await request(app)
        .patch(`/api/v1/admin/tenants/${tenant._id}/status`)
        .set('Cookie', adminCookie)
        .send({ status: 'inactive' });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.tenant.status).toBe('inactive');

      // Verify DB persistence
      const updated = await Tenant.findById(tenant._id);
      expect(updated.status).toBe('inactive');

      // Verify audit log call
      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining('[AUDIT] Tenant status updated:')
      );
      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining('previousStatus=active, newStatus=inactive')
      );

      consoleSpy.mockRestore();
    });

    it('reactivates an inactive tenant', async () => {
      await Tenant.findByIdAndUpdate(tenant._id, { status: 'inactive' });

      const res = await request(app)
        .patch(`/api/v1/admin/tenants/${tenant._id}/status`)
        .set('Cookie', adminCookie)
        .send({ status: 'active' });

      expect(res.status).toBe(200);
      expect(res.body.data.tenant.status).toBe('active');
    });

    it('rejects invalid status value', async () => {
      const res = await request(app)
        .patch(`/api/v1/admin/tenants/${tenant._id}/status`)
        .set('Cookie', adminCookie)
        .send({ status: 'suspended' });

      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe('VALIDATION_ERROR');
    });

    it('rejects payload with extra unsupported fields on /status endpoint', async () => {
      const res = await request(app)
        .patch(`/api/v1/admin/tenants/${tenant._id}/status`)
        .set('Cookie', adminCookie)
        .send({ status: 'inactive', name: 'Hacked Name' });

      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe('UNSUPPORTED_FIELD');
    });

    it('returns 404 for nonexistent tenant on /status endpoint', async () => {
      const fakeId = new mongoose.Types.ObjectId().toString();
      const res = await request(app)
        .patch(`/api/v1/admin/tenants/${fakeId}/status`)
        .set('Cookie', adminCookie)
        .send({ status: 'inactive' });

      expect(res.status).toBe(404);
      expect(res.body.error.code).toBe('TENANT_NOT_FOUND');
    });
  });

  describe('7. Edge Cases: Slug Normalization, Database Constraints & Error Safety', () => {
    it('rejects Unicode-only or punctuation-only slugs that normalize to empty', async () => {
      const res = await request(app)
        .post('/api/v1/admin/tenants')
        .set('Cookie', adminCookie)
        .send({
          name: 'Emoji Tenant',
          slug: '☕☕☕',
        });

      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe('VALIDATION_ERROR');
    });

    it('rejects 12-byte non-hex string ID as invalid ID format', async () => {
      const res = await request(app)
        .get('/api/v1/admin/tenants/123456789012')
        .set('Cookie', adminCookie);

      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe('INVALID_ID');
    });

    it('handles MongoDB duplicate key error (code 11000) gracefully during tenant creation', async () => {
      const createSpy = jest.spyOn(Tenant, 'create').mockImplementationOnce(() => {
        const error = new Error('E11000 duplicate key error');
        error.code = 11000;
        throw error;
      });

      const res = await request(app)
        .post('/api/v1/admin/tenants')
        .set('Cookie', adminCookie)
        .send({ name: 'Concurrent Tenant' });

      expect(res.status).toBe(409);
      expect(res.body.error.code).toBe('SLUG_CONFLICT');
      expect(res.body.error.message).toMatch(/already exists/i);

      createSpy.mockRestore();
    });

    it('rejects update with invalid email format even when updating other fields', async () => {
      const tenant = await Tenant.create(sampleTenantData);

      const res = await request(app)
        .patch(`/api/v1/admin/tenants/${tenant._id}`)
        .set('Cookie', adminCookie)
        .send({
          contactEmail: 'not-an-email',
        });

      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe('VALIDATION_ERROR');
    });

    it('rejects update with invalid website URL format', async () => {
      const tenant = await Tenant.create(sampleTenantData);

      const res = await request(app)
        .patch(`/api/v1/admin/tenants/${tenant._id}`)
        .set('Cookie', adminCookie)
        .send({
          websiteUrl: 'ftp://not-http.org',
        });

      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe('VALIDATION_ERROR');
    });
  });

  describe('8. CSRF Protection for State-Changing Mutation Endpoints', () => {
    beforeAll(() => {
      process.env.ENFORCE_STRICT_CSRF = 'true';
    });

    afterAll(() => {
      delete process.env.ENFORCE_STRICT_CSRF;
    });

    it('allows tenant creation from an allowed Origin', async () => {
      const res = await request(app)
        .post('/api/v1/admin/tenants')
        .set('Cookie', adminCookie)
        .set('Origin', 'http://localhost:5173')
        .send({ name: 'Allowed Origin Tenant' });

      expect(res.status).toBe(201);
      expect(res.body.success).toBe(true);
      expect(res.body.data.tenant.name).toBe('Allowed Origin Tenant');
    });

    it('blocks tenant creation (POST) from a disallowed Origin with 403 Forbidden', async () => {
      const res = await request(app)
        .post('/api/v1/admin/tenants')
        .set('Cookie', adminCookie)
        .set('Origin', 'http://evil.com')
        .send({ name: 'Malicious Tenant Attempt' });

      expect(res.status).toBe(403);
      expect(res.body.success).toBe(false);
      expect(res.body.error.code).toBe('FORBIDDEN');
    });

    it('blocks tenant update (PATCH) from a disallowed Origin with 403 Forbidden', async () => {
      const tenant = await Tenant.create(sampleTenantData);

      const res = await request(app)
        .patch(`/api/v1/admin/tenants/${tenant._id}`)
        .set('Cookie', adminCookie)
        .set('Origin', 'http://attacker-site.com')
        .send({ name: 'Hacked Name' });

      expect(res.status).toBe(403);
      expect(res.body.error.code).toBe('FORBIDDEN');
    });

    it('blocks tenant status change (PATCH /status) from a disallowed Origin with 403 Forbidden', async () => {
      const tenant = await Tenant.create(sampleTenantData);

      const res = await request(app)
        .patch(`/api/v1/admin/tenants/${tenant._id}/status`)
        .set('Cookie', adminCookie)
        .set('Origin', 'http://phishing.org')
        .send({ status: 'inactive' });

      expect(res.status).toBe(403);
      expect(res.body.error.code).toBe('FORBIDDEN');
    });

    it('blocks mutation when Referer origin is disallowed', async () => {
      const tenant = await Tenant.create(sampleTenantData);

      const res = await request(app)
        .patch(`/api/v1/admin/tenants/${tenant._id}`)
        .set('Cookie', adminCookie)
        .set('Referer', 'http://evil.com/fake-admin')
        .send({ name: 'Malicious Referer Update' });

      expect(res.status).toBe(403);
      expect(res.body.error.code).toBe('FORBIDDEN');
    });

    it('permits Bearer-token API client without Origin or Cookie', async () => {
      const res = await request(app)
        .post('/api/v1/admin/tenants')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ name: 'CLI Tool Tenant' });

      expect(res.status).toBe(201);
      expect(res.body.data.tenant.name).toBe('CLI Tool Tenant');
    });

    it('blocks cookie-authenticated mutation with missing Origin in strict CSRF mode', async () => {
      process.env.ENFORCE_STRICT_CSRF = 'true';
      try {
        const res = await request(app)
          .post('/api/v1/admin/tenants')
          .set('Cookie', adminCookie)
          .send({ name: 'No Origin Strict Test' });

        expect(res.status).toBe(403);
        expect(res.body.error.code).toBe('FORBIDDEN');
      } finally {
        delete process.env.ENFORCE_STRICT_CSRF;
      }
    });
  });
});
