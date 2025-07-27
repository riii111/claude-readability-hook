interface SSRSignals {
  htmlSize: number;
  scriptRatio: number;
  hasFrameworkMarkers: boolean;
  hasSPAStructure: boolean;
  hasNoscriptContent: boolean;
}

interface SSRScoreWeights {
  smallSize: number;
  highScriptRatio: number;
  frameworkMarkers: number;
  spaStructure: number;
  noscriptContent: number;
}

const DEFAULT_WEIGHTS: SSRScoreWeights = {
  smallSize: 3.0,
  highScriptRatio: 2.0,
  frameworkMarkers: 4.0,
  spaStructure: 2.5,
  noscriptContent: -1.5,
};

const SSR_THRESHOLD = 4.0;

export function needsSSR(html: string, threshold: number = SSR_THRESHOLD): boolean {
  const signals = extractSSRSignals(html);
  const score = calculateSSRScore(signals, DEFAULT_WEIGHTS);
  return score >= threshold;
}

function extractSSRSignals(html: string): SSRSignals {
  const htmlSize = html.length;
  const scriptMatches = html.match(/<script[^>]*>/gi) || [];
  const scriptRatio = scriptMatches.length / Math.max(htmlSize / 1000, 1);

  return {
    htmlSize,
    scriptRatio,
    hasFrameworkMarkers: detectFrameworkMarkers(html),
    hasSPAStructure: detectSPAStructure(html),
    hasNoscriptContent: detectNoscriptContent(html),
  };
}

function calculateSSRScore(signals: SSRSignals, weights: SSRScoreWeights): number {
  let score = 0;

  if (signals.htmlSize < 5000) {
    score += weights.smallSize;
  }

  if (signals.scriptRatio > 0.1) {
    score += weights.highScriptRatio;
  }

  if (signals.hasFrameworkMarkers) {
    score += weights.frameworkMarkers;
  }

  if (signals.hasSPAStructure) {
    score += weights.spaStructure;
  }

  if (signals.hasNoscriptContent) {
    score += weights.noscriptContent;
  }

  return score;
}

function detectFrameworkMarkers(html: string): boolean {
  const frameworkPatterns = [
    /__NEXT_DATA__/,
    /__NUXT_DATA__/,
    /data-reactroot/,
    /data-react-helmet/,
    /ng-version=/,
    /__VUE__/,
    /webpackJsonp/,
    /_app-/,
    /hydrate/i,
  ];

  return frameworkPatterns.some((pattern) => pattern.test(html));
}

function detectSPAStructure(html: string): boolean {
  const spaPatterns = [
    /<div[^>]*id=["']root["']/,
    /<div[^>]*id=["']app["']/,
    /<div[^>]*id=["']main["']/,
    /<div[^>]*class=["'][^"']*spa[^"']*["']/,
    /<div[^>]*class=["'][^"']*app-root[^"']*["']/,
  ];

  return spaPatterns.some((pattern) => pattern.test(html));
}

function detectNoscriptContent(html: string): boolean {
  const noscriptMatch = html.match(/<noscript[^>]*>([\s\S]*?)<\/noscript>/gi);
  if (!noscriptMatch) return false;

  const noscriptContent = noscriptMatch.join(' ');
  const textContent = noscriptContent.replace(/<[^>]*>/g, '').trim();

  return textContent.length > 50;
}
