const request = require('supertest');
const mongoose = require('mongoose');
const { MongoMemoryServer } = require('mongodb-memory-server');
const app = require('../src/app');
const AdminUser = require('../src/models/AdminUser');
const env = require('../src/config/env');

let mongoServer;

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
});

describe('Admin Authentication Endpoints', () => {
  const testEmail = 'admin@example.com';
  const testPassword = 'Password123!';

  async function seedAdmin(overrides = {}) {
    const passwordHash = await AdminUser.hashPassword(overrides.password || testPassword);
    return AdminUser.create({
      email: overrides.email || testEmail,
      passwordHash,
      role: 'admin',
      status: overrides.status || 'active',
    });
  }

  describe('POST /api/v1/admin/auth/login', () => {
    it('fails with 400 when email or password is missing', async () => {
      const res1 = await request(app)
        .post('/api/v1/admin/auth/login')
        .send({ email: testEmail });
      expect(res1.status).toBe(400);
      expect(res1.body.error.code).toBe('VALIDATION_ERROR');

      const res2 = await request(app)
        .post('/api/v1/admin/auth/login')
        .send({ password: testPassword });
      expect(res2.status).toBe(400);
      expect(res2.body.error.code).toBe('VALIDATION_ERROR');
    });

    it('fails with generic 401 when email does not exist', async () => {
      const res = await request(app)
        .post('/api/v1/admin/auth/login')
        .send({ email: 'nonexistent@example.com', password: testPassword });

      expect(res.status).toBe(401);
      expect(res.body.error.code).toBe('INVALID_CREDENTIALS');
      expect(res.body.error.message).toBe('Invalid email or password');
    });

    it('fails with generic 401 when password is wrong', async () => {
      await seedAdmin();

      const res = await request(app)
        .post('/api/v1/admin/auth/login')
        .send({ email: testEmail, password: 'WrongPassword999!' });

      expect(res.status).toBe(401);
      expect(res.body.error.code).toBe('INVALID_CREDENTIALS');
      expect(res.body.error.message).toBe('Invalid email or password');
    });

    it('fails with 401 when admin account is deactivated', async () => {
      await seedAdmin({ status: 'disabled' });

      const res = await request(app)
        .post('/api/v1/admin/auth/login')
        .send({ email: testEmail, password: testPassword });

      expect(res.status).toBe(401);
      expect(res.body.error.code).toBe('ACCOUNT_DEACTIVATED');
    });

    it('successfully authenticates with valid credentials, sets cookie, and excludes sensitive fields', async () => {
      await seedAdmin();

      const res = await request(app)
        .post('/api/v1/admin/auth/login')
        .send({ email: testEmail, password: testPassword });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.admin).toHaveProperty('id');
      expect(res.body.data.admin.email).toBe(testEmail);
      expect(res.body.data.admin.role).toBe('admin');

      // Security check: Never expose password or passwordHash
      expect(res.body.data.admin).not.toHaveProperty('password');
      expect(res.body.data.admin).not.toHaveProperty('passwordHash');
      expect(res.body.data.admin).not.toHaveProperty('_id');

      // Cookie check: Must set HTTP-only cookie
      const cookies = res.headers['set-cookie'];
      expect(cookies).toBeDefined();
      const authCookie = cookies.find((c) => c.startsWith(`${env.ADMIN_COOKIE_NAME}=`));
      expect(authCookie).toBeDefined();
      expect(authCookie).toContain('HttpOnly');
      expect(authCookie).toContain('SameSite=Lax');
    });
  });

  describe('GET /api/v1/admin/auth/me', () => {
    it('rejects unauthenticated request with 401', async () => {
      const res = await request(app).get('/api/v1/admin/auth/me');
      expect(res.status).toBe(401);
      expect(res.body.error.code).toBe('UNAUTHORIZED');
    });

    it('rejects invalid or tampered token with 401', async () => {
      const res = await request(app)
        .get('/api/v1/admin/auth/me')
        .set('Authorization', 'Bearer invalid_tampered_token_string');

      expect(res.status).toBe(401);
      expect(res.body.error.code).toBe('INVALID_TOKEN');
    });

    it('allows access with valid HTTP-only cookie and returns admin profile', async () => {
      await seedAdmin();

      // Login to obtain cookie
      const loginRes = await request(app)
        .post('/api/v1/admin/auth/login')
        .send({ email: testEmail, password: testPassword });

      const cookie = loginRes.headers['set-cookie'];

      // Access protected endpoint with cookie
      const meRes = await request(app)
        .get('/api/v1/admin/auth/me')
        .set('Cookie', cookie);

      expect(meRes.status).toBe(200);
      expect(meRes.body.success).toBe(true);
      expect(meRes.body.data.admin.email).toBe(testEmail);
      expect(meRes.body.data.admin).not.toHaveProperty('passwordHash');
    });

    it('allows access with valid Bearer token', async () => {
      await seedAdmin();

      // Login to obtain token
      const loginRes = await request(app)
        .post('/api/v1/admin/auth/login')
        .send({ email: testEmail, password: testPassword });

      const token = loginRes.body.data.token;

      // Access protected endpoint with Authorization header
      const meRes = await request(app)
        .get('/api/v1/admin/auth/me')
        .set('Authorization', `Bearer ${token}`);

      expect(meRes.status).toBe(200);
      expect(meRes.body.success).toBe(true);
      expect(meRes.body.data.admin.email).toBe(testEmail);
    });
  });

  describe('POST /api/v1/admin/auth/logout', () => {
    it('clears session cookie on logout', async () => {
      const res = await request(app).post('/api/v1/admin/auth/logout');
      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);

      const cookies = res.headers['set-cookie'];
      expect(cookies).toBeDefined();
      const authCookie = cookies.find((c) => c.startsWith(`${env.ADMIN_COOKIE_NAME}=`));
      expect(authCookie).toBeDefined();
      expect(authCookie).toContain('Expires=Thu, 01 Jan 1970');
    });
  });

  describe('Password Hashing & Model Security', () => {
    it('hashes passwords with bcrypt salt rounds and validates comparePassword', async () => {
      const rawPassword = 'SecureSecretPassword123!';
      const hash = await AdminUser.hashPassword(rawPassword);

      // Verify hash is not plaintext
      expect(hash).not.toBe(rawPassword);
      expect(hash.startsWith('$2a$') || hash.startsWith('$2b$')).toBe(true);

      const admin = new AdminUser({
        email: 'security@example.com',
        passwordHash: hash,
      });

      const isMatchValid = await admin.comparePassword(rawPassword);
      const isMatchInvalid = await admin.comparePassword('WrongPassword123!');

      expect(isMatchValid).toBe(true);
      expect(isMatchInvalid).toBe(false);
    });
  });
});
