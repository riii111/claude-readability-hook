import { z } from 'zod';

const configSchema = z.object({
  port: z.number().min(1).max(65535),
  nodeEnv: z.enum(['development', 'production', 'test']),
  logLevel: z.enum(['error', 'warn', 'info', 'debug', 'trace']),

  extractorEndpoint: z.string().url(),
  rendererEndpoint: z.string().url(),

  fetchTimeoutMs: z.number().positive(),

  cacheTtlSec: z.number().positive(),
  cacheMaxSize: z.number().positive(),

  scoreThreshold: z.number().min(0),
  readabilityScoreFactor: z.number().positive(),

  allowDnsFailure: z.boolean(),
  blockedPorts: z.array(z.number().int().min(1).max(65535)),
});

const rawConfig = {
  port: Number.parseInt(process.env.GATEWAY_PORT || '7777', 10),
  nodeEnv: process.env.NODE_ENV || 'development',
  logLevel: process.env.LOG_LEVEL || 'info',

  extractorEndpoint: process.env.EXTRACTOR_ENDPOINT || 'http://extractor:8000',
  rendererEndpoint: process.env.RENDERER_ENDPOINT || 'http://renderer:3000',

  fetchTimeoutMs: Number.parseInt(process.env.FETCH_TIMEOUT_MS || '30000', 10),

  cacheTtlSec: Number.parseInt(process.env.CACHE_TTL_SEC || '86400', 10),
  cacheMaxSize: Number.parseInt(process.env.CACHE_MAX_SIZE || '1000', 10),

  scoreThreshold: Number.parseInt(process.env.SCORE_THRESHOLD || '50', 10),
  readabilityScoreFactor: Number.parseFloat(process.env.READABILITY_SCORE_FACTOR || '0.8'),

  allowDnsFailure: process.env.ALLOW_DNS_FAILURE === 'true',
  blockedPorts: (process.env.BLOCKED_PORTS || '22,3306,5432,6379,9200,27017')
    .split(',')
    .map((port) => Number.parseInt(port.trim(), 10)),
};

const configValidation = configSchema.safeParse(rawConfig);

if (!configValidation.success) {
  // biome-ignore lint/suspicious/noConsole: Configuration error logging is necessary at startup
  console.error('❌ Invalid configuration:', configValidation.error.flatten());
  process.exit(1);
}

export const config = configValidation.data;
