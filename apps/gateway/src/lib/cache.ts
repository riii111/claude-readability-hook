import { LRUCache } from 'lru-cache';
import type { CacheKey } from '../core/branded-types.js';
import type { CacheEntry, ExtractResponse } from '../core/types.js';
import { config } from './config.js';
import { trackCacheHit, trackCacheMiss, trackCacheSet, updateCacheSize } from './metrics.js';

export class CacheManager {
  private cache: LRUCache<CacheKey, CacheEntry>;
  private ttlMs: number;
  private syncInterval?: NodeJS.Timeout | undefined;

  constructor(maxSize: number = config.cacheMaxSize, ttlSeconds: number = config.cacheTtlSec) {
    this.ttlMs = ttlSeconds * 1000;
    this.cache = new LRUCache({
      max: maxSize,
      ttl: this.ttlMs,
      updateAgeOnGet: false,
      updateAgeOnHas: false,
      dispose: () => {
        updateCacheSize(this.cache.size);
      },
    });
    updateCacheSize(0);
    
    // Disable periodic sync in test environment to prevent interval leaks
    if (config.nodeEnv !== 'test') {
      this.startPeriodicSync();
    }
  }

  private startPeriodicSync(): void {
    const syncIntervalMs = Math.max(this.ttlMs / 10, 60000);
    this.syncInterval = setInterval(() => {
      updateCacheSize(this.cache.size);
    }, syncIntervalMs);
  }

  private stopPeriodicSync(): void {
    if (this.syncInterval) {
      clearInterval(this.syncInterval);
      this.syncInterval = undefined;
    }
  }

  get(url: CacheKey): ExtractResponse | null {
    const entry = this.cache.get(url);
    if (!entry) {
      trackCacheMiss(url);
      return null;
    }

    trackCacheHit(url);
    return {
      ...entry.data,
      cached: true,
    };
  }

  set(url: CacheKey, data: ExtractResponse): void {
    const entry: CacheEntry = {
      data: { ...data, cached: false },
    };
    this.cache.set(url, entry);
    trackCacheSet(url);
    updateCacheSize(this.cache.size);
  }

  has(url: CacheKey): boolean {
    return this.cache.has(url);
  }

  clear(): void {
    this.cache.clear();
    updateCacheSize(0);
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

  destroy(): void {
    this.stopPeriodicSync();
    this.clear();
  }
}

export const cacheManager = new CacheManager();
