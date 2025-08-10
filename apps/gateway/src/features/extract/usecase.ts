import { Result, ResultAsync, errAsync, okAsync } from 'neverthrow';
import { type Response, fetch } from 'undici';
import { ExtractorClient } from '../../clients/extractor.js';
import { readabilityExtractor } from '../../clients/readability.js';
import { type RenderResult, rendererClient } from '../../clients/renderer.js';
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
  trackCacheSetFailure,
  trackExtractionAttempt,
  trackRendererRequest,
  trackSSRDetection,
} from '../../lib/metrics.js';
import { mapUnknownErrorToGatewayError } from '../../lib/result.js';
import { validateUrl, validateUrlSecurity } from '../../lib/ssrf-guard.js';
import { handleReddit } from './handlers/reddit/usecase.js';
import { handleStackOverflow } from './handlers/stackoverflow/usecase.js';
import { needsSSR } from './ssr-detector.js';

export function extractContent(url: string): ResultAsync<ExtractResponse, GatewayError> {
  const validationResult = validateUrl(url).mapErr(
    mapUnknownErrorToGatewayError(ErrorCode.BadRequest)
  );

  if (validationResult.isErr()) {
    return errAsync(validationResult.error);
  }

  const validUrl = validationResult.value;
  const transformedUrl = transformUrl(validUrl);
  const transformedUrlString = transformedUrl.toString();

  const cacheKey = createCacheKey(transformedUrlString);
  const cachedResult = cacheManager.get(cacheKey);

  if (cachedResult) {
    return okAsync(cachedResult);
  }

  // Try domain-specific handlers first
  const hostname = transformedUrl.hostname;
  if (/(^|\.)stackoverflow\.com$/i.test(hostname)) {
    return handleStackOverflow(transformedUrl).orElse(() =>
      validateUrlSecurity(transformedUrl)
        .mapErr(mapUnknownErrorToGatewayError(ErrorCode.Forbidden))
        .andThen(() => processExtraction(transformedUrlString, cacheKey))
    );
  }

  if (/(^|\.)reddit\.com$/i.test(hostname) || /(^|\.)redd\.it$/i.test(hostname)) {
    return handleReddit(transformedUrl).orElse(() =>
      validateUrlSecurity(transformedUrl)
        .mapErr(mapUnknownErrorToGatewayError(ErrorCode.Forbidden))
        .andThen(() => processExtraction(transformedUrlString, cacheKey))
    );
  }

  // Default pipeline
  return validateUrlSecurity(transformedUrl)
    .mapErr(mapUnknownErrorToGatewayError(ErrorCode.Forbidden))
    .andThen(() => processExtraction(transformedUrlString, cacheKey));
}

function processExtraction(
  url: string,
  cacheKey: CacheKey
): ResultAsync<ExtractResponse, GatewayError> {
  return fetchAndRead(url)
    .andThen((html) => {
      const shouldUseSSR = needsSSR(html);
      trackSSRDetection(shouldUseSSR);

      return shouldUseSSR ? renderAndExtract(url) : trafilaturaExtract(html, url);
    })
    .andTee((response) => {
      const cacheResult = Result.fromThrowable(
        () => cacheManager.set(cacheKey, response),
        () => 'Cache set failed'
      )();

      if (cacheResult.isErr()) {
        trackCacheSetFailure(cacheKey);
      }
    });
}

