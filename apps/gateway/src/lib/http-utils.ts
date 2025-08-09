import type { HeadersInit } from 'undici';

export const createTimeoutSignal = (ms: number): { signal: AbortSignal } => ({
  signal: AbortSignal.timeout(ms),
});

export const createUserAgent = (handler: string): HeadersInit => ({
  'User-Agent': `claude-readability-hook/${handler}-handler`,
});

export const delay = (ms: number): Promise<void> =>
  new Promise((resolve) => setTimeout(resolve, ms));

export const TIME_CONSTANTS = {
  RATE_LIMIT_WINDOW_MS: 60_000,
  DEFAULT_TIMEOUT_MS: 30_000,
} as const;
