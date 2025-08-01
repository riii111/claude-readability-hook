import { ResultAsync, errAsync, okAsync } from 'neverthrow';
import { type Response, fetch } from 'undici';
import { ExtractorClient } from '../../clients/extractor.js';
import { ReadabilityExtractor } from '../../clients/readability.js';
import { RendererClient } from '../../clients/renderer.js';
import { type CacheKey, createCacheKey } from '../../core/branded-types.js';
import { type ErrorCode, type GatewayError, createError } from '../../core/errors.js';
import type { ExtractResponse, ExtractorServiceResponse } from '../../core/types.js';
import { cacheManager } from '../../lib/cache.js';
import { config } from '../../lib/config.js';
import { validateUrl, validateUrlSecurity } from '../../lib/ssrf-guard.js';
import { transformUrl } from '../../lib/url-transformer.js';
import { detectSSRRequirement } from './ssr-detector.js';

const wrapErr =
  (code: ErrorCode) =>
  (error: unknown): GatewayError =>
    createError(code, error instanceof Error ? error.message : String(error));

const extractorClient = new ExtractorClient();
const readabilityExtractor = new ReadabilityExtractor();
const rendererClient = new RendererClient();

const ENGINE_READABILITY = 'readability' as const;
const ENGINE_TRAFILATURA_SSR = 'trafilatura+ssr' as const;

const fetchOk = (url: string): ResultAsync<Response, GatewayError> =>
  ResultAsync.fromPromise(fetch(url), wrapErr('ServiceUnavailable')).andThen((res) =>
    res.ok
      ? okAsync<Response, GatewayError>(res)
      : errAsync(wrapErr('ServiceUnavailable')(`HTTP ${res.status}: ${res.statusText}`))
  );

const readText = (res: Response): ResultAsync<string, GatewayError> =>
  ResultAsync.fromPromise(res.text(), wrapErr('ServiceUnavailable'));

const toExtractResponse = (result: ExtractorServiceResponse): ExtractResponse => ({
  title: result.title,
  text: result.text,
  engine: result.engine,
  score: result.score,
  cached: false,
});

const fallbackWithReadability = (
  html: string,
  url: string
): ResultAsync<ExtractResponse, GatewayError> =>
  readabilityExtractor
    .extract(html, url)
    .mapErr(wrapErr('InternalError'))
    .map((readabilityResult) => ({
      title: readabilityResult.title,
      text: readabilityResult.text,
      engine: ENGINE_READABILITY,
      score: readabilityResult.text.length * config.readabilityScoreFactor,
      cached: false,
    }));

export function extractContent(url: string): ResultAsync<ExtractResponse, GatewayError> {
  return validateUrl(url)
    .mapErr(wrapErr('BadRequest'))
    .asyncAndThen((validUrl) => validateUrlSecurity(validUrl).mapErr(wrapErr('Forbidden')))
    .andThen((validatedUrl) => {
      const transformResult = transformUrl(validatedUrl.toString());

      return transformResult.isOk()
        ? processWithTransformation(transformResult.value)
        : processExtraction(validatedUrl.toString(), createCacheKey(validatedUrl.toString()));
    });
}

function processWithTransformation(transformResult: {
  originalUrl: string;
  transformedUrl: string;
  wasTransformed: boolean;
  transformations: string[];
}): ResultAsync<ExtractResponse, GatewayError> {
  const finalUrl = transformResult.transformedUrl;
  const cacheKey = createCacheKey(finalUrl);
  const cachedResult = cacheManager.get(cacheKey);

  return cachedResult ? okAsync(cachedResult) : processExtraction(finalUrl, cacheKey);
}

function processExtraction(
  url: string,
  cacheKey: CacheKey
): ResultAsync<ExtractResponse, GatewayError> {
  return fetchOk(url)
    .andThen(readText)
    .andThen((html) => {
      const ssrDetection = detectSSRRequirement(html);

      return ssrDetection.needsSSR ? processWithSSR(url, html) : processWithoutSSR(html, url);
    })
    .andTee((response) => {
      cacheManager.set(cacheKey, response);
    });
}

function processWithSSR(
  url: string,
  originalHtml: string
): ResultAsync<ExtractResponse, GatewayError> {
  return rendererClient.render({ url }).andThen((renderResult) => {
    if (!renderResult.success) {
      return processWithoutSSR(originalHtml, url);
    }

    return extractorClient
      .extractContent({ html: renderResult.html, url })
      .andThen((extractorResult) => {
        const isGoodExtraction =
          extractorResult.success && extractorResult.score >= config.scoreThreshold;

        return isGoodExtraction
          ? okAsync({
              ...toExtractResponse(extractorResult),
              engine: ENGINE_TRAFILATURA_SSR,
            })
          : fallbackWithReadability(renderResult.html, url);
      });
  });
}

function processWithoutSSR(html: string, url: string): ResultAsync<ExtractResponse, GatewayError> {
  return extractorClient.extractContent({ html, url }).andThen((extractorResult) => {
    const isGoodExtraction =
      extractorResult.success && extractorResult.score >= config.scoreThreshold;

    return isGoodExtraction
      ? okAsync(toExtractResponse(extractorResult))
      : fallbackWithReadability(html, url);
  });
}
