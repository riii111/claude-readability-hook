import { ResultAsync, okAsync } from 'neverthrow';
import { fetch } from 'undici';
import { ExtractorClient } from '../../clients/extractor.js';
import { ReadabilityExtractor } from '../../clients/readability.js';
import { type CacheKey, createCacheKey } from '../../core/branded-types.js';
import { type ErrorCode, type GatewayError, createError } from '../../core/errors.js';
import type { ExtractResponse } from '../../core/types.js';
import { cacheManager } from '../../lib/cache.js';
import { config } from '../../lib/config.js';
import { validateUrl, validateUrlSecurity } from '../../lib/ssrf-guard.js';

const wrapErr =
  <E>(code: ErrorCode) =>
  (error: E): GatewayError =>
    createError(code, String(error));

const extractorClient = new ExtractorClient();
const readabilityExtractor = new ReadabilityExtractor();

export function extractContent(url: string): ResultAsync<ExtractResponse, GatewayError> {
  return validateUrl(url)
    .mapErr(wrapErr('BadRequest'))
    .asyncAndThen((validUrl) => validateUrlSecurity(validUrl).mapErr(wrapErr('Forbidden')))
    .andThen((validatedUrl) => {
      const urlString = validatedUrl.toString();
      const cacheKey = createCacheKey(urlString);
      const cachedResult = cacheManager.get(cacheKey);

      return cachedResult ? okAsync(cachedResult) : processExtraction(urlString, cacheKey);
    });
}

function processExtraction(
  url: string,
  cacheKey: CacheKey
): ResultAsync<ExtractResponse, GatewayError> {
  return ResultAsync.fromPromise(
    fetch(url).then((res) => res.text()),
    (error) => createError('ServiceUnavailable', `Failed to fetch URL: ${error}`)
  ).andThen((html) => {
    return extractorClient
      .extractContent({ html, url })
      .andThen((extractorResult) => {
        if (!extractorResult.success || extractorResult.score < config.scoreThreshold) {
          return readabilityExtractor
            .extract(html, url)
            .mapErr((error) => createError('InternalError', error))
            .map((readabilityResult) => ({
              title: readabilityResult.title,
              text: readabilityResult.text,
              engine: 'readability' as const,
              score: readabilityResult.text.length * 0.8,
              cached: false,
            }));
        }

        return okAsync<ExtractResponse, GatewayError>({
          title: extractorResult.title,
          text: extractorResult.text,
          engine: extractorResult.engine,
          score: extractorResult.score,
          cached: false,
        });
      })
      .andTee((response) => {
        cacheManager.set(cacheKey, response);
      });
  });
}