function renderAndExtract(url: string): ResultAsync<ExtractResponse, GatewayError> {
  const renderStartTime = Date.now();
  return rendererClient
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
          trackExtractionAttempt(
            EXTRACTION_ENGINES.TRAFILATURA,
            extractorResult.success,
            extractDuration,
            true
          );
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

const trafilaturaExtract = (
  html: string,
  url: string
): ResultAsync<ExtractResponse, GatewayError> => {
  const startTime = Date.now();
  return extractorClient.extractContent({ html, url }).andThen((extractorResult) => {
    const duration = Date.now() - startTime;
    trackExtractionAttempt(
      EXTRACTION_ENGINES.TRAFILATURA,
      extractorResult.success,
      duration,
      false
    );

    const isGoodExtraction =
      extractorResult.success && extractorResult.score >= config.scoreThreshold;

    return isGoodExtraction
      ? okAsync(toExtractResponse(extractorResult))
      : fallbackWithReadability(html, url);
  });
};

const fetchOk = (url: string, followCount = 0): ResultAsync<Response, GatewayError> =>
  ResultAsync.fromPromise(
    fetch(url, {
      signal: AbortSignal.timeout(config.fetchTimeoutMs),
      redirect: 'manual',
      headers: {
        Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'User-Agent': 'claude-readability-hook/1.0.0',
      },
    }),
    mapUnknownErrorToGatewayError(ErrorCode.ServiceUnavailable)
  ).andThen((res) => {
    // Handle redirects manually with SSRF validation
    if (res.status >= 300 && res.status < 400) {
      if (followCount >= config.maxRedirectFollows) {
        return errAsync(createError(ErrorCode.ServiceUnavailable, 'Too many redirects'));
      }

      const location = res.headers.get('location');
      if (!location) {
        return errAsync(
          createError(ErrorCode.ServiceUnavailable, 'Redirect without Location header')
        );
      }

      const nextUrl = new URL(location, url);
      return validateUrlSecurity(nextUrl)
        .mapErr(mapUnknownErrorToGatewayError(ErrorCode.Forbidden))
        .andThen(() => fetchOk(nextUrl.toString(), followCount + 1));
    }

    return res.ok
      ? okAsync<Response, GatewayError>(res)
      : errAsync(
          mapUnknownErrorToGatewayError(ErrorCode.ServiceUnavailable)(
            `HTTP ${res.status}: ${res.statusText}`
          )
        );
  });

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

const readTextWithLimit = (res: Response): ResultAsync<string, GatewayError> => {
  const contentLength = Number(res.headers.get('content-length') || 0);
  if (contentLength && contentLength > config.maxHtmlBytes) {
    return errAsync(
      createError(
        ErrorCode.ServiceUnavailable,
        `Content too large: ${contentLength} > ${config.maxHtmlBytes} bytes`
      )
    );
  }

  const reader = res.body?.getReader();
  if (!reader) {
    return ResultAsync.fromPromise(
      res.text(),
      mapUnknownErrorToGatewayError(ErrorCode.ServiceUnavailable)
    );
  }

  return ResultAsync.fromPromise(
    (async () => {
      let received = 0;
      const chunks: Uint8Array[] = [];

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        received += value.byteLength;
        if (received > config.maxHtmlBytes) {
          // Early termination without throwing
          reader.cancel();
          return Promise.reject(
            new Error(`Content exceeded ${config.maxHtmlBytes} bytes during streaming`)
          );
        }
        chunks.push(value);
      }

      const all = new Uint8Array(received);
      let offset = 0;
      for (const chunk of chunks) {
        all.set(chunk, offset);
        offset += chunk.byteLength;
      }

      return new TextDecoder('utf-8').decode(all);
    })(),
    mapUnknownErrorToGatewayError(ErrorCode.ServiceUnavailable)
  );
};

const fetchAndRead = (url: string): ResultAsync<string, GatewayError> => {
  return fetchOk(url).andThen(validateContentType).andThen(readTextWithLimit);
};

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
      return mapUnknownErrorToGatewayError(ErrorCode.InternalError)(error);
    })
    .map((readabilityResult) => {
      const duration = Date.now() - startTime;
      trackExtractionAttempt(EXTRACTION_ENGINES.READABILITY, true, duration, false);
      return {
        title: readabilityResult.title,
        text: readabilityResult.text,
        engine: ExtractionEngine.Readability,
        score: readabilityResult.text.length * config.readabilityScoreFactor,
        cached: false,
        ...(renderTime !== undefined && { renderTime }),
      };
    });
};

export const transformUrl = (url: URL): URL => {
  return [transformAmp, transformMobile, transformPrint].reduce(
    (currentUrl, transform) => transform(currentUrl),
    url
  );
};

export const transformAmp = (urlObj: URL): URL => {
  const url = cloneUrl(urlObj);
  if (url.pathname.includes('/amp/') || url.pathname.endsWith('/amp')) {
    url.pathname = url.pathname.replace(/\/amp\/?$/, '') || '/';
    if (url.pathname !== '/' && url.pathname.endsWith('/')) {
      url.pathname = url.pathname.slice(0, -1);
    }
  }
  return url;
};

export const transformMobile = (urlObj: URL): URL => {
  const url = cloneUrl(urlObj);
  if (url.hostname.startsWith('mobile.') || url.hostname.startsWith('m.')) {
    url.hostname = url.hostname.replace(/^(mobile\.|m\.)/, 'www.');
  }
  return url;
};

export const transformPrint = (urlObj: URL): URL => {
  const url = cloneUrl(urlObj);
  url.searchParams.delete('print');
  url.searchParams.delete('plain');
  return url;
};

const toExtractResponse = (result: ExtractorServiceResponse): ExtractResponse => ({
  title: result.title,
  text: result.text,
  engine:
    result.engine === 'trafilatura' ? ExtractionEngine.Trafilatura : ExtractionEngine.Readability,
  score: result.score,
  cached: false,
});

const cloneUrl = (url: URL): URL => new URL(url.toString());

const extractorClient = new ExtractorClient();
