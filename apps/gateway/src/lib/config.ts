// Application configuration management with environment variable parsing and validation
import { z } from 'zod';

const configSchema = z.object({
  port: z.number().min(1).max(65535),
  nodeEnv: z.enum(['development', 'production', 'test']),
  logLevel: z.enum(['error', 'warn', 'info', 'debug', 'trace']),

  extractorEndpoint: z.url(),
  rendererEndpoint: z.url(),

  fetchTimeoutMs: z.number().positive(),
  rendererConcurrency: z.number().positive().max(20), // Max concurrent browser renders

  cacheTtlSec: z.number().positive(),
  cacheMaxSize: z.number().positive(),

  scoreThreshold: z.number().min(0), // Expected scale: 0-100 (normalized score)
  readabilityScoreFactor: z.number().positive(),

  // SSR detection settings
  ssrThreshold: z.number().positive(),
  ssrHtmlSizeThreshold: z.number().positive(),
  ssrScriptRatioThreshold: z.number().positive(),
  ssrScriptDivisor: z.number().positive(),
  ssrNoscriptMinLength: z.number().positive(),
  ssrWeights: z.object({
    smallSize: z.number(),
    highScriptRatio: z.number(),
    frameworkMarkers: z.number(),
    spaStructure: z.number(),
    noscriptContent: z.number(),
  }),

  allowDnsFailure: z.boolean(),
  blockedPorts: z.array(z.number().int().min(1).max(65535)),

  // Domain-specific handler tunables
  soMaxRpm: z.number().positive(),
  soTopAnswersLimit: z.number().positive(),
  redditMinIntervalMs: z.number().positive(),
  redditTopLevelLimit: z.number().positive(),
  redditRepliesPerTopLimit: z.number().positive(),

  // HTTP fetch safety settings
  maxHtmlBytes: z.number().positive(),
  maxRedirectFollows: z.number().min(0).max(10),

  // Rate limiting settings (moved from server.ts)
  rateLimitMax: z.number().positive(),
  rateLimitTimeWindow: z.string(),
});

const rawConfig = {
  port: Number.parseInt(process.env.GATEWAY_PORT || '7777', 10),
  nodeEnv: process.env.NODE_ENV || 'development',
  logLevel: process.env.LOG_LEVEL || 'info',

  extractorEndpoint: process.env.EXTRACTOR_ENDPOINT || 'http://extractor:8000',
  rendererEndpoint: process.env.RENDERER_ENDPOINT || 'http://renderer:3000',

  fetchTimeoutMs: Number.parseInt(process.env.FETCH_TIMEOUT_MS || '30000', 10),
  rendererConcurrency: Number.parseInt(process.env.RENDERER_CONCURRENCY || '5', 10),

  cacheTtlSec: Number.parseInt(process.env.CACHE_TTL_SEC || '86400', 10),
  cacheMaxSize: Number.parseInt(process.env.CACHE_MAX_SIZE || '1000', 10),

  scoreThreshold: Number.parseInt(process.env.SCORE_THRESHOLD || '50', 10),
  readabilityScoreFactor: Number.parseFloat(process.env.READABILITY_SCORE_FACTOR || '0.8'),

  // SSR detection settings with defaults
  ssrThreshold: Number.parseFloat(process.env.SSR_THRESHOLD || '4.0'),
  ssrHtmlSizeThreshold: Number.parseInt(process.env.SSR_HTML_SIZE_THRESHOLD || '5000', 10),
  ssrScriptRatioThreshold: Number.parseFloat(process.env.SSR_SCRIPT_RATIO_THRESHOLD || '0.1'),
  ssrScriptDivisor: Number.parseInt(process.env.SSR_SCRIPT_DIVISOR || '1000', 10),
  ssrNoscriptMinLength: Number.parseInt(process.env.SSR_NOSCRIPT_MIN_LENGTH || '50', 10),
  ssrWeights: {
    smallSize: Number.parseFloat(process.env.SSR_WEIGHT_SMALL_SIZE || '3.0'),
    highScriptRatio: Number.parseFloat(process.env.SSR_WEIGHT_HIGH_SCRIPT_RATIO || '2.0'),
    frameworkMarkers: Number.parseFloat(process.env.SSR_WEIGHT_FRAMEWORK_MARKERS || '4.0'),
    spaStructure: Number.parseFloat(process.env.SSR_WEIGHT_SPA_STRUCTURE || '2.5'),
    noscriptContent: Number.parseFloat(process.env.SSR_WEIGHT_NOSCRIPT_CONTENT || '2.0'),
  },

  allowDnsFailure: process.env.ALLOW_DNS_FAILURE === 'true',
  blockedPorts: (process.env.BLOCKED_PORTS || '22,3306,5432,6379,9200,27017')
    .split(',')
    .map((port) => Number.parseInt(port.trim(), 10)),

  // Domain-specific handler tunables with sensible defaults
  soMaxRpm: Number.parseInt(process.env.STACKOVERFLOW_MAX_RPM || '10', 10),
  soTopAnswersLimit: Number.parseInt(process.env.SO_TOP_ANSWERS_LIMIT || '5', 10),
  redditMinIntervalMs: Number.parseInt(process.env.REDDIT_MIN_INTERVAL_MS || '600', 10),
  redditTopLevelLimit: Number.parseInt(process.env.REDDIT_TOPLEVEL_LIMIT || '20', 10),
  redditRepliesPerTopLimit: Number.parseInt(process.env.REDDIT_REPLIES_PER_TOP_LIMIT || '5', 10),

  // HTTP fetch safety settings
  maxHtmlBytes: Number.parseInt(process.env.MAX_HTML_BYTES || '10485760', 10), // 10MB
  maxRedirectFollows: Number.parseInt(process.env.MAX_REDIRECT_FOLLOWS || '5', 10),

  // Rate limiting settings
  rateLimitMax: Number.parseInt(process.env.RATE_LIMIT_MAX || '100', 10),
  rateLimitTimeWindow: process.env.RATE_LIMIT_TIME_WINDOW || '1 minute',
};

const configValidation = configSchema.safeParse(rawConfig);

if (!configValidation.success) {
  // biome-ignore lint/suspicious/noConsole: Configuration error logging is necessary at startup
  console.error('❌ Invalid configuration:', configValidation.error.issues);
  process.exit(1);
}

export const config = configValidation.data;
