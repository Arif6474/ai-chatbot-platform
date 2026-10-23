/**
 * tests/cors.production.test.js
 *
 * Targeted integration tests for the Step 8 CORS split.
 * Forces NODE_ENV=production so env.isProduction === true and the origin
 * allowlist is enforced for admin routes.
 *
 * Isolation strategy: set NODE_ENV before the file loads (Jest evaluates the
 * file fresh), then use jest.resetModules() + require() inside beforeAll so
 * env.js is re-evaluated with production=true.  We then use the SAME mongoose
 * instance that app.js requires (pulled from the re-required modules) for seed
 * data, which ensures the DB connection is shared correctly.
 */

const { MongoMemoryServer } = require('mongodb-memory-server');
const request = require('supertest');

// ── Override NODE_ENV before any app modules are loaded ────────────────────
const originalNodeEnv = process.env.NODE_ENV;
process.env.NODE_ENV = 'production';

let mongoServer;
let app;
let mongoose;
let Tenant;
let ChatbotConfiguration;

const CUSTOMER_ORIGIN = 'https://mysmileclinic.com';
const ADMIN_ORIGIN    = 'http://localhost:5173';
const ROGUE_ORIGIN    = 'https://evil-attacker.example.com';

beforeAll(async () => {
  mongoServer = await MongoMemoryServer.create();
  const mongoUri = mongoServer.getUri();

  // Provide required production env vars BEFORE modules are required.
  process.env.MONGODB_URI = mongoUri;
  process.env.JWT_SECRET  = 'production_test_secret_that_is_at_least_32_chars_long!!';

  // Reset module registry so env.js re-evaluates isProduction = true,
  // and app.js builds its CORS middlewares with that value.
  jest.resetModules();

  // Pull fresh instances from the reset registry.
  mongoose             = require('mongoose');
  app                  = require('../src/app');
  Tenant               = require('../src/models/Tenant');
  ChatbotConfiguration = require('../src/models/ChatbotConfiguration');

  // Connect the same mongoose instance that app.js uses.
  await mongoose.connect(mongoUri);

  // Seed fixtures.
  const tenant = await Tenant.create({
    name: 'Smile Dental Clinic',
    slug: 'smile-dental',
    status: 'active',
  });

  await ChatbotConfiguration.create({
    tenantId: tenant._id,
    displayName: 'Smile Assistant',
    welcomeMessage: 'Welcome!',
    enabled: true,
    fallbackMessage: 'Please contact us directly.',
  });
});

afterAll(async () => {
  await mongoose.disconnect();
  await mongoServer?.stop();
  // Restore so subsequent test files in the same jest worker run normally.
  process.env.NODE_ENV = originalNodeEnv;
  delete process.env.MONGODB_URI;
  delete process.env.JWT_SECRET;
  jest.resetModules();
});

