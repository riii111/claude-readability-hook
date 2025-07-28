// Resource blocking patterns for Playwright renderer
// TODO: Consider separating into allowlist/denylist structure for better maintainability

export const TRACKING_PATTERNS = [
  /\/analytics\//i,
  /\/gtag\//i,
  /\/ga\./i,
  /google-analytics\.com/i,
  /googletagmanager\.com/i,
  /facebook\.com\/tr/i,
  /\/pixel\//i,
  /\/beacon\//i,
  /\/collect\?/i,
  /\/track\//i,
  /\/event\//i,
  /matomo\./i,
  /piwik\./i,
  /hotjar\.com/i,
  /clarity\.ms/i,
  /segment\.io/i,
  /mixpanel\.com/i,
  /amplitude\.com/i,
] as const;

export const CRITICAL_STYLESHEET_PATTERNS = [/inline/i, /critical/i, /above-fold/i] as const;

export function isTrackingRequest(url: string): boolean {
  return TRACKING_PATTERNS.some((pattern) => pattern.test(url));
}

export function isCriticalStylesheet(url: string): boolean {
  return CRITICAL_STYLESHEET_PATTERNS.some((pattern) => pattern.test(url));
}
