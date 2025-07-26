import { LRUCache } from 'lru-cache';
import type { CacheEntry, ExtractResponse } from '../core/types.js';
import { config } from './config.js';

export class CacheManager {
  private cache: LRUCache<string, CacheEntry>;
  private ttlMs: number;

  constructor(maxSize: number = config.cacheMaxSize, ttlSeconds: number = config.cacheTtlSec) {
    this.ttlMs = ttlSeconds * 1000;
    this.cache = new LRUCache({
      max: maxSize,
      ttl: this.ttlMs,
      updateAgeOnGet: true,
      updateAgeOnHas: true,
    });
  }

  get(url: string): ExtractResponse | null {
    const entry = this.cache.get(url);
    if (!entry) {
      return null;
    }

    // LRU cache extends TTL on access, but we want consistent age-based validation
    if (Date.now() - entry.timestamp > this.ttlMs) {
      this.cache.delete(url);
      return null;
    }

    // Original entry stores cached:false to maintain data integrity
    return {
      ...entry.data,
      cached: true,
    };
  }

  set(url: string, data: ExtractResponse): void {
    const entry: CacheEntry = {
      data: { ...data, cached: false },
      timestamp: Date.now(),
    };
    this.cache.set(url, entry);
  }

  has(url: string): boolean {
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
