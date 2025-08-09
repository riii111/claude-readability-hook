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

export enum ExtractionEngine {
  Trafilatura = 'trafilatura',
  Readability = 'readability',
  TrafilaturaSSR = 'trafilatura+ssr',
  StackOverflowAPI = 'stackoverflow-api',
  RedditJSON = 'reddit-json',
}

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
}

export interface ExtractorServiceResponse {
  title: string;
  text: string;
  engine: 'trafilatura' | 'readability';
  score: number;
  success: boolean;
}

export interface RendererServiceResponse {
  html: string;
  renderTime: number;
  success: boolean;
}

export interface ReadabilityResult {
  title: string;
  text: string;
  success: boolean;
}
