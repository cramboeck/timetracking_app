import { useMemo } from 'react';

interface MarkdownRendererProps {
  content: string;
  className?: string;
}

/**
 * Simple Markdown renderer supporting:
 * - # Headings (h1-h4)
 * - **bold** and *italic*
 * - `inline code`
 * - ```code blocks```
 * - [links](url)
 * - Lists (- item or 1. item)
 * - > Blockquotes
 * - --- Horizontal rules
 * - Paragraphs (blank lines)
 */
export const MarkdownRenderer = ({ content, className = '' }: MarkdownRendererProps) => {
  const rendered = useMemo(() => {
    if (!content) return null;

    const lines = content.split('\n');
    const elements: JSX.Element[] = [];
    let currentList: { type: 'ul' | 'ol'; items: string[] } | null = null;
    let blockquoteLines: string[] = [];
    let codeBlockLines: string[] | null = null;
    let codeBlockLanguage: string = '';

    const flushBlockquote = () => {
      if (blockquoteLines.length > 0) {
        elements.push(
          <blockquote
            key={`bq-${elements.length}`}
            className="pl-4 border-l-4 border-gray-300 dark:border-gray-600 italic text-gray-600 dark:text-gray-400 my-2"
          >
            {blockquoteLines.map((line, i) => (
              <span key={i}>
                {parseInline(line)}
                {i < blockquoteLines.length - 1 && <br />}
              </span>
            ))}
          </blockquote>
        );
        blockquoteLines = [];
      }
    };

    const flushList = () => {
      if (currentList) {
        const ListTag = currentList.type === 'ul' ? 'ul' : 'ol';
        const listClass = currentList.type === 'ul'
          ? 'list-disc pl-6 my-2 space-y-1'
          : 'list-decimal pl-6 my-2 space-y-1';

        elements.push(
          <ListTag key={`list-${elements.length}`} className={listClass}>
            {currentList.items.map((item, i) => (
              <li key={i} className="text-gray-900 dark:text-white">
                {parseInline(item)}
              </li>
            ))}
          </ListTag>
        );
        currentList = null;
      }
    };

    const flushCodeBlock = () => {
      if (codeBlockLines !== null) {
        elements.push(
          <pre
            key={`code-${elements.length}`}
            className="bg-gray-100 dark:bg-gray-800 rounded-lg p-4 my-3 overflow-x-auto"
          >
            <code className="text-sm font-mono text-gray-800 dark:text-gray-200">
              {codeBlockLines.join('\n')}
            </code>
          </pre>
        );
        codeBlockLines = null;
        codeBlockLanguage = '';
      }
    };

    const parseInline = (text: string): (string | JSX.Element)[] => {
      const result: (string | JSX.Element)[] = [];
      let remaining = text;
      let keyIndex = 0;

      // Combined regex for all inline patterns
      const patterns = [
        // Bold **text** or __text__
        { regex: /\*\*(.+?)\*\*|__(.+?)__/, render: (m: RegExpMatchArray) => (
          <strong key={keyIndex++} className="font-bold">{m[1] || m[2]}</strong>
        )},
        // Italic *text* or _text_ (but not **bold**)
        { regex: /(?<!\*)\*(?!\*)(.+?)(?<!\*)\*(?!\*)|(?<!_)_(?!_)(.+?)(?<!_)_(?!_)/, render: (m: RegExpMatchArray) => (
          <em key={keyIndex++} className="italic">{m[1] || m[2]}</em>
        )},
        // Inline code `code`
        { regex: /`([^`]+)`/, render: (m: RegExpMatchArray) => (
          <code key={keyIndex++} className="px-1.5 py-0.5 bg-gray-100 dark:bg-gray-800 text-pink-600 dark:text-pink-400 rounded text-sm font-mono">
            {m[1]}
          </code>
        )},
        // Links [text](url)
        { regex: /\[([^\]]+)\]\(([^)]+)\)/, render: (m: RegExpMatchArray) => (
          <a
            key={keyIndex++}
            href={m[2]}
            target="_blank"
            rel="noopener noreferrer"
            className="text-accent-primary hover:underline"
          >
            {m[1]}
          </a>
        )},
      ];

      while (remaining) {
        let earliestMatch: { index: number; length: number; element: JSX.Element } | null = null;

        for (const pattern of patterns) {
          const match = remaining.match(pattern.regex);
          if (match && match.index !== undefined) {
            if (!earliestMatch || match.index < earliestMatch.index) {
              earliestMatch = {
                index: match.index,
                length: match[0].length,
                element: pattern.render(match),
              };
            }
          }
        }

        if (earliestMatch) {
          // Add text before match
          if (earliestMatch.index > 0) {
            result.push(remaining.substring(0, earliestMatch.index));
          }
          // Add the matched element
          result.push(earliestMatch.element);
          // Continue with remaining text
          remaining = remaining.substring(earliestMatch.index + earliestMatch.length);
        } else {
          // No more matches, add remaining text
          result.push(remaining);
          break;
        }
      }

      return result;
    };

    lines.forEach((line, index) => {
      // Code block start/end
      if (line.startsWith('```')) {
        if (codeBlockLines === null) {
          // Start code block
          flushBlockquote();
          flushList();
          codeBlockLines = [];
          codeBlockLanguage = line.substring(3).trim();
        } else {
          // End code block
          flushCodeBlock();
        }
        return;
      }

      // Inside code block
      if (codeBlockLines !== null) {
        codeBlockLines.push(line);
        return;
      }

      // Horizontal rule
      if (line.match(/^[-*_]{3,}\s*$/)) {
        flushBlockquote();
        flushList();
        elements.push(
          <hr key={`hr-${index}`} className="my-4 border-gray-300 dark:border-gray-600" />
        );
        return;
      }

      // Headings
      const headingMatch = line.match(/^(#{1,4})\s+(.+)$/);
      if (headingMatch) {
        flushBlockquote();
        flushList();
        const level = headingMatch[1].length;
        const text = headingMatch[2];
        const headingClasses: Record<number, string> = {
          1: 'text-2xl font-bold text-gray-900 dark:text-white mt-6 mb-3',
          2: 'text-xl font-bold text-gray-900 dark:text-white mt-5 mb-2',
          3: 'text-lg font-semibold text-gray-900 dark:text-white mt-4 mb-2',
          4: 'text-base font-semibold text-gray-900 dark:text-white mt-3 mb-1',
        };
        const HeadingTag = `h${level}` as keyof JSX.IntrinsicElements;
        elements.push(
          <HeadingTag key={`h-${index}`} className={headingClasses[level]}>
            {parseInline(text)}
          </HeadingTag>
        );
        return;
      }

      // Blockquote
      if (line.startsWith('> ')) {
        flushList();
        blockquoteLines.push(line.substring(2));
        return;
      } else {
        flushBlockquote();
      }

      // Unordered list
      if (line.match(/^[-*+]\s+/)) {
        flushBlockquote();
        const item = line.replace(/^[-*+]\s+/, '');
        if (currentList?.type === 'ul') {
          currentList.items.push(item);
        } else {
          flushList();
          currentList = { type: 'ul', items: [item] };
        }
        return;
      }

      // Ordered list
      if (line.match(/^\d+\.\s+/)) {
        flushBlockquote();
        const item = line.replace(/^\d+\.\s+/, '');
        if (currentList?.type === 'ol') {
          currentList.items.push(item);
        } else {
          flushList();
          currentList = { type: 'ol', items: [item] };
        }
        return;
      }

      // Flush any pending list before adding paragraph/line
      flushList();

      // Empty line = paragraph break
      if (line.trim() === '') {
        if (elements.length > 0) {
          elements.push(<div key={`br-${index}`} className="h-2" />);
        }
        return;
      }

      // Regular text line
      elements.push(
        <p key={`p-${index}`} className="text-gray-900 dark:text-white">
          {parseInline(line)}
        </p>
      );
    });

    // Flush any remaining content
    flushBlockquote();
    flushList();
    flushCodeBlock();

    return elements;
  }, [content]);

  if (!content) {
    return null;
  }

  return (
    <div className={`markdown-content space-y-1 ${className}`}>
      {rendered}
    </div>
  );
};
