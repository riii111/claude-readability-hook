import { type Result, err, ok } from 'neverthrow';
import { type GatewayError, createError } from '../../core/errors.js';
import type { ExtractResponse } from '../../core/types.js';
import { cacheManager } from '../../lib/cache.js';
import { checkSSRF, validateUrl } from '../../lib/ssrf-guard.js';

export async function extractContent(url: string): Promise<Result<ExtractResponse, GatewayError>> {
  // 1. URL検証
  const urlValidation = validateUrl(url);
  if (urlValidation.isErr()) {
    return err(createError('BadRequest', urlValidation.error));
  }

  // 2. SSRF防止チェック
  const ssrfCheck = await checkSSRF(urlValidation.value);
  if (ssrfCheck.isErr()) {
    return err(createError('Forbidden', ssrfCheck.error));
  }

  const validatedUrl = ssrfCheck.value.toString();

  // 3. キャッシュチェック
  const cachedResult = cacheManager.get(validatedUrl);
  if (cachedResult) {
    return ok(cachedResult);
  }

  try {
    // TODO: 実際の実装は次のタスクで行う
    // 4. SSR判定
    // 5. 抽出処理（Extractor呼び出し）
    // 6. スコア判定とフォールバック

    // 現時点ではスタブレスポンスを返す
    const stubResponse: ExtractResponse = {
      title: 'Placeholder Title',
      text: 'Gateway service is running. URL validation, SSRF protection, and LRU cache are now active.',
      engine: 'trafilatura',
      score: 0,
      cached: false,
    };

    // 7. キャッシュ更新
    cacheManager.set(validatedUrl, stubResponse);

    return ok(stubResponse);
  } catch (error) {
    return err(
      createError('InternalError', 'Failed to extract content', {
        error: error instanceof Error ? error.message : String(error),
      })
    );
  }
}
