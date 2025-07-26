import { type ResultAsync, okAsync } from 'neverthrow';
import { type GatewayError, createError } from '../../core/errors.js';
import type { ExtractResponse } from '../../core/types.js';
import { cacheManager } from '../../lib/cache.js';
import { validateUrl, validateUrlSecurity } from '../../lib/ssrf-guard.js';

export function extractContent(url: string): ResultAsync<ExtractResponse, GatewayError> {
  return validateUrl(url)
    .mapErr((error) => createError('BadRequest', error))
    .asyncAndThen((validUrl) =>
      validateUrlSecurity(validUrl).mapErr((error) => createError('Forbidden', error))
    )
    .andThen((validatedUrl) => {
      const urlString = validatedUrl.toString();
      const cachedResult = cacheManager.get(urlString);

      return cachedResult ? okAsync(cachedResult) : processExtraction(urlString);
    });
}

function processExtraction(validatedUrl: string): ResultAsync<ExtractResponse, GatewayError> {
  // TODO: Implement SSR detection → extraction (call Extractor) → score evaluation and fallback
  const stubResponse: ExtractResponse = {
    title: 'Placeholder Title',
    text: 'Gateway service is running. URL validation, SSRF protection, and LRU cache are now active. Functional style with neverthrow!',
    engine: 'trafilatura',
    score: 0,
    cached: false,
  };

  return okAsync(stubResponse).andTee((response) => {
    cacheManager.set(validatedUrl, response);
  });
}
