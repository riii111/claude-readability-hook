export class RateLimiter {
  private readonly timestamps = new Map<string, readonly number[]>();
  private readonly lastRequestTime = new Map<string, number>();

  canProceed(key: string, maxRequests: number, windowMs: number): boolean {
    const now = Date.now();
    const existingTimestamps = this.timestamps.get(key) ?? [];

    const validTimestamps = existingTimestamps.filter((t) => now - t < windowMs);

    if (validTimestamps.length >= maxRequests) {
      this.timestamps.set(key, validTimestamps);
      return false;
    }

    const newTimestamps = [...validTimestamps, now];
    this.timestamps.set(key, newTimestamps);
    this.lastRequestTime.set(key, now);

    return true;
  }

  getWaitTime(key: string, minIntervalMs: number): number {
    const lastRequest = this.lastRequestTime.get(key) ?? 0;
    const now = Date.now();
    const timeSinceLastRequest = now - lastRequest;

    if (timeSinceLastRequest >= minIntervalMs) {
      return 0;
    }

    return minIntervalMs - timeSinceLastRequest;
  }

  recordRequest(key: string): void {
    const now = Date.now();
    this.lastRequestTime.set(key, now);
  }

  clear(): void {
    this.timestamps.clear();
    this.lastRequestTime.clear();
  }
}

export const rateLimiter = new RateLimiter();
