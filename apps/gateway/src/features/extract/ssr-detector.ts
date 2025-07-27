/**
 * Detects if a page requires Server-Side Rendering based on heuristics
 * Uses HTML size and script ratio to determine if content is likely JavaScript-heavy
 */
export function needsSSR(html: string): boolean {
  const htmlSize = html.length;
  
  // Count script tags to estimate JavaScript dependency
  const scriptMatches = html.match(/<script[^>]*>/gi) || [];
  const scriptRatio = scriptMatches.length / (htmlSize / 1000);
  
  // Small HTML or high script ratio indicates JS-heavy site
  return htmlSize < 5000 || scriptRatio > 0.1;
}