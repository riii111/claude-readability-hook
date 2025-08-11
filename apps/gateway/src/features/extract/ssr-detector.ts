import { config } from '../../lib/config.js';

export function needsSSR(html: string): boolean {
  // Lightweight short-circuit: if HTML is small with clear article content, skip SSR
  if (html.length < 60000 && hasArticleContent(html)) {
    return false;
  }

  const signals = extractSSRSignals(html);
  const score = calculateSSRScore(signals, config.ssrWeights);
  return score >= config.ssrThreshold;
}

function extractSSRSignals(html: string): SSRSignals {
  const htmlSize = html.length;

  // Filter out JSON-LD and other data scripts from SSR detection
  const scriptMatches = html.match(/<script[^>]*>/gi) || [];
  const executableScripts = scriptMatches.filter((script) => {
    // Exclude JSON-LD and other data-only scripts
    return (
      !script.includes('type="application/ld+json"') &&
      !script.includes('type="application/json"') &&
      !script.includes('type="text/plain"')
    );
  });

  // Script density: executable scripts per X bytes
  const scriptRatio = executableScripts.length / Math.max(htmlSize / config.ssrScriptDivisor, 1);

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

  if (signals.htmlSize < config.ssrHtmlSizeThreshold) {
    score += weights.smallSize;
  }

  if (signals.scriptRatio > config.ssrScriptRatioThreshold) {
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
    // Next.js root element
    /id=["']__next["']/,
    // Angular root element
    /<app-root[\s>]/,
    // Vue.js inspector attribute
    /data-v-inspector=/,
  ];

  return frameworkPatterns.some((pattern) => pattern.test(html));
}

function detectSPAStructure(html: string): boolean {
  return SPA_ROOT_PATTERNS.some((pattern) => pattern.test(html));
}

function detectNoscriptContent(html: string): boolean {
  const noscriptMatch = html.match(/<noscript[^>]*>([\s\S]*?)<\/noscript>/gi);
  if (!noscriptMatch) return false;

  const noscriptContent = noscriptMatch.join(' ');
  const textContent = noscriptContent.replace(/<[^>]*>/g, '').trim();

  return textContent.length > config.ssrNoscriptMinLength;
}

function hasArticleContent(html: string): boolean {
  const articlePatterns = [
    /<article[^>]*>/i,
    /<main[^>]*>/i,
    /<div[^>]*class=["'][^"']*content[^"']*["']/i,
    /<div[^>]*class=["'][^"']*article[^"']*["']/i,
    /<div[^>]*class=["'][^"']*post[^"']*["']/i,
  ];

  return articlePatterns.some((pattern) => pattern.test(html));
}

const SPA_ROOT_PATTERNS = [
  /<div[^>]*id=["']root["']/, // React default
  /<div[^>]*id=["']app["']/, // Vue/Angular common
  /<div[^>]*id=["']main["']/, // Generic SPA
  /<div[^>]*id=["']__next["']/, // Next.js root
  /<div[^>]*class=["'][^"']*spa[^"']*["']/, // Explicit SPA class
  /<div[^>]*class=["'][^"']*app-root[^"']*["']/, // Angular convention
] as const;

interface SSRSignals {
  htmlSize: number;
  scriptRatio: number;
  hasFrameworkMarkers: boolean;
  hasSPAStructure: boolean;
  hasNoscriptContent: boolean;
}

export interface SSRScoreWeights {
  smallSize: number;
  highScriptRatio: number;
  frameworkMarkers: number;
  spaStructure: number;
  noscriptContent: number;
}
