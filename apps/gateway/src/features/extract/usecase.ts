import { ResultAsync, okAsync } from 'neverthrow';
import { extractorClient } from '../../clients/extractor.js';
import { readabilityExtractor } from '../../clients/readability.js';
import { type RenderResult, playwrightRenderer } from '../../clients/renderer.js';
import { type CacheKey, createCacheKey } from '../../core/branded-types.js';
import { type ErrorCode, type GatewayError, createError } from '../../core/errors.js';
import type { ExtractResponse, ExtractorServiceResponse } from '../../core/types.js';
import { cacheManager } from '../../lib/cache.js';
import { config } from '../../lib/config.js';
import { validateUrl, validateUrlSecurity } from '../../lib/ssrf-guard.js';
import { needsSSR } from './ssr-detector.js';

const wrapErr =
  <E>(code: ErrorCode) =>
  (error: E): GatewayError =>
    createError(code, String(error));

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
  const url = cacheKey; // CacheKey is branded string of URL

  return fetchHtml(url)
    .andThen((html: string) => {
      const shouldUseSSR = needsSSR(html);

      if (shouldUseSSR) {
        return renderAndExtract(url);
      }
      return extractAndFallback(html, url);
    })
    .andTee((response: ExtractResponse) => {
      cacheManager.set(cacheKey, response);
    });
}

function fetchHtml(url: string): ResultAsync<string, GatewayError> {
  return ResultAsync.fromPromise(
    fetch(url, {
      signal: AbortSignal.timeout(config.fetchTimeoutMs),
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; claude-readability-hook/1.0)',
      },
    }).then(async (response) => {
      if (!response.ok) {
        throw new Error(`Failed to fetch: ${response.status} ${response.statusText}`);
      }
      return await response.text();
    }),
    (error) => createError('ServiceUnavailable', `Failed to fetch URL: ${String(error)}`)
  );
}

function renderAndExtract(url: string): ResultAsync<ExtractResponse, GatewayError> {
  return playwrightRenderer.render(url).andThen((renderResult: RenderResult) =>
    extractorClient
      .extractContent(renderResult.html, url)
      .andThen((extractorResult: ExtractorServiceResponse) => {
        if (extractorResult.success && extractorResult.score >= config.scoreThreshold) {
          return okAsync({
            title: extractorResult.title,
            text: extractorResult.text,
            engine: 'trafilatura+ssr' as const,
            score: extractorResult.score,
            cached: false,
            renderTime: renderResult.renderTime,
          } satisfies ExtractResponse);
        }
        // Fallback to readability with rendered HTML
        return fallbackToReadability(renderResult.html, renderResult.renderTime);
      })
  );
}

function extractAndFallback(html: string, url: string): ResultAsync<ExtractResponse, GatewayError> {
  return extractorClient
    .extractContent(html, url)
    .andThen((extractorResult: ExtractorServiceResponse) => {
      if (extractorResult.success && extractorResult.score >= config.scoreThreshold) {
        return okAsync({
          title: extractorResult.title,
          text: extractorResult.text,
          engine: extractorResult.engine === 'trafilatura' ? 'trafilatura' : 'readability',
          score: extractorResult.score,
          cached: false,
        } satisfies ExtractResponse);
      }
      // Fallback to readability with original HTML
      return fallbackToReadability(html);
    });
}

function fallbackToReadability(
  html: string,
  renderTime?: number
): ResultAsync<ExtractResponse, GatewayError> {
  return readabilityExtractor.extract(html).map(
    (readabilityResult) =>
      ({
        title: readabilityResult.title,
        text: readabilityResult.text,
        engine: 'readability' as const,
        score: readabilityResult.text.length * 0.8 + readabilityResult.text.split(' ').length * 0.2,
        cached: false,
        ...(renderTime !== undefined && { renderTime }),
      }) satisfies ExtractResponse
  );
}
