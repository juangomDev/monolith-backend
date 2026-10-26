import client from 'prom-client';

const collectDefaultMetrics = client.collectDefaultMetrics;
const Registry = client.Registry;

export const metricsRegistry = new Registry();
collectDefaultMetrics({ register: metricsRegistry });

export const httpRequestsTotal = new client.Counter({
  name: 'http_requests_total',
  help: 'Total de solicitudes HTTP recibidas',
  labelNames: ['method', 'route', 'status_code'],
  registers: [metricsRegistry],
});

export const httpRequestDurationSeconds = new client.Histogram({
  name: 'http_request_duration_seconds',
  help: 'Duración de las solicitudes HTTP en segundos',
  labelNames: ['method', 'route', 'status_code'],
  buckets: [0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5, 10],
  registers: [metricsRegistry],
});

export const fileUploadsTotal = new client.Counter({
  name: 'file_uploads_total',
  help: 'Total de archivos subidos al sistema',
  labelNames: ['module', 'status'],
  registers: [metricsRegistry],
});
