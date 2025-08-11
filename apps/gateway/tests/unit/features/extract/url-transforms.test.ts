import { describe, expect, it } from 'bun:test';
import {
  transformAmp,
  transformMobile,
  transformPrint,
  transformUrl,
} from '../../../../src/features/extract/usecase';

describe('URL transforms', () => {
  describe('transformAmp', () => {
    it('removes_amp_path_suffix', () => {
      const ampUrls = [
        'https://example.com/article/amp',
        'https://news.site.com/story/123/amp',
        'https://blog.example.org/post-title/amp/',
        'https://example.com/path/to/article/amp?param=value',
      ];

      const expectedUrls = [
        'https://example.com/article',
        'https://news.site.com/story/123',
        'https://blog.example.org/post-title',
        'https://example.com/path/to/article?param=value',
      ];

      for (let i = 0; i < ampUrls.length; i++) {
        const url = new URL(ampUrls[i]);
        const result = transformAmp(url);
        expect(result.href).toBe(expectedUrls[i]);
      }
    });

    it('preserves_non_amp_urls', () => {
      const nonAmpUrls = [
        'https://example.com/article',
        'https://example.com/example-amp-article',
        'https://example.com/amp-news/story',
        'https://example.com/article?amp=true',
        'https://amp.example.com/article',
      ];

      for (const urlStr of nonAmpUrls) {
        const url = new URL(urlStr);
        const result = transformAmp(url);
        expect(result.href).toBe(urlStr);
      }
    });

    it('handles_amp_at_root_path', () => {
      const url = new URL('https://example.com/amp');
      const result = transformAmp(url);
      expect(result.href).toBe('https://example.com/');
    });

    it('preserves_query_parameters_and_fragments', () => {
      const url = new URL('https://example.com/article/amp?utm_source=twitter&ref=home#section');
      const result = transformAmp(url);
      expect(result.href).toBe('https://example.com/article?utm_source=twitter&ref=home#section');
    });

    it('handles_trailing_slash_variations', () => {
      const cases = [
        { input: 'https://example.com/article/amp', expected: 'https://example.com/article' },
        { input: 'https://example.com/article/amp/', expected: 'https://example.com/article' },
        { input: 'https://example.com/amp', expected: 'https://example.com/' },
      ];

      for (const { input, expected } of cases) {
        const url = new URL(input);
        const result = transformAmp(url);
        expect(result.href).toBe(expected);
      }
    });
  });

  describe('transformMobile', () => {
    it('converts_m_subdomain_to_www', () => {
      const mobileUrls = [
        'https://m.example.com/article',
        'https://m.wikipedia.org/wiki/Article',
        'https://m.reddit.com/r/programming',
      ];

      const expectedUrls = [
        'https://www.example.com/article',
        'https://www.wikipedia.org/wiki/Article',
        'https://www.reddit.com/r/programming',
      ];

      for (let i = 0; i < mobileUrls.length; i++) {
        const url = new URL(mobileUrls[i]);
        const result = transformMobile(url);
        expect(result.href).toBe(expectedUrls[i]);
      }
    });

    it('converts_mobile_subdomain_to_www', () => {
      const mobileUrls = [
        'https://mobile.example.com/page',
        'https://mobile.site.co.uk/article',
        'https://mobile.news-site.org/story',
      ];

      const expectedUrls = [
        'https://www.example.com/page',
        'https://www.site.co.uk/article',
        'https://www.news-site.org/story',
      ];

      for (let i = 0; i < mobileUrls.length; i++) {
        const url = new URL(mobileUrls[i]);
        const result = transformMobile(url);
        expect(result.href).toBe(expectedUrls[i]);
      }
    });

    it('preserves_non_mobile_subdomains', () => {
      const nonMobileUrls = [
        'https://www.example.com/article',
        'https://api.example.com/data',
        'https://blog.example.com/post',
        'https://example.com/mobile-app',
        'https://amp.example.com/page',
        'https://mail.example.com/inbox',
      ];

      for (const urlStr of nonMobileUrls) {
        const url = new URL(urlStr);
        const result = transformMobile(url);
        expect(result.href).toBe(urlStr);
      }
    });

    it('preserves_query_and_fragment', () => {
      const url = new URL('https://m.example.com/article?id=123&ref=home#comments');
      const result = transformMobile(url);
      expect(result.href).toBe('https://www.example.com/article?id=123&ref=home#comments');
    });

    it('handles_domains_without_existing_www', () => {
      const url = new URL('https://m.simple-domain.com/page');
      const result = transformMobile(url);
      expect(result.href).toBe('https://www.simple-domain.com/page');
    });

    const mobileSubdomainCases = [
      { name: 'm_prefix', input: 'm.example.com', expected: 'www.example.com' },
      { name: 'mobile_prefix', input: 'mobile.example.com', expected: 'www.example.com' },
      {
        name: 'false_positive_containing_m',
        input: 'amp.example.com',
        expected: 'amp.example.com',
      },
      {
        name: 'false_positive_containing_mobile',
        input: 'automobile.example.com',
        expected: 'automobile.example.com',
      },
    ];

    for (const { name, input, expected } of mobileSubdomainCases) {
      it(`handles_${name}_correctly`, () => {
        const url = new URL(`https://${input}/page`);
        const result = transformMobile(url);
        expect(result.hostname).toBe(expected);
      });
    }
  });

  describe('transformPrint', () => {
    it('removes_print_query_parameter', () => {
      const printUrls = [
        'https://example.com/article?print=1',
        'https://example.com/page?print=true',
        'https://example.com/story?print=yes',
        'https://example.com/article?utm_source=twitter&print=1&ref=home',
      ];

      const expectedUrls = [
        'https://example.com/article',
        'https://example.com/page',
        'https://example.com/story',
        'https://example.com/article?utm_source=twitter&ref=home',
      ];

      for (let i = 0; i < printUrls.length; i++) {
        const url = new URL(printUrls[i]);
        const result = transformPrint(url);
        expect(result.href).toBe(expectedUrls[i]);
      }
    });

    it('removes_plain_query_parameter', () => {
      const plainUrls = [
        'https://example.com/article?plain=1',
        'https://example.com/page?plain=true',
        'https://example.com/story?other=value&plain=1',
      ];

      const expectedUrls = [
        'https://example.com/article',
        'https://example.com/page',
        'https://example.com/story?other=value',
      ];

      for (let i = 0; i < plainUrls.length; i++) {
        const url = new URL(plainUrls[i]);
        const result = transformPrint(url);
        expect(result.href).toBe(expectedUrls[i]);
      }
    });

    it('preserves_urls_without_print_params', () => {
      const normalUrls = [
        'https://example.com/article',
        'https://example.com/page?id=123',
        'https://example.com/story?printer=hp&format=pdf',
        'https://example.com/article?printing=false',
      ];

      for (const urlStr of normalUrls) {
        const url = new URL(urlStr);
        const result = transformPrint(url);
        expect(result.href).toBe(urlStr);
      }
    });

    it('preserves_fragment_after_param_removal', () => {
      const url = new URL('https://example.com/article?print=1&other=value#section');
      const result = transformPrint(url);
      expect(result.href).toBe('https://example.com/article?other=value#section');
    });

    const printParamCases = [
      { name: 'print_equals_1', param: 'print=1' },
      { name: 'print_equals_true', param: 'print=true' },
      { name: 'print_equals_yes', param: 'print=yes' },
      { name: 'plain_equals_1', param: 'plain=1' },
      { name: 'plain_equals_true', param: 'plain=true' },
    ];

    for (const { name, param } of printParamCases) {
      it(`removes_${name}_parameter`, () => {
        const url = new URL(`https://example.com/article?${param}&other=keep`);
        const result = transformPrint(url);
        expect(result.search).toBe('?other=keep');
      });
    }

    it('preserves_uppercase_params_by_spec', () => {
      const url = new URL('https://example.com/article?PRINT=1&PLAIN=1&other=keep');
      const result = transformPrint(url);
      // Current implementation deletes only lowercase names; uppercase remain by design
      expect(result.search).toBe('?PRINT=1&PLAIN=1&other=keep');
    });
  });

  describe('transformUrl_integration', () => {
    it('applies_all_transformations_in_sequence', () => {
      const complexUrl = 'https://m.example.com/article/amp?print=1&utm_source=twitter#section';
      const url = new URL(complexUrl);
      const result = transformUrl(url);

      expect(result.href).toBe('https://www.example.com/article?utm_source=twitter#section');
    });

    it('handles_partial_transformations', () => {
      const cases = [
        {
          name: 'only_amp_transform',
          input: 'https://example.com/article/amp?keep=true',
          expected: 'https://example.com/article?keep=true',
        },
        {
          name: 'only_mobile_transform',
          input: 'https://m.example.com/page?keep=true',
          expected: 'https://www.example.com/page?keep=true',
        },
        {
          name: 'only_print_transform',
          input: 'https://example.com/article?print=1&keep=true',
          expected: 'https://example.com/article?keep=true',
        },
        {
          name: 'no_transforms_needed',
          input: 'https://www.example.com/article?keep=true',
          expected: 'https://www.example.com/article?keep=true',
        },
      ];

      for (const { input, expected } of cases) {
        const url = new URL(input);
        const result = transformUrl(url);
        expect(result.href).toBe(expected);
      }
    });

    it('preserves_url_integrity_after_transforms', () => {
      const complexCases = [
        'https://m.reddit.com/r/programming/comments/123/title/amp?print=1&sort=top#comment-456',
        'https://mobile.wikipedia.org/wiki/Article_Title/amp?print=true&lang=en#History',
        'https://m.stackoverflow.com/questions/123/how-to-code/amp?plain=1&tab=votes',
      ];

      for (const urlStr of complexCases) {
        const url = new URL(urlStr);
        const result = transformUrl(url);

        expect(result instanceof URL).toBe(true);
        expect(result.protocol).toBe('https:');
        expect(result.hostname.startsWith('www.')).toBe(true);
        expect(result.pathname).not.toMatch(/\/amp\/?$/);
        expect(result.search).not.toMatch(/[&?](print|plain)=/);
      }
    });

    it('handles_edge_case_combinations', () => {
      const edgeCases = [
        {
          name: 'amp_at_root_with_mobile_and_print',
          input: 'https://m.example.com/amp?print=1',
          expected: 'https://www.example.com/',
        },
        {
          name: 'multiple_amp_like_paths',
          input: 'https://m.example.com/amp-news/story/amp?plain=1',
          expected: 'https://www.example.com/amp-news/story',
        },
        {
          name: 'print_only_parameter',
          input: 'https://mobile.example.com/page?print=1',
          expected: 'https://www.example.com/page',
        },
      ];

      for (const { input, expected } of edgeCases) {
        const url = new URL(input);
        const result = transformUrl(url);
        expect(result.href).toBe(expected);
      }
    });

    it('preserves_https_protocol_and_is_idempotent', () => {
      const inputs = [
        'https://m.example.com/article/amp?print=1&x=1&y=2',
        'https://mobile.site.co.uk/amp?plain=1#frag',
      ];
      for (const u of inputs) {
        const once = transformUrl(new URL(u));
        const twice = transformUrl(new URL(once.href));
        expect(once.href).toBe(twice.href);
        expect(once.protocol).toBe('https:');
      }
    });

    it('compares_queries_in_order_insensitive_way', () => {
      const url = new URL('https://m.example.com/page/amp?b=2&a=1&print=1');
      const result = transformUrl(url);
      const params = new URLSearchParams(result.search);
      expect(params.get('a')).toBe('1');
      expect(params.get('b')).toBe('2');
      expect(params.has('print')).toBe(false);
    });
  });
});
