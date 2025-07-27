import { ResultAsync, errAsync, okAsync } from 'neverthrow';
import { type Response, fetch } from 'undici';
import { ExtractorClient } from '../../clients/extractor.js';
import { ReadabilityExtractor } from '../../clients/readability.js';
import { type CacheKey, createCacheKey } from '../../core/branded-types.js';
import { type ErrorCode, type GatewayError, createError } from '../../core/errors.js';
import type { ExtractResponse } from '../../core/types.js';
import { cacheManager } from '../../lib/cache.js';
import { config } from '../../lib/config.js';
import { validateUrl, validateUrlSecurity } from '../../lib/ssrf-guard.js';

const wrapErr =
  (code: ErrorCode) =>
  (error: unknown): GatewayError =>
    createError(code, error instanceof Error ? error.message : String(error));

const extractorClient = new ExtractorClient();
const readabilityExtractor = new ReadabilityExtractor();

const fetchOk = (url: string): ResultAsync<Response, GatewayError> =>
  ResultAsync.fromPromise(fetch(url), wrapErr('ServiceUnavailable')).andThen((res) =>
    res.ok
      ? okAsync<Response, GatewayError>(res)
      : errAsync(createError('ServiceUnavailable', `HTTP ${res.status}: ${res.statusText}`))
  );

const readText = (res: Response): ResultAsync<string, GatewayError> =>
  ResultAsync.fromPromise(res.text(), wrapErr('ServiceUnavailable'));

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
  return fetchOk(url)
    .andThen(readText)
    .andThen((html) =>
      extractorClient
        .extractContent({ html, url })
        .andThen((extractorResult) => {
          const isGoodExtraction =
            extractorResult.success && extractorResult.score >= config.scoreThreshold;

          if (isGoodExtraction) {
            return okAsync<ExtractResponse, GatewayError>({
              title: extractorResult.title,
              text: extractorResult.text,
              engine: extractorResult.engine,
              score: extractorResult.score,
              cached: false,
            });
          }

          return readabilityExtractor
            .extract(html, url)
            .mapErr((error) => createError('InternalError', error))
            .map((readabilityResult) => ({
              title: readabilityResult.title,
              text: readabilityResult.text,
              engine: 'readability' as const,
              score: readabilityResult.text.length * config.readabilityScoreFactor,
              cached: false,
            }));
        })
        .andTee((response) => {
          cacheManager.set(cacheKey, response);
        })
    );
}
