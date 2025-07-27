import { config } from '../../lib/config.js';

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

export function needsSSR(html: string): boolean {
  const signals = extractSSRSignals(html);
  const score = calculateSSRScore(signals, config.ssrWeights);
  return score >= config.ssrThreshold;
}

function extractSSRSignals(html: string): SSRSignals {
  const htmlSize = html.length;
  const scriptMatches = html.match(/<script[^>]*>/gi) || [];
  const scriptRatio = scriptMatches.length / Math.max(htmlSize / config.ssrScriptDivisor, 1);

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

  return textContent.length > config.ssrNoscriptMinLength;
}
