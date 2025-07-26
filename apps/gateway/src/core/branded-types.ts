export type CacheKey = string & { __brand: 'CacheKey' };
export type ScoreThreshold = number & { __brand: 'ScoreThreshold' };
export type RenderMs = number & { __brand: 'RenderMs' };

export const createCacheKey = (url: string): CacheKey => url as CacheKey;
export const createScoreThreshold = (value: number): ScoreThreshold => value as ScoreThreshold;
export const createRenderMs = (value: number): RenderMs => value as RenderMs;
