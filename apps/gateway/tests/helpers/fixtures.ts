import { readFileSync } from 'node:fs';
import { join } from 'node:path';

export const TRUNC_SUFFIX = '... [truncated';
export const MAX_CODE_LINES = 200;
export const DEFAULT_TIMEOUT_MS = 10000;

const FIXTURES_DIR = join(import.meta.dir, '../fixtures');
const JSON_DIR = join(FIXTURES_DIR, 'json');

// JSON fixture loader
export function loadJsonFixture<T = unknown>(filename: string): T {
  const path = join(JSON_DIR, filename);
  const content = readFileSync(path, 'utf-8');
  return JSON.parse(content) as T;
}

// Common test HTML snippets
export const HTML_FIXTURES = {
  simple: `<!DOCTYPE html>
<html>
<head><title>Test Article</title></head>
<body>
  <h1>Simple Article</h1>
  <p>This is a simple test article.</p>
</body>
</html>`,

  withCodeBlock: `<!DOCTYPE html>
<html>
<head><title>Code Article</title></head>
<body>
  <h1>Article with Code</h1>
  <pre><code>${'line\n'.repeat(250)}</code></pre>
</body>
</html>`,

  spaMarkers: `<!DOCTYPE html>
<html>
<head><title>SPA Page</title></head>
<body>
  <div id="__next" data-reactroot="">
    <script>window.__NEXT_DATA__ = {}</script>
  </div>
</body>
</html>`,

  ampPage: `<!DOCTYPE html>
<html amp>
<head><title>AMP Article</title></head>
<body>
  <h1>AMP Content</h1>
  <amp-img src="test.jpg"></amp-img>
</body>
</html>`,

  heavyNoscript: `<!DOCTYPE html>
<html>
<head><title>Noscript Heavy</title></head>
<body>
  <noscript>${'<p>Content line</p>\n'.repeat(100)}</noscript>
  <script>console.log('minimal')</script>
</body>
</html>`,
};

// Common JSON response fixtures
export const JSON_FIXTURES = {
  extractorSuccess: {
    title: 'Test Article',
    text: 'Extracted content here',
    score: 85.5,
    engine: 'trafilatura',
    success: true,
  },

  extractorLowScore: {
    title: '',
    text: 'Short text',
    score: 15.0,
    engine: 'trafilatura',
    success: true,
  },

  rendererSuccess: {
    html: HTML_FIXTURES.simple,
    renderTime: 1234,
    success: true,
  },

  readabilitySuccess: {
    title: 'Readable Title',
    text: 'Readable content extracted',
    success: true,
  },
};
