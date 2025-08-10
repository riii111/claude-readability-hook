import { beforeEach, describe, expect, it } from 'bun:test';
import { CacheManager } from '../../../src/lib/cache';

describe('Cache Manager', () => {
  let cache: CacheManager;

  beforeEach(() => {
    cache = new CacheManager(100, 1);
  });

  describe('basic operations', () => {
    it('returns_null_on_miss', () => {
      const result = cache.get('non-existent-url');
      expect(result).toBeNull();
    });

    it('returns_cached_data_on_hit', () => {
      const testData = {
        title: 'Test Title',
        text: 'Test content',
        score: 75.5,
        engine: 'trafilatura' as const,
        success: true,
      };

      cache.set('https://example.com', testData);
      const result = cache.get('https://example.com');

      expect(result).not.toBeNull();
      expect(result?.title).toBe('Test Title');
      expect(result?.text).toBe('Test content');
      expect(result?.cached).toBe(true);
    });

    it('overwrites_existing_entry', () => {
      const initial = {
        title: 'Initial',
        text: 'Initial text',
        score: 50,
        engine: 'trafilatura' as const,
        success: true,
      };

      const updated = {
        title: 'Updated',
        text: 'Updated text',
        score: 80,
        engine: 'readability' as const,
        success: true,
      };

      cache.set('https://example.com', initial);
      cache.set('https://example.com', updated);

      const result = cache.get('https://example.com');
      expect(result?.title).toBe('Updated');
      expect(result?.engine).toBe('readability');
    });
  });

  describe('cached flag behavior', () => {
    it('sets_cached_true_on_hit', () => {
      const data = {
        title: 'Test',
        text: 'Content',
        score: 60,
        engine: 'trafilatura' as const,
        success: true,
      };

      cache.set('https://example.com', data);
      const result = cache.get('https://example.com');

      expect(result?.cached).toBe(true);
    });

    it('preserves_other_fields_when_adding_cached_flag', () => {
      const data = {
        title: 'Test',
        text: 'Content with special chars: äöü',
        score: 99.9,
        engine: 'stackoverflow-api' as const,
        success: true,
        renderTime: 1234,
      };

      cache.set('https://example.com', data);
      const result = cache.get('https://example.com');

      expect(result?.title).toBe('Test');
      expect(result?.text).toBe('Content with special chars: äöü');
      expect(result?.score).toBe(99.9);
      expect(result?.engine).toBe('stackoverflow-api');
      expect(result?.renderTime).toBe(1234);
      expect(result?.cached).toBe(true);
    });
  });

  describe('TTL behavior', () => {
    it('returns_null_after_ttl_expires', async () => {
      const shortCache = new CacheManager(100, 0.1);

      shortCache.set('https://example.com', {
        title: 'Test',
        text: 'Content',
        score: 50,
        engine: 'trafilatura' as const,
        success: true,
      });

      expect(shortCache.get('https://example.com')).not.toBeNull();

      await Bun.sleep(150);

      expect(shortCache.get('https://example.com')).toBeNull();
    });

    it('refreshes_ttl_on_set', async () => {
      const shortCache = new CacheManager(100, 0.2);

      const data = {
        title: 'Test',
        text: 'Content',
        score: 50,
        engine: 'trafilatura' as const,
        success: true,
      };

      shortCache.set('https://example.com', data);

      await Bun.sleep(100);
      shortCache.set('https://example.com', data);

      await Bun.sleep(100);
      expect(shortCache.get('https://example.com')).not.toBeNull();

      await Bun.sleep(100);
      expect(shortCache.get('https://example.com')).toBeNull();
    });
  });

  describe('size management', () => {
    it('respects_max_size_limit', () => {
      const smallCache = new CacheManager(3, 60);

      const data = {
        title: 'Test',
        text: 'Content',
        score: 50,
        engine: 'trafilatura' as const,
        success: true,
      };

      smallCache.set('url1', data);
      smallCache.set('url2', data);
      smallCache.set('url3', data);

      expect(smallCache.size()).toBe(3);

      smallCache.set('url4', data);

      expect(smallCache.size()).toBe(3);
      expect(smallCache.get('url1')).toBeNull();
      expect(smallCache.get('url4')).not.toBeNull();
    });

    it('updates_size_on_clear', () => {
      cache.set('url1', {
        title: 'Test',
        text: 'Content',
        score: 50,
        engine: 'trafilatura' as const,
        success: true,
      });
      cache.set('url2', {
        title: 'Test2',
        text: 'Content2',
        score: 60,
        engine: 'readability' as const,
        success: true,
      });

      expect(cache.size()).toBe(2);

      cache.clear();

      expect(cache.size()).toBe(0);
      expect(cache.get('url1')).toBeNull();
      expect(cache.get('url2')).toBeNull();
    });
  });

  // TODO: Statistics tests disabled - CacheManager implementation doesn't have getStats() method
  // describe('statistics', () => {
  //   // Statistics tracking is handled by metrics.ts module, not CacheManager directly
  // });

  describe('edge cases', () => {
    it('handles_empty_url_key', () => {
      const data = {
        title: 'Test',
        text: 'Content',
        score: 50,
        engine: 'trafilatura' as const,
        success: true,
      };

      cache.set('', data);
      const result = cache.get('');

      expect(result).not.toBeNull();
      expect(result?.title).toBe('Test');
    });

    it('handles_very_long_url_keys', () => {
      const longUrl = `https://example.com/${'a'.repeat(5000)}`;
      const data = {
        title: 'Test',
        text: 'Content',
        score: 50,
        engine: 'trafilatura' as const,
        success: true,
      };

      cache.set(longUrl, data);
      const result = cache.get(longUrl);

      expect(result).not.toBeNull();
      expect(result?.title).toBe('Test');
    });

    it('handles_special_characters_in_url', () => {
      const specialUrl = 'https://example.com/path?query=value&special=äöü#fragment';
      const data = {
        title: 'Test',
        text: 'Content',
        score: 50,
        engine: 'trafilatura' as const,
        success: true,
      };

      cache.set(specialUrl, data);
      const result = cache.get(specialUrl);

      expect(result).not.toBeNull();
      expect(result?.title).toBe('Test');
    });
  });
});
