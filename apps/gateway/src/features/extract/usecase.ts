import { type Result, err, ok } from 'neverthrow';
import { type GatewayError, createError } from '../../core/errors.js';
import type { ExtractResponse } from '../../core/types.js';
import { cacheManager } from '../../lib/cache.js';
import { checkSSRF, validateUrl } from '../../lib/ssrf-guard.js';

export async function extractContent(url: string): Promise<Result<ExtractResponse, GatewayError>> {
  const urlValidation = validateUrl(url);
  if (urlValidation.isErr()) {
    return err(createError('BadRequest', urlValidation.error));
  }

  const ssrfResult = await checkSSRF(urlValidation.value);
  if (ssrfResult.isErr()) {
    return err(createError('Forbidden', ssrfResult.error));
  }

  const validatedUrl = ssrfResult.value.toString();

  const cachedResult = cacheManager.get(validatedUrl);
  if (cachedResult) {
    return ok(cachedResult);
  }

  // TODO: 実装予定: SSR判定 → 抽出処理(Extractor呼び出し) → スコア判定とフォールバック
  const stubResponse: ExtractResponse = {
    title: 'Placeholder Title',
    text: 'Gateway service is running. URL validation, SSRF protection, and LRU cache are now active. No more try-catch!',
    engine: 'trafilatura',
    score: 0,
    cached: false,
  };

  cacheManager.set(validatedUrl, stubResponse);

  return ok(stubResponse);
}
