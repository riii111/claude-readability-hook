const MAX_CODE_LINES = 200;

/**
 * Truncates long code blocks in Markdown and HTML content
 * to prevent token explosion while maintaining readability.
 */
export const truncateCodeBlocks = (input: string): string => {
  let result = input;

  // Markdown-style ```
  result = result.replace(/```([\s\S]*?)```/g, (_m, p1: string) => {
    const lines = p1.split('\n');
    if (lines.length <= MAX_CODE_LINES) return `\`\`\`${p1}\`\`\``;
    const head = lines.slice(0, MAX_CODE_LINES).join('\n');
    const tail = lines.length - MAX_CODE_LINES;
    return `\`\`\`${head}\n... [truncated ${tail} lines] ...\n\`\`\``;
  });

  // HTML <pre><code>
  result = result.replace(/<pre><code>([\s\S]*?)<\/code><\/pre>/gi, (_m, p1: string) => {
    const lines = p1.split('\n');
    if (lines.length <= MAX_CODE_LINES) return `<pre><code>${p1}</code></pre>`;
    const head = lines.slice(0, MAX_CODE_LINES).join('\n');
    const tail = lines.length - MAX_CODE_LINES;
    return `<pre><code>${head}\n... [truncated ${tail} lines] ...\n</code></pre>`;
  });

  return result;
};
