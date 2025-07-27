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
import { validateUrl, validateUrlSecurity } from '../../lib/ssrf-guard.js';
import { needsSSR } from './ssr-detector.js';

const wrapErr =
  (code: ErrorCode) =>
  (error: unknown): GatewayError =>
    createError(code, error instanceof Error ? error.message : String(error));

const extractorClient = new ExtractorClient();
const readabilityExtractor = new ReadabilityExtractor();

const fetchOk = (url: string): ResultAsync<Response, GatewayError> =>
  ResultAsync.fromPromise(fetch(url), wrapErr(ErrorCode.ServiceUnavailable)).andThen((res) =>
    res.ok
      ? okAsync<Response, GatewayError>(res)
      : errAsync(wrapErr(ErrorCode.ServiceUnavailable)(`HTTP ${res.status}: ${res.statusText}`))
  );

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
): ResultAsync<ExtractResponse, GatewayError> =>
  readabilityExtractor
    .extract(html, url)
    .mapErr(wrapErr(ErrorCode.InternalError))
    .map((readabilityResult) => ({
      title: readabilityResult.title,
      text: readabilityResult.text,
      engine: ExtractionEngine.Readability,
      score: readabilityResult.text.length * config.readabilityScoreFactor,
      cached: false,
      ...(renderTime !== undefined && { renderTime }),
    }));

export function extractContent(url: string): ResultAsync<ExtractResponse, GatewayError> {
  return validateUrl(url)
    .mapErr(wrapErr(ErrorCode.BadRequest))
    .asyncAndThen((validUrl) => validateUrlSecurity(validUrl).mapErr(wrapErr(ErrorCode.Forbidden)))
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
      .andThen(readText)
      .andThen((html) => {
        const shouldUseSSR = needsSSR(html);

        if (shouldUseSSR) {
          return renderAndExtract(url);
        }

        return extractorClient.extractContent({ html, url }).andThen((extractorResult) => {
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
  return playwrightRenderer.render(url).andThen((renderResult: RenderResult) =>
    extractorClient
      .extractContent({ html: renderResult.html, url })
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
        return fallbackWithReadability(renderResult.html, url, renderResult.renderTime);
      })
  );
}
