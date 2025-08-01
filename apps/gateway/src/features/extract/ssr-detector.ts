const MIN_HTML_SIZE = 5000;
const SCRIPT_RATIO_THRESHOLD = 0.1;

export interface SSRDetectionResult {
  needsSSR: boolean;
  htmlSize: number;
  scriptRatio: number;
}

export function detectSSRRequirement(html: string): SSRDetectionResult {
  const htmlSize = html.length;
  const scriptMatches = html.match(/<script[^>]*>/gi) || [];
  const scriptCount = scriptMatches.length;
  const scriptRatio = htmlSize > 0 ? scriptCount / (htmlSize / 1000) : 0;
  const needsSSR = htmlSize < MIN_HTML_SIZE || scriptRatio > SCRIPT_RATIO_THRESHOLD;

  return {
    needsSSR,
    htmlSize,
    scriptRatio,
  };
}
