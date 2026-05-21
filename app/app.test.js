const request = require('supertest');
const app = require('./app');

describe('GET /', () => {
  it('returns 200 with message, hostname, version, pid', async () => {
    const res = await request(app).get('/');
    expect(res.statusCode).toBe(200);
    expect(res.body).toHaveProperty('message');
    expect(res.body).toHaveProperty('hostname');
    expect(res.body).toHaveProperty('version');
    expect(res.body).toHaveProperty('pid');
  });
});

describe('GET /health', () => {
  it('returns 200 with status ok, uptime, timestamp', async () => {
    const res = await request(app).get('/health');
    expect(res.statusCode).toBe(200);
    expect(res.body.status).toBe('ok');
    expect(res.body).toHaveProperty('uptime');
    expect(res.body).toHaveProperty('timestamp');
  });
});

describe('GET /metrics', () => {
  it('returns 200 with Prometheus text exposition format', async () => {
    const res = await request(app).get('/metrics');
    expect(res.statusCode).toBe(200);
    expect(res.headers['content-type']).toMatch(/text\/plain/);
    // Verify custom metrics are registered
    expect(res.text).toMatch(/sample_app_http_requests_total/);
    expect(res.text).toMatch(/sample_app_http_request_duration_seconds/);
    expect(res.text).toMatch(/sample_app_active_requests/);
    // Verify default Node.js metrics are collected
    expect(res.text).toMatch(/sample_app_nodejs_heap_size_used_bytes/);
  });
});
