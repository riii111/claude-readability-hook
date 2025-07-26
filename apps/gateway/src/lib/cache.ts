import { LRUCache } from 'lru-cache';
import type { CacheKey } from '../core/branded-types.js';
import type { CacheEntry, ExtractResponse } from '../core/types.js';
import { config } from './config.js';

export class CacheManager {
  private cache: LRUCache<CacheKey, CacheEntry>;
  private ttlMs: number;

  constructor(maxSize: number = config.cacheMaxSize, ttlSeconds: number = config.cacheTtlSec) {
    this.ttlMs = ttlSeconds * 1000;
    this.cache = new LRUCache({
      max: maxSize,
      ttl: this.ttlMs,
      updateAgeOnGet: false,
      updateAgeOnHas: false,
    });
  }

  get(url: CacheKey): ExtractResponse | null {
    const entry = this.cache.get(url);
    if (!entry) {
      return null;
    }

    return {
      ...entry.data,
      cached: true,
    };
  }

  set(url: CacheKey, data: ExtractResponse): void {
    const entry: CacheEntry = {
      data: { ...data, cached: false },
      timestamp: Date.now(),
    };
    this.cache.set(url, entry);
  }

  has(url: CacheKey): boolean {
    return this.cache.has(url);
  }

  clear(): void {
    this.cache.clear();
  }

  size(): number {
    return this.cache.size;
  }

  getStats() {
    return {
      size: this.cache.size,
      maxSize: this.cache.max,
      ttlMs: this.ttlMs,
    };
  }
}

export const cacheManager = new CacheManager();
