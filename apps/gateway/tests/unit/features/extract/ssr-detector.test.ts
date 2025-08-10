import { describe, expect, it } from 'bun:test';
import { needsSSR } from '../../../../src/features/extract/ssr-detector';
import { HTML_FIXTURES } from '../../../helpers/fixtures';

describe('SSR Detector', () => {
  describe('static content detection', () => {
    it('returns_false_for_simple_static_article', () => {
      const html = HTML_FIXTURES.simple;
      const result = needsSSR(html);
      expect(result).toBe(false);
    });

    it('returns_false_for_content_heavy_article', () => {
      const html = `<!DOCTYPE html><html><body>
        <article>
          <h1>Article Title</h1>
          ${Array(50).fill('<p>Content paragraph.</p>').join('\n')}
        </article>
        <script>console.log('minimal');</script>
      </body></html>`;
      const result = needsSSR(html);
      expect(result).toBe(false);
    });

    it('returns_false_for_empty_html', () => {
      const result = needsSSR('');
      expect(result).toBe(false);
    });

    it('returns_false_for_plain_text', () => {
      const result = needsSSR('Just plain text without HTML');
      expect(result).toBe(false);
    });
  });

  describe('spa_markers_detection', () => {
    const spaMarkerCases = [
      {
        name: 'next_data_marker',
        html: '<script>window.__NEXT_DATA__ = {}</script>',
        expectSSR: true,
      },
      { name: 'react_root_marker', html: '<div data-reactroot="">content</div>', expectSSR: true },
      { name: 'next_id_marker', html: '<div id="__next">content</div>', expectSSR: true },
      { name: 'app_root_marker', html: '<app-root>content</app-root>', expectSSR: true },
      {
        name: 'vue_inspector_marker',
        html: '<div data-v-inspector="">content</div>',
        expectSSR: true,
      },
    ];

    for (const { name, html, expectSSR } of spaMarkerCases) {
      it(`detects_${name}`, () => {
        const result = needsSSR(html);
        expect(result).toBe(expectSSR);
      });
    }

    it('detects_spa_markers_fixture', () => {
      const html = HTML_FIXTURES.spaMarkers;
      const result = needsSSR(html);
      expect(result).toBe(true);
    });

    it('ignores_false_positives', () => {
      const falsePositiveCases = [
        '<div class="my-next-step">content</div>',
        '<p>This app is great</p>',
        '<span>react to this</span>',
        '<div>angular momentum</div>',
      ];

      for (const html of falsePositiveCases) {
        const result = needsSSR(html);
        expect(result).toBe(false);
      }
    });
  });

  describe('noscript_content_analysis', () => {
    it('returns_true_for_heavy_noscript', () => {
      const html = HTML_FIXTURES.heavyNoscript;
      const result = needsSSR(html);
      expect(result).toBe(true);
    });

    const noscriptBoundaryCases = [
      { name: 'minimal_noscript', lines: 2, expectSSR: false },
      { name: 'medium_noscript', lines: 10, expectSSR: true },
      { name: 'heavy_noscript', lines: 30, expectSSR: true },
    ];

    for (const { name, lines, expectSSR } of noscriptBoundaryCases) {
      it(`${expectSSR ? 'triggers' : 'ignores'}_ssr_for_${name}`, () => {
        const noscriptContent = Array(lines).fill('<p>Content line</p>').join('\n');
        const html = `<html><body><noscript>${noscriptContent}</noscript></body></html>`;
        const result = needsSSR(html);
        expect(result).toBe(expectSSR);
      });
    }
  });

  describe('script_ratio_analysis', () => {
    it('returns_false_for_low_script_ratio', () => {
      const scriptContent = Array(5).fill('console.log("line");').join('\n');
      const htmlContent = Array(500).fill('<p>Content paragraph with more text</p>').join('\n');
      const html = `<html><body><article>${htmlContent}</article><script>${scriptContent}</script></body></html>`;

      const result = needsSSR(html);
      expect(result).toBe(false);
    });

    it('returns_true_for_high_script_ratio', () => {
      const scriptContent = Array(50).fill('console.log("line");').join('\n');
      const htmlContent = Array(20).fill('<p>Content</p>').join('\n');
      const html = `<html><body>${htmlContent}<script>${scriptContent}</script></body></html>`;

      const result = needsSSR(html);
      expect(result).toBe(true);
    });

    it('handles_external_script_tags', () => {
      const html = `<html><body>
        <p>Some content</p>
        <script src="external.js"></script>
        <script>var x = 1;</script>
      </body></html>`;

      const result = needsSSR(html);
      expect(typeof result).toBe('boolean');
    });
  });

  describe('edge_cases', () => {
    it('handles_complex_spa_content', () => {
      const html = `<!DOCTYPE html>
<html>
<body>
  <div id="__next" data-reactroot="">
    <p>Some content</p>
  </div>
  <noscript>${Array(25).fill('<p>Noscript content</p>').join('\n')}</noscript>
  <script>${Array(100).fill('var x = 1;').join('\n')}</script>
</body>
</html>`;

      const result = needsSSR(html);
      expect(result).toBe(true);
    });

    it('handles_malformed_html_gracefully', () => {
      const malformedCases = [
        '<div id="__next">unclosed div',
        '<script>unclosed script',
        '<noscript>unclosed noscript',
        '<html><body><div>missing closing tags',
      ];

      for (const html of malformedCases) {
        const result = needsSSR(html);
        expect(typeof result).toBe('boolean');
      }
    });

    it('handles_amp_pages', () => {
      const html = HTML_FIXTURES.ampPage;
      const result = needsSSR(html);
      expect(result).toBe(false);
    });
  });
});
