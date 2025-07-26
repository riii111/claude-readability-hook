export interface ExtractRequest {
  url: string;
}

export interface ExtractResponse {
  title: string;
  text: string;
  engine: ExtractionEngine;
  score: number;
  cached: boolean;
  renderTime?: number;
}

export type ExtractionEngine = 'trafilatura' | 'readability' | 'trafilatura+ssr';

export interface HealthResponse {
  status: 'healthy' | 'unhealthy';
  timestamp: number;
  services?: {
    extractor: boolean;
    renderer: boolean;
  };
}

export interface CacheEntry {
  data: ExtractResponse;
  timestamp: number;
}
