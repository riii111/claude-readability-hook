import { type Result, err, ok } from 'neverthrow';

export interface UrlTransformResult {
  originalUrl: string;
  transformedUrl: string;
  wasTransformed: boolean;
  transformations: string[];
}

const AMP_PATH_PATTERNS = ['/amp', '/amp/', '/amp.html'];
const AMP_SUBDOMAIN_PATTERN = /^amp\./;
const AMP_PARAM_PATTERNS = ['amp=1', 'amp=true'];
const PRINT_PARAMS = ['print=1', 'view=print', 'format=print'];

function removeAmpFromPath(url: URL): { url: URL; transformed: boolean } {
  let transformed = false;
  let pathname = url.pathname;

  for (const pattern of AMP_PATH_PATTERNS) {
    if (pathname.endsWith(pattern)) {
      pathname = pathname.slice(0, -pattern.length) || '/';
      transformed = true;
      break;
    }
  }

  if (transformed) {
    const newUrl = new URL(url);
    newUrl.pathname = pathname;
    return { url: newUrl, transformed: true };
  }

  return { url, transformed: false };
}

function removeAmpFromSubdomain(url: URL): { url: URL; transformed: boolean } {
  if (AMP_SUBDOMAIN_PATTERN.test(url.hostname)) {
    const newUrl = new URL(url);
    newUrl.hostname = url.hostname.replace(AMP_SUBDOMAIN_PATTERN, '');
    return { url: newUrl, transformed: true };
  }

  return { url, transformed: false };
}

function removeAmpFromParams(url: URL): { url: URL; transformed: boolean } {
  const searchParams = new URLSearchParams(url.search);
  let transformed = false;

  for (const param of AMP_PARAM_PATTERNS) {
    const parts = param.split('=');
    const key = parts[0];
    const value = parts[1];
    if (key && value && searchParams.get(key) === value) {
      searchParams.delete(key);
      transformed = true;
    }
  }

  if (transformed) {
    const newUrl = new URL(url);
    newUrl.search = searchParams.toString();
    return { url: newUrl, transformed: true };
  }

  return { url, transformed: false };
}

function addPrintParam(url: URL): { url: URL; transformed: boolean } {
  const searchParams = new URLSearchParams(url.search);

  for (const param of PRINT_PARAMS) {
    const parts = param.split('=');
    const key = parts[0];
    if (key && searchParams.has(key)) {
      return { url, transformed: false };
    }
  }

  searchParams.set('print', '1');
  const newUrl = new URL(url);
  newUrl.search = searchParams.toString();

  return { url: newUrl, transformed: true };
}

function safeCreateUrl(urlString: string): Result<URL, string> {
  const urlResult = (() => {
    const url = new URL(urlString);
    return url;
  })();

  return urlResult ? ok(urlResult) : err(`Invalid URL: ${urlString}`);
}

export function transformUrl(urlString: string): Result<UrlTransformResult, string> {
  return safeCreateUrl(urlString)
    .map((originalUrl) => {
      let currentUrl = new URL(originalUrl);
      const transformations: string[] = [];
      let wasTransformed = false;

      const ampPathResult = removeAmpFromPath(currentUrl);
      if (ampPathResult.transformed) {
        currentUrl = ampPathResult.url;
        transformations.push('amp_path_removed');
        wasTransformed = true;
      }

      const ampSubdomainResult = removeAmpFromSubdomain(currentUrl);
      if (ampSubdomainResult.transformed) {
        currentUrl = ampSubdomainResult.url;
        transformations.push('amp_subdomain_removed');
        wasTransformed = true;
      }

      const ampParamResult = removeAmpFromParams(currentUrl);
      if (ampParamResult.transformed) {
        currentUrl = ampParamResult.url;
        transformations.push('amp_param_removed');
        wasTransformed = true;
      }

      const printParamResult = addPrintParam(currentUrl);
      if (printParamResult.transformed) {
        currentUrl = printParamResult.url;
        transformations.push('print_param_added');
        wasTransformed = true;
      }

      return {
        originalUrl: originalUrl.toString(),
        transformedUrl: currentUrl.toString(),
        wasTransformed,
        transformations,
      };
    })
    .mapErr((error) => `URL transformation failed: ${error}`);
}
