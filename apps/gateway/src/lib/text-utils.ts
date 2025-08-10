const MAX_CODE_LINES = 200;

/**
 * Truncates long code blocks in Markdown and HTML content
 * to prevent token explosion while maintaining readability.
 */
export const truncateCodeBlocks = (input: string): string => {
  let result = input;

  // Markdown-style ```lang\n...```
  result = result.replace(
    /```([a-zA-Z0-9_-]*)\n([\s\S]*?)```/g,
    (_m, lang: string, body: string) => {
      const lines = body.split('\n');
      const langPrefix = lang ? lang : '';
      if (lines.length <= MAX_CODE_LINES) return `\`\`\`${langPrefix}\n${body}\`\`\``;
      const head = lines.slice(0, MAX_CODE_LINES).join('\n');
      const tail = lines.length - MAX_CODE_LINES;
      return `\`\`\`${langPrefix}\n${head}\n... [truncated ${tail} lines] ...\n\`\`\``;
    }
  );

  // HTML <pre><code ...> and <pre ...> patterns
  result = result.replace(
    /<pre[^>]*><code[^>]*>([\s\S]*?)<\/code><\/pre>/gi,
    (_m, body: string) => {
      const lines = body.split('\n');
      if (lines.length <= MAX_CODE_LINES) return _m; // return original match
      const head = lines.slice(0, MAX_CODE_LINES).join('\n');
      const tail = lines.length - MAX_CODE_LINES;
      return _m.replace(body, `${head}\n... [truncated ${tail} lines] ...`);
    }
  );

  // HTML <pre ...> without <code>
  result = result.replace(
    /<pre([^>]*)>([\s\S]*?)<\/pre>/gi,
    (match, attrs: string, body: string) => {
      // Skip if it contains <code> tag (already processed above)
      if (body.includes('<code')) return match;

      const lines = body.split('\n');
      if (lines.length <= MAX_CODE_LINES) return match;
      const head = lines.slice(0, MAX_CODE_LINES).join('\n');
      const tail = lines.length - MAX_CODE_LINES;
      return `<pre${attrs}>${head}\n... [truncated ${tail} lines] ...</pre>`;
    }
  );

  return result;
};
