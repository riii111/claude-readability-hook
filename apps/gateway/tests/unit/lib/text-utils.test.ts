import { describe, expect, it } from 'bun:test';
import { truncateCodeBlocks } from '../../../src/lib/text-utils';
import { MAX_CODE_LINES, TRUNC_SUFFIX } from '../../helpers/fixtures';

describe('Text Utils', () => {
  describe('truncateCodeBlocks', () => {
    it('returns_original_when_no_code_blocks', () => {
      const input = 'Just plain text without code';
      const expected = 'Just plain text without code';
      const result = truncateCodeBlocks(input);
      expect(result).toBe(expected);
    });

    it('returns_original_when_empty_string', () => {
      const input = '';
      const expected = '';
      const result = truncateCodeBlocks(input);
      expect(result).toBe(expected);
    });

    describe('markdown code blocks', () => {
      const boundaryLineCases = [
        { name: 'below_limit', lines: 199, expectTruncated: false },
        { name: 'at_limit', lines: 200, expectTruncated: false },
        { name: 'over_limit', lines: 201, expectTruncated: true },
        { name: 'well_over', lines: 500, expectTruncated: true },
      ];

      for (const { name, lines, expectTruncated } of boundaryLineCases) {
        it(`${expectTruncated ? 'truncates' : 'preserves'}_markdown_${name}`, () => {
          const code = Array(lines).fill('line').join('\n');
          const input = `\`\`\`js\n${code}\`\`\``;
          const result = truncateCodeBlocks(input);

          if (expectTruncated) {
            expect(result.includes(TRUNC_SUFFIX)).toBe(true);
            expect(result.includes(`${lines - MAX_CODE_LINES} lines`)).toBe(true);

            const resultLines = result.split('\n');
            expect(resultLines.length).toBeLessThanOrEqual(MAX_CODE_LINES + 3);
          } else {
            expect(result).toBe(input);
          }
        });
      }

      it('truncates_multiple_code_blocks_independently', () => {
        const shortCode = Array(50).fill('short').join('\n');
        const longCode = Array(300).fill('long').join('\n');
        const input = `
Text before
\`\`\`js
${shortCode}\`\`\`
Text between
\`\`\`python
${longCode}\`\`\`
Text after`;

        const result = truncateCodeBlocks(input);

        expect(result.includes('Text before')).toBe(true);
        expect(result.includes('Text between')).toBe(true);
        expect(result.includes('Text after')).toBe(true);
        expect(result.includes('short\n')).toBe(true);
        expect(result.includes(TRUNC_SUFFIX)).toBe(true);
        expect(result.includes('100 lines')).toBe(true);
      });

      it('preserves_language_identifier', () => {
        const code = Array(250).fill('line').join('\n');
        const input = `\`\`\`typescript\n${code}\`\`\``;
        const result = truncateCodeBlocks(input);

        expect(result.includes('```typescript')).toBe(true);
        expect(result.includes(TRUNC_SUFFIX)).toBe(true);
      });

      it('handles_code_block_without_language', () => {
        const code = Array(250).fill('line').join('\n');
        const input = `\`\`\`\n${code}\`\`\``;
        const result = truncateCodeBlocks(input);

        expect(result.startsWith('```\n')).toBe(true);
        expect(result.includes(TRUNC_SUFFIX)).toBe(true);
      });
    });

    describe('HTML code blocks', () => {
      const boundaryLineCases = [
        { name: 'below_limit', lines: 199, expectTruncated: false },
        { name: 'at_limit', lines: 200, expectTruncated: false },
        { name: 'over_limit', lines: 201, expectTruncated: true },
      ];

      for (const { name, lines, expectTruncated } of boundaryLineCases) {
        it(`${expectTruncated ? 'truncates' : 'preserves'}_html_pre_code_${name}`, () => {
          const code = Array(lines).fill('line').join('\n');
          const input = `<pre><code>${code}</code></pre>`;
          const result = truncateCodeBlocks(input);

          if (expectTruncated) {
            expect(result.includes(TRUNC_SUFFIX)).toBe(true);
            expect(result.includes(`${lines - MAX_CODE_LINES} lines`)).toBe(true);
          } else {
            expect(result).toBe(input);
          }
        });
      }

      it('truncates_html_pre_without_code_tag', () => {
        const code = Array(250).fill('line').join('\n');
        const input = `<pre>${code}</pre>`;
        const result = truncateCodeBlocks(input);

        expect(result.includes(TRUNC_SUFFIX)).toBe(true);
        expect(result.includes('50 lines')).toBe(true);
      });

      it('handles_nested_pre_tags', () => {
        const outerCode = Array(250).fill('outer').join('\n');
        const innerCode = Array(100).fill('inner').join('\n');
        const input = `<pre>${outerCode}<pre>${innerCode}</pre></pre>`;
        const result = truncateCodeBlocks(input);

        expect(result.includes(TRUNC_SUFFIX)).toBe(true);
      });

      it('preserves_pre_tag_attributes', () => {
        const code = Array(250).fill('line').join('\n');
        const input = `<pre class="language-js" data-line="5">${code}</pre>`;
        const result = truncateCodeBlocks(input);

        expect(result.includes('<pre class="language-js" data-line="5">')).toBe(true);
        expect(result.includes(TRUNC_SUFFIX)).toBe(true);
      });
    });

    describe('mixed content', () => {
      it('truncates_both_markdown_and_html_blocks', () => {
        const mdCode = Array(250).fill('md').join('\n');
        const htmlCode = Array(300).fill('html').join('\n');
        const input = `
# Title
\`\`\`js
${mdCode}\`\`\`
<p>Paragraph</p>
<pre><code>${htmlCode}</code></pre>
End text`;

        const result = truncateCodeBlocks(input);

        expect(result.includes('# Title')).toBe(true);
        expect(result.includes('<p>Paragraph</p>')).toBe(true);
        expect(result.includes('End text')).toBe(true);

        const truncCount = (result.match(/\.\.\. \[truncated/g) || []).length;
        expect(truncCount).toBe(2);
      });

      it('preserves_inline_code', () => {
        const longBlock = Array(250).fill('block').join('\n');
        const input = `
Inline \`code\` here
\`\`\`
${longBlock}\`\`\`
More inline \`code\` after`;

        const result = truncateCodeBlocks(input);

        expect(result.includes('Inline `code` here')).toBe(true);
        expect(result.includes('More inline `code` after')).toBe(true);
        expect(result.includes(TRUNC_SUFFIX)).toBe(true);
      });
    });

    describe('edge cases', () => {
      it('handles_code_block_at_start', () => {
        const code = Array(250).fill('line').join('\n');
        const input = `\`\`\`\n${code}\`\`\``;
        const result = truncateCodeBlocks(input);

        expect(result.startsWith('```')).toBe(true);
        expect(result.includes(TRUNC_SUFFIX)).toBe(true);
      });

      it('handles_code_block_at_end', () => {
        const code = Array(250).fill('line').join('\n');
        const input = `Text\n\`\`\`\n${code}\`\`\``;
        const result = truncateCodeBlocks(input);

        expect(result.startsWith('Text')).toBe(true);
        expect(result.endsWith('```')).toBe(true);
        expect(result.includes(TRUNC_SUFFIX)).toBe(true);
      });

      it('handles_unclosed_code_block', () => {
        const code = Array(250).fill('line').join('\n');
        const input = `\`\`\`\n${code}`;
        const result = truncateCodeBlocks(input);

        expect(result).toBe(input);
      });

      it('handles_malformed_html', () => {
        const code = Array(250).fill('line').join('\n');
        const input = `<pre>${code}`;
        const result = truncateCodeBlocks(input);

        expect(result).toBe(input);
      });

      it('preserves_exact_line_count_in_truncation_message', () => {
        const lines = 350;
        const code = Array(lines).fill('x').join('\n');
        const input = `\`\`\`\n${code}\`\`\``;
        const result = truncateCodeBlocks(input);

        const truncatedLines = lines - MAX_CODE_LINES;
        expect(result.includes(`... [truncated ${truncatedLines} lines] ...`)).toBe(true);
      });
    });
  });
});
