import { Result, ok, err } from 'neverthrow';
import type { ExtractResponse } from '../../core/types.js';
import { createError, type GatewayError } from '../../core/errors.js';

export async function extractContent(
  url: string
): Promise<Result<ExtractResponse, GatewayError>> {
  try {
    // TODO: 実際の実装は次のタスクで行う
    // 1. URL検証
    // 2. SSRF防止チェック
    // 3. キャッシュチェック
    // 4. SSR判定
    // 5. 抽出処理（Extractor呼び出し）
    // 6. スコア判定とフォールバック
    // 7. キャッシュ更新

    // 現時点ではスタブレスポンスを返す
    const stubResponse: ExtractResponse = {
      title: 'Placeholder Title',
      text: 'Gateway service is running. Extract functionality will be implemented in the next tasks.',
      engine: 'trafilatura',
      score: 0,
      cached: false,
    };

    return ok(stubResponse);
  } catch (error) {
    return err(
      createError(
        'InternalError',
        'Failed to extract content',
        { error: error instanceof Error ? error.message : String(error) }
      )
    );
  }
}