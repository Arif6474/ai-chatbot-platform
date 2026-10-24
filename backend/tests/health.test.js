const request = require('supertest');
const app = require('../src/app');

describe('Health and Foundation Endpoints', () => {
  it('GET /health returns 200 and valid JSON health status', async () => {
    const res = await request(app).get('/health');
    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('status', 'ok');
    expect(res.body).toHaveProperty('service', 'ai-chatbot-backend');
    expect(res.body).toHaveProperty('timestamp');
    expect(res.body).toHaveProperty('environment');
    expect(res.body).toHaveProperty('database');
  });

  it('GET /api/v1/health returns 200 and valid JSON health status', async () => {
    const res = await request(app).get('/api/v1/health');
    expect(res.status).toBe(200);
    expect(res.body.status).toBe('ok');
  });

  it('GET /health/ready and GET /api/v1/health/ready report readiness without leaking internals', async () => {
    const res = await request(app).get('/health/ready');
    // In test environment without persistent DB, status code is 503 or 200 depending on connection
    expect([200, 503]).toContain(res.status);
    expect(res.body).toHaveProperty('status');
    expect(res.body).toHaveProperty('service', 'ai-chatbot-backend');
    expect(res.body).toHaveProperty('database');
    expect(res.body).not.toHaveProperty('connectionString');
    expect(res.body).not.toHaveProperty('MONGODB_URI');

    const apiRes = await request(app).get('/api/v1/health/ready');
    expect([200, 503]).toContain(apiRes.status);
    expect(apiRes.body).toHaveProperty('status');
  });

  it('GET /non-existent-route returns 404 with structured error response', async () => {
    const res = await request(app).get('/non-existent-route');
    expect(res.status).toBe(404);
    expect(res.body).toHaveProperty('success', false);
    expect(res.body.error).toHaveProperty('code', 'NOT_FOUND');
    expect(res.body.error).toHaveProperty('message');
  });
});
