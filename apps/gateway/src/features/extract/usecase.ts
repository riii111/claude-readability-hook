import { ResultAsync, errAsync, okAsync } from 'neverthrow';
import { type Response, fetch } from 'undici';
import { ExtractorClient } from '../../clients/extractor.js';
import { ReadabilityExtractor } from '../../clients/readability.js';
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
import {
  EXTRACTION_ENGINES,
  trackExtractionAttempt,
  trackRendererRequest,
  trackSSRDetection,
} from '../../lib/metrics.js';
import { validateUrl, validateUrlSecurity } from '../../lib/ssrf-guard.js';
import { needsSSR } from './ssr-detector.js';

const wrapErr =
  (code: ErrorCode) =>
  (error: unknown): GatewayError =>
    createError(code, error instanceof Error ? error.message : String(error));

const extractorClient = new ExtractorClient();
const readabilityExtractor = new ReadabilityExtractor();

const fetchOk = (url: string): ResultAsync<Response, GatewayError> =>
  ResultAsync.fromPromise(
    fetch(url, { signal: AbortSignal.timeout(config.fetchTimeoutMs) }),
    wrapErr(ErrorCode.ServiceUnavailable)
  ).andThen((res) =>
    res.ok
      ? okAsync<Response, GatewayError>(res)
      : errAsync(wrapErr(ErrorCode.ServiceUnavailable)(`HTTP ${res.status}: ${res.statusText}`))
  );

const validateContentType = (response: Response): ResultAsync<Response, GatewayError> => {
  const contentType = response.headers.get('content-type') || '';
  const isValidContentType =
    contentType.startsWith('text/html') || contentType.startsWith('application/xhtml+xml');

  return isValidContentType
    ? okAsync(response)
    : errAsync(
        createError(ErrorCode.BadRequest, `Invalid content type for extraction: ${contentType}`)
      );
};

const readText = (res: Response): ResultAsync<string, GatewayError> =>
  ResultAsync.fromPromise(res.text(), wrapErr(ErrorCode.ServiceUnavailable));

const toExtractResponse = (result: ExtractorServiceResponse): ExtractResponse => ({
  title: result.title,
  text: result.text,
  engine:
    result.engine === 'trafilatura' ? ExtractionEngine.Trafilatura : ExtractionEngine.Readability,
  score: result.score,
  cached: false,
});

const fallbackWithReadability = (
  html: string,
  url: string,
  renderTime?: number
): ResultAsync<ExtractResponse, GatewayError> => {
  const startTime = Date.now();
  return readabilityExtractor
    .extract(html, url)
    .mapErr((error) => {
      const duration = Date.now() - startTime;
      trackExtractionAttempt(EXTRACTION_ENGINES.READABILITY, false, duration, false);
      return wrapErr(ErrorCode.InternalError)(error);
    })
    .map((readabilityResult) => {
      const duration = Date.now() - startTime;
      trackExtractionAttempt(EXTRACTION_ENGINES.READABILITY, true, duration, false);
      return {
        title: readabilityResult.title,
        text: readabilityResult.text,
        engine: ExtractionEngine.Readability,
        // Simple heuristic: longer content indicates better extraction quality
        score: readabilityResult.text.length * config.readabilityScoreFactor,
        cached: false,
        ...(renderTime !== undefined && { renderTime }),
      };
    });
};

export function extractContent(url: string): ResultAsync<ExtractResponse, GatewayError> {
  const validationResult = validateUrl(url).mapErr(wrapErr(ErrorCode.BadRequest));

  if (validationResult.isErr()) {
    return errAsync(validationResult.error);
  }

  const validUrl = validationResult.value;

  return validateUrlSecurity(validUrl)
    .mapErr(wrapErr(ErrorCode.Forbidden))
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
  return (
    fetchOk(url)
      .andThen(validateContentType)
      .andThen(readText)
      .andThen((html) => {
        const shouldUseSSR = needsSSR(html);
        trackSSRDetection(shouldUseSSR);

        if (shouldUseSSR) {
          return renderAndExtract(url);
        }

        const startTime = Date.now();
        return extractorClient.extractContent({ html, url }).andThen((extractorResult) => {
          const duration = Date.now() - startTime;
          trackExtractionAttempt(EXTRACTION_ENGINES.TRAFILATURA, extractorResult.success, duration, false);

          const isGoodExtraction =
            extractorResult.success && extractorResult.score >= config.scoreThreshold;

          return isGoodExtraction
            ? okAsync(toExtractResponse(extractorResult))
            : fallbackWithReadability(html, url);
        });
      })
      // Side effect: Cache successful extraction results to avoid duplicate processing
      .andTee((response) => {
        cacheManager.set(cacheKey, response);
      })
  );
}

function renderAndExtract(url: string): ResultAsync<ExtractResponse, GatewayError> {
  const renderStartTime = Date.now();
  return playwrightRenderer
    .render(url)
    .mapErr((error) => {
      const renderDuration = Date.now() - renderStartTime;
      trackRendererRequest(false, renderDuration);
      return error;
    })
    .andThen((renderResult: RenderResult) => {
      const renderDuration = Date.now() - renderStartTime;
      trackRendererRequest(true, renderDuration);

      const extractStartTime = Date.now();
      return extractorClient
        .extractContent({ html: renderResult.html, url })
        .andThen((extractorResult: ExtractorServiceResponse) => {
          const extractDuration = Date.now() - extractStartTime;
          trackExtractionAttempt(EXTRACTION_ENGINES.TRAFILATURA, extractorResult.success, extractDuration, true);
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
          return fallbackWithReadability(renderResult.html, url, renderResult.renderTime);
        });
    });
}
