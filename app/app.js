'use strict';

const express = require('express');
const os = require('os');
const client = require('prom-client');

const register = new client.Registry();
client.collectDefaultMetrics({ register, prefix: 'sample_app_' });

const httpRequestsTotal = new client.Counter({
  name: 'sample_app_http_requests_total',
  help: 'Total HTTP requests',
  labelNames: ['method', 'route', 'status_code'],
  registers: [register],
});

const httpRequestDurationSeconds = new client.Histogram({
  name: 'sample_app_http_request_duration_seconds',
  help: 'HTTP request duration in seconds',
  labelNames: ['method', 'route', 'status_code'],
  buckets: [0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2.5],
  registers: [register],
});

const activeRequestsGauge = new client.Gauge({
  name: 'sample_app_active_requests',
  help: 'In-flight HTTP requests',
  registers: [register],
});

const app = express();
const PORT = parseInt(process.env.PORT || '3000', 10);
const APP_VERSION = process.env.APP_VERSION || '1.0.0';

app.use((req, res, next) => {
  const startHr = process.hrtime.bigint();
  activeRequestsGauge.inc();

  res.on('finish', () => {
    const durationSec = Number(process.hrtime.bigint() - startHr) / 1e9;
    const route = req.route ? req.route.path : req.path;
    const labels = { method: req.method, route, status_code: res.statusCode };
    httpRequestsTotal.inc(labels);
    httpRequestDurationSeconds.observe(labels, durationSec);
    activeRequestsGauge.dec();
  });

  next();
});

app.get('/', (req, res) => {
  res.json({
    message: 'Hello from the CI/CD sample app!',
    hostname: os.hostname(),
    version: APP_VERSION,
    pid: process.pid,
  });
});

app.get('/health', (req, res) => {
  res.json({
    status: 'ok',
    uptime: process.uptime(),
    timestamp: new Date().toISOString(),
  });
});

app.get('/metrics', async (req, res) => {
  try {
    res.set('Content-Type', register.contentType);
    res.end(await register.metrics());
  } catch (err) {
    res.status(500).end(err.message);
  }
});

let server;

function shutdown(signal) {
  console.log(JSON.stringify({ level: 'info', msg: `${signal} received — shutting down` }));
  server.close(() => {
    console.log(JSON.stringify({ level: 'info', msg: 'HTTP server closed' }));
    process.exit(0);
  });
  // Force exit if server hangs past 10s
  setTimeout(() => process.exit(1), 10_000).unref();
}

if (require.main === module) {
  server = app.listen(PORT, () => {
    console.log(JSON.stringify({ level: 'info', msg: 'Server started', port: PORT, version: APP_VERSION }));
  });

  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));
}

module.exports = app;
