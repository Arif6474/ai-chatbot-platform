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

  it('GET /health/ready, GET /api/v1/health/ready, GET /ready, and GET /api/v1/ready report readiness without leaking internals', async () => {
    const endpoints = ['/health/ready', '/api/v1/health/ready', '/ready', '/api/v1/ready'];

    for (const endpoint of endpoints) {
      const res = await request(app).get(endpoint);
      expect([200, 503]).toContain(res.status);
      expect(res.body).toHaveProperty('status');
      expect(res.body).toHaveProperty('service', 'ai-chatbot-backend');
      expect(res.body).toHaveProperty('database');
      expect(res.body).not.toHaveProperty('connectionString');
      expect(res.body).not.toHaveProperty('MONGODB_URI');
    }
  });

  it('readiness returns 503 not_ready when database is disconnected without leaking configuration', async () => {
    const dbConfig = require('../src/config/database');
    const spy = jest.spyOn(dbConfig, 'getDatabaseStatus').mockReturnValue('disconnected');

    const res = await request(app).get('/ready');
    expect(res.status).toBe(503);
    expect(res.body.status).toBe('not_ready');
    expect(res.body.database).toBe('disconnected');
    expect(res.body).not.toHaveProperty('connectionString');
    expect(res.body).not.toHaveProperty('MONGODB_URI');

    spy.mockRestore();
  });

  it('readiness returns 200 ready when database is connected', async () => {
    const dbConfig = require('../src/config/database');
    const spy = jest.spyOn(dbConfig, 'getDatabaseStatus').mockReturnValue('connected');

    const res = await request(app).get('/ready');
    expect(res.status).toBe(200);
    expect(res.body.status).toBe('ready');
    expect(res.body.database).toBe('connected');

    spy.mockRestore();
  });

  it('GET /non-existent-route returns 404 with structured error response', async () => {
    const res = await request(app).get('/non-existent-route');
    expect(res.status).toBe(404);
    expect(res.body).toHaveProperty('success', false);
    expect(res.body.error).toHaveProperty('code', 'NOT_FOUND');
    expect(res.body.error).toHaveProperty('message');
  });
});
