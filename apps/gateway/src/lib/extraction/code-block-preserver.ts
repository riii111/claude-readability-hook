import { JSDOM } from 'jsdom';

export interface CodeBlockInfo {
  id: string;
  content: string;
  language: string | undefined;
  isInline: boolean;
}

export class CodeBlockPreserver {
  private codeBlocks = new Map<string, CodeBlockInfo>();
  private counter = 0;

  public extractFromHtml(html: string): string {
    const dom = new JSDOM(html);
    const document = dom.window.document;

    for (const pre of document.querySelectorAll('pre')) {
      const id = this.createPlaceholder();
      const codeElement = pre.querySelector('code');
      const content = codeElement ? codeElement.textContent || '' : pre.textContent || '';
      const language = this.detectLanguage(codeElement || pre);

      this.codeBlocks.set(id, {
        id,
        content: content.trim(),
        language,
        isInline: false,
      });

      const placeholder = document.createTextNode(id);
      pre.parentNode?.replaceChild(placeholder, pre);
    }

    for (const code of document.querySelectorAll('code:not(pre code)')) {
      const id = this.createPlaceholder();
      const content = code.textContent || '';

      this.codeBlocks.set(id, {
        id,
        content: content.trim(),
        language: this.detectLanguage(code),
        isInline: true,
      });

      const placeholder = document.createTextNode(id);
      code.parentNode?.replaceChild(placeholder, code);
    }

    return dom.serialize();
  }

  public restoreInText(text: string): string {
    let restoredText = text;

    const sortedBlocks = Array.from(this.codeBlocks.entries()).sort(
      (a, b) => text.indexOf(a[0]) - text.indexOf(b[0])
    );

    for (const [id, info] of sortedBlocks) {
      const replacement = info.isInline
        ? `\`${info.content}\``
        : `\n\n\`\`\`${info.language || ''}\n${info.content}\n\`\`\`\n\n`;

      restoredText = restoredText.replace(id, replacement);
    }

    return restoredText.replace(/\n{3,}/g, '\n\n').trim();
  }

  public clear(): void {
    this.codeBlocks.clear();
    this.counter = 0;
  }

  private createPlaceholder(): string {
    return `__CODEBLOCK_${this.counter++}__`;
  }

  private detectLanguage(element: Element): string | undefined {
    const className = element.className;
    const patterns = [
      /language-([a-zA-Z0-9]+)/,
      /lang-([a-zA-Z0-9]+)/,
      /hljs-([a-zA-Z0-9]+)/,
      /brush: *([a-zA-Z0-9]+)/,
      /code-([a-zA-Z0-9]+)/,
    ];

    for (const pattern of patterns) {
      const match = className.match(pattern);
      if (match) return match[1];
    }

    return element.getAttribute('data-lang') || element.getAttribute('data-language') || undefined;
  }
}