// ─────────────────────────────────────────────────────────────────────────────
// 1. Public configuration endpoint — any customer origin must be allowed
// ─────────────────────────────────────────────────────────────────────────────
describe('Production CORS — Public Configuration Endpoint (GET /config)', () => {
  it('allows arbitrary customer origin and returns Access-Control-Allow-Origin: *', async () => {
    const res = await request(app)
      .get('/api/v1/public/chat/smile-dental/config')
      .set('Origin', CUSTOMER_ORIGIN);

    expect(res.headers['access-control-allow-origin']).toBe('*');
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
  });

  it('does NOT send Access-Control-Allow-Credentials: true (wildcard + credentials forbidden by spec)', async () => {
    const res = await request(app)
      .get('/api/v1/public/chat/smile-dental/config')
      .set('Origin', CUSTOMER_ORIGIN);

    expect(res.headers['access-control-allow-credentials']).not.toBe('true');
  });

  it('handles preflight OPTIONS from customer origin correctly', async () => {
    const res = await request(app)
      .options('/api/v1/public/chat/smile-dental/config')
      .set('Origin', CUSTOMER_ORIGIN)
      .set('Access-Control-Request-Method', 'GET')
      .set('Access-Control-Request-Headers', 'Content-Type');

    expect(res.headers['access-control-allow-origin']).toBe('*');
    expect(res.status).toBeLessThan(300);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 2. Public message endpoint — any customer origin must be allowed
// ─────────────────────────────────────────────────────────────────────────────
describe('Production CORS — Public Message Endpoint (POST /message)', () => {
  it('allows arbitrary customer origin and returns Access-Control-Allow-Origin: *', async () => {
    const res = await request(app)
      .post('/api/v1/public/chat/smile-dental/message')
      .set('Origin', CUSTOMER_ORIGIN)
      .set('Content-Type', 'application/json')
      .send({ message: 'What are your opening hours?' });

    // CORS header must be present regardless of model/fallback status.
    expect(res.headers['access-control-allow-origin']).toBe('*');
  });

  it('does NOT send Access-Control-Allow-Credentials: true on message endpoint', async () => {
    const res = await request(app)
      .post('/api/v1/public/chat/smile-dental/message')
      .set('Origin', CUSTOMER_ORIGIN)
      .send({ message: 'Hello' });

    expect(res.headers['access-control-allow-credentials']).not.toBe('true');
  });

  it('handles preflight OPTIONS from customer origin on message endpoint', async () => {
    const res = await request(app)
      .options('/api/v1/public/chat/smile-dental/message')
      .set('Origin', CUSTOMER_ORIGIN)
      .set('Access-Control-Request-Method', 'POST')
      .set('Access-Control-Request-Headers', 'Content-Type');

    expect(res.headers['access-control-allow-origin']).toBe('*');
    expect(res.status).toBeLessThan(300);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 3. Admin routes — unapproved origins are blocked in production
// ─────────────────────────────────────────────────────────────────────────────
describe('Production CORS — Admin Routes Reject Unapproved Origins', () => {
  it('does not reflect rogue origin in ACAO header on admin login preflight', async () => {
    const res = await request(app)
      .options('/api/v1/admin/auth/login')
      .set('Origin', ROGUE_ORIGIN)
      .set('Access-Control-Request-Method', 'POST')
      .set('Access-Control-Request-Headers', 'Content-Type');

    expect(res.headers['access-control-allow-origin']).not.toBe(ROGUE_ORIGIN);
    expect(res.headers['access-control-allow-origin']).not.toBe('*');
  });

  it('does not reflect customer website origin on admin tenant list endpoint', async () => {
    const res = await request(app)
      .get('/api/v1/admin/tenants')
      .set('Origin', CUSTOMER_ORIGIN);

    expect(res.headers['access-control-allow-origin']).not.toBe(CUSTOMER_ORIGIN);
    expect(res.headers['access-control-allow-origin']).not.toBe('*');
  });

  it('accepts configured admin frontend origin with credentials on login preflight', async () => {
    const res = await request(app)
      .options('/api/v1/admin/auth/login')
      .set('Origin', ADMIN_ORIGIN)
      .set('Access-Control-Request-Method', 'POST')
      .set('Access-Control-Request-Headers', 'Content-Type');

    expect(res.headers['access-control-allow-origin']).toBe(ADMIN_ORIGIN);
    expect(res.headers['access-control-allow-credentials']).toBe('true');
    expect(res.status).toBeLessThan(300);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 4. Widget script endpoint — any origin must be allowed
// ─────────────────────────────────────────────────────────────────────────────
describe('Production CORS — Widget Script Endpoint (GET /widget.js)', () => {
  it('allows any origin to fetch the widget bundle', async () => {
    const res = await request(app)
      .get('/widget.js')
      .set('Origin', CUSTOMER_ORIGIN);

    expect(res.headers['access-control-allow-origin']).toBe('*');
    // 200 if dist/widget.js exists, 404 if missing — both are acceptable.
    expect([200, 404]).toContain(res.status);
  });

  it('does NOT send Access-Control-Allow-Credentials: true on widget endpoint', async () => {
    const res = await request(app)
      .get('/widget.js')
      .set('Origin', CUSTOMER_ORIGIN);

    expect(res.headers['access-control-allow-credentials']).not.toBe('true');
  });
});
