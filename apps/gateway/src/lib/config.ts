export const config = {
  port: parseInt(process.env.GATEWAY_PORT || '7777', 10),
  nodeEnv: process.env.NODE_ENV || 'development',
  logLevel: process.env.LOG_LEVEL || 'info',
  
  // サービスエンドポイント
  extractorEndpoint: process.env.EXTRACTOR_ENDPOINT || 'http://extractor:8000',
  rendererEndpoint: process.env.RENDERER_ENDPOINT || 'http://renderer:3000',
  
  // タイムアウト設定
  fetchTimeoutMs: parseInt(process.env.FETCH_TIMEOUT_MS || '30000', 10),
  
  // キャッシュ設定
  cacheTtlSec: parseInt(process.env.CACHE_TTL_SEC || '86400', 10),
  cacheMaxSize: parseInt(process.env.CACHE_MAX_SIZE || '1000', 10),
  
  // 抽出設定
  scoreThreshold: parseInt(process.env.SCORE_THRESHOLD || '50', 10),
  
  // セキュリティ設定
  blockedIps: (process.env.BLOCKED_IPS || '10.0.0.0/8,172.16.0.0/12,192.168.0.0/16,127.0.0.0/8')
    .split(',')
    .map(ip => ip.trim()),
} as const;