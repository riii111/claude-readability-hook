import { type ResultAsync, errAsync, okAsync } from 'neverthrow';
import { extractorClient } from '../../clients/extractor.js';
import { readabilityExtractor } from '../../clients/readability.js';
import { type RenderResult, playwrightRenderer } from '../../clients/renderer.js';
import { type CacheKey, createCacheKey } from '../../core/branded-types.js';
import { ErrorCode, type GatewayError, createError } from '../../core/errors.js';
import {
  type ExtractResponse,
  ExtractionEngine,
  type ExtractorServiceResponse,
} from '../../core/types.js';
import { cacheManager } from '../../lib/cache.js';
import { config } from '../../lib/config.js';
import { fromPromiseE, wrap } from '../../lib/result.js';
import { validateUrl, validateUrlSecurity } from '../../lib/ssrf-guard.js';
import { needsSSR } from './ssr-detector.js';

export function extractContent(url: string): ResultAsync<ExtractResponse, GatewayError> {
  return validateUrl(url)
    .mapErr(wrap(ErrorCode.BadRequest))
    .asyncAndThen((validUrl) => validateUrlSecurity(validUrl).mapErr(wrap(ErrorCode.Forbidden)))
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
  return fromPromiseE(
    fetch(url, {
      signal: AbortSignal.timeout(config.fetchTimeoutMs),
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; claude-readability-hook/1.0)',
      },
    }),
    ErrorCode.ServiceUnavailable,
    (error) => `Failed to fetch URL: ${String(error)}`
  ).andThen((response) => {
    if (!response.ok) {
      return errAsync(
        createError(
          ErrorCode.ServiceUnavailable,
          `Failed to fetch: ${response.status} ${response.statusText}`
        )
      );
    }

    const contentType = response.headers.get('content-type');
    if (contentType && !contentType.includes('text/html')) {
      return errAsync(createError(ErrorCode.BadRequest, `Content type ${contentType} is not HTML`));
    }

    return fromPromiseE(
      response.text(),
      ErrorCode.ServiceUnavailable,
      (error) => `Failed to read response: ${String(error)}`
    );
  });
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
            engine: ExtractionEngine.TrafilaturaSSR,
            score: extractorResult.score,
            cached: false,
            renderTime: renderResult.renderTime,
          } satisfies ExtractResponse);
        }
        // Fallback to readability with rendered HTML
        return fallbackToReadability(renderResult.html, renderResult.renderTime, url);
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
          engine:
            extractorResult.engine === 'trafilatura'
              ? ExtractionEngine.Trafilatura
              : ExtractionEngine.Readability,
          score: extractorResult.score,
          cached: false,
        } satisfies ExtractResponse);
      }
      // Fallback to readability with original HTML
      return fallbackToReadability(html, undefined, url);
    });
}

// Score constants for consistency across engines
const SCORE_CHAR_WEIGHT = 0.8;
const SCORE_WORD_WEIGHT = 0.2;
const SCORE_TITLE_BONUS = 5.0;
const SCORE_MAX_CHARS = 10000; // Characters for max score
const SCORE_MAX_WORDS = 2000; // Words for max score

function calculateContentScore(text: string, hasTitle = false): number {
  const charCount = text.length;
  const wordCount = text.split(/\s+/).filter((word) => word.length > 0).length;

  // Normalize to 0-100 scale
  const charScore = Math.min(1, charCount / SCORE_MAX_CHARS) * SCORE_CHAR_WEIGHT * 100;
  const wordScore = Math.min(1, wordCount / SCORE_MAX_WORDS) * SCORE_WORD_WEIGHT * 100;
  const titleBonus = hasTitle ? SCORE_TITLE_BONUS : 0;

  return charScore + wordScore + titleBonus;
}

function fallbackToReadability(
  html: string,
  renderTime?: number,
  url?: string
): ResultAsync<ExtractResponse, GatewayError> {
  return readabilityExtractor.extract(html, url).map(
    (readabilityResult) =>
      ({
        title: readabilityResult.title,
        text: readabilityResult.text,
        engine: ExtractionEngine.Readability,
        score: calculateContentScore(readabilityResult.text, Boolean(readabilityResult.title)),
        cached: false,
        ...(renderTime !== undefined && { renderTime }),
      }) satisfies ExtractResponse
  );
}
