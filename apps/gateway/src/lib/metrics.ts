import { Counter, Gauge, Histogram, collectDefaultMetrics, register } from 'prom-client';

collectDefaultMetrics({
  prefix: 'gateway_',
});

export const httpRequestsTotal = new Counter({
  name: 'gateway_http_requests_total',
  help: 'Total number of HTTP requests',
  labelNames: ['method', 'endpoint', 'status_code'],
});

export const httpRequestDuration = new Histogram({
  name: 'gateway_http_request_duration_seconds',
  help: 'HTTP request duration in seconds',
  labelNames: ['method', 'endpoint'],
  buckets: [0.001, 0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2],
});

export const cacheOperationsTotal = new Counter({
  name: 'gateway_cache_operations_total',
  help: 'Total number of cache operations',
  labelNames: ['operation'],
});

export const cacheSize = new Gauge({
  name: 'gateway_cache_size',
  help: 'Current number of items in cache',
});

export const extractionAttemptsTotal = new Counter({
  name: 'gateway_extraction_attempts_total',
  help: 'Total number of content extraction attempts',
  labelNames: ['engine', 'success'],
});

export const extractionDuration = new Histogram({
  name: 'gateway_extraction_duration_seconds',
  help: 'Content extraction duration in seconds',
  labelNames: ['engine'],
  buckets: [0.1, 0.5, 1, 2, 5, 10, 30],
});

export const rendererRequestsTotal = new Counter({
  name: 'gateway_renderer_requests_total',
  help: 'Total number of renderer requests',
  labelNames: ['success'],
});

export const rendererDuration = new Histogram({
  name: 'gateway_renderer_duration_seconds',
  help: 'Renderer processing duration in seconds',
  buckets: [0.5, 1, 2, 5, 10, 15, 30, 60],
});

export const ssrDetectionTotal = new Counter({
  name: 'gateway_ssr_detection_total',
  help: 'Total number of SSR detections',
  labelNames: ['required'],
});

export const urlTransformationsTotal = new Counter({
  name: 'gateway_url_transformations_total',
  help: 'Total number of URL transformations',
  labelNames: ['type'],
});

export const externalServiceHealthCheck = new Gauge({
  name: 'gateway_external_service_health',
  help: 'Health status of external services (1=healthy, 0=unhealthy)',
  labelNames: ['service'],
});

export function trackHttpRequest(
  method: string,
  endpoint: string,
  statusCode: number,
  durationMs: number
): void {
  httpRequestsTotal.inc({ method, endpoint, status_code: statusCode.toString() });
  httpRequestDuration.observe({ method, endpoint }, durationMs / 1000);
}

export function trackCacheHit(_url: string): void {
  cacheOperationsTotal.inc({ operation: 'hit' });
}

export function trackCacheMiss(_url: string): void {
  cacheOperationsTotal.inc({ operation: 'miss' });
}

export function trackCacheSet(_url: string): void {
  cacheOperationsTotal.inc({ operation: 'set' });
}

export function updateCacheSize(size: number): void {
  cacheSize.set(size);
}

export function trackExtractionAttempt(engine: string, success: boolean, durationMs: number): void {
  extractionAttemptsTotal.inc({ engine, success: success.toString() });
  extractionDuration.observe({ engine }, durationMs / 1000);
}

export function trackRendererRequest(success: boolean, durationMs: number): void {
  rendererRequestsTotal.inc({ success: success.toString() });
  rendererDuration.observe(durationMs / 1000);
}

export function trackSSRDetection(required: boolean): void {
  ssrDetectionTotal.inc({ required: required.toString() });
}

export function trackUrlTransformation(
  type: 'amp_removal' | 'print_param_addition' | 'none'
): void {
  urlTransformationsTotal.inc({ type });
}

export function updateExternalServiceHealth(service: string, healthy: boolean): void {
  externalServiceHealthCheck.set({ service }, healthy ? 1 : 0);
}

export { register };
