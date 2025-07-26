import { type ResultAsync, okAsync } from 'neverthrow';
import { type CacheKey, createCacheKey } from '../../core/branded-types.js';
import type { GatewayError } from '../../core/errors.js';
import type { ExtractResponse } from '../../core/types.js';
import { cacheManager } from '../../lib/cache.js';
import { validateUrl, validateUrlSecurity } from '../../lib/ssrf-guard.js';
import { wrapErr } from '../../utils/result.js';

export function extractContent(url: string): ResultAsync<ExtractResponse, GatewayError> {
  return validateUrl(url)
    .mapErr(wrapErr('BadRequest'))
    .asyncAndThen((validUrl) => validateUrlSecurity(validUrl).mapErr(wrapErr('Forbidden')))
    .andThen((validatedUrl) => {
      const urlString = validatedUrl.toString();
      const cacheKey = createCacheKey(urlString);
      const cachedResult = cacheManager.get(cacheKey);

      return cachedResult ? okAsync(cachedResult) : processExtraction(cacheKey);
    });
}

function processExtraction(cacheKey: CacheKey): ResultAsync<ExtractResponse, GatewayError> {
  // TODO: Implement SSR detection → extraction (call Extractor) → score evaluation and fallback
  // TODO: Use config.scoreThreshold for evaluating extraction quality and deciding fallback strategy
  // TODO: Consider ResultAsync.combine for parallel operations (e.g., metadata + content extraction)
  const stubResponse: ExtractResponse = {
    title: 'Placeholder Title',
    text: 'Gateway service is running. URL validation, SSRF protection, and LRU cache are now active. Functional style with neverthrow!',
    engine: 'trafilatura',
    score: 0,
    cached: false,
  };

  return okAsync(stubResponse).andTee((response) => {
    cacheManager.set(cacheKey, response);
  });
}
