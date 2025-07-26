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

    // TTLチェック（LRUCacheの内部TTLに加えて明示的にチェック）
    if (Date.now() - entry.timestamp > this.ttlMs) {
      this.cache.delete(url);
      return null;
    }

    // キャッシュヒット時はcachedフラグをtrueに設定
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

  // キャッシュ統計情報を取得
  getStats() {
    return {
      size: this.cache.size,
      maxSize: this.cache.max,
      ttlMs: this.ttlMs,
    };
  }

  // URLをキャッシュキーに正規化
  private normalizeUrl(url: string): string {
    try {
      const urlObj = new URL(url);
      // クエリパラメータをソートして正規化
      urlObj.searchParams.sort();
      return urlObj.toString();
    } catch {
      // URL解析に失敗した場合はそのまま返す
      return url;
    }
  }
}

// シングルトンインスタンス
export const cacheManager = new CacheManager();
