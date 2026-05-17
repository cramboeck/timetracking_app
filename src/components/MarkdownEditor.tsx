import { useRef, useCallback, useState, KeyboardEvent, ClipboardEvent } from 'react';
import { Bold, Italic, List, Code, Link2, ListOrdered, Quote, Image, Loader2 } from 'lucide-react';

interface MarkdownEditorProps {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  rows?: number;
  disabled?: boolean;
  className?: string;
  onImagePaste?: (file: File) => Promise<string>;
}

interface ToolbarButton {
  icon: React.ComponentType<{ size?: number }>;
  title: string;
  shortcut: string;
  prefix: string;
  suffix: string;
  multiline?: boolean;
}

export const MarkdownEditor = ({
  value,
  onChange,
  placeholder = 'Text eingeben...',
  rows = 4,
  disabled = false,
  className = '',
  onImagePaste,
}: MarkdownEditorProps) => {
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const [isUploading, setIsUploading] = useState(false);

  const tools: ToolbarButton[] = [
    { icon: Bold, title: 'Fett (Ctrl+B)', shortcut: 'b', prefix: '**', suffix: '**' },
    { icon: Italic, title: 'Kursiv (Ctrl+I)', shortcut: 'i', prefix: '*', suffix: '*' },
    { icon: Code, title: 'Code (Ctrl+`)', shortcut: '`', prefix: '`', suffix: '`' },
    { icon: Link2, title: 'Link (Ctrl+K)', shortcut: 'k', prefix: '[', suffix: '](url)' },
    { icon: List, title: 'Liste (Ctrl+L)', shortcut: 'l', prefix: '- ', suffix: '', multiline: true },
    { icon: ListOrdered, title: 'Nummerierte Liste', shortcut: '', prefix: '1. ', suffix: '', multiline: true },
    { icon: Quote, title: 'Zitat', shortcut: '', prefix: '> ', suffix: '', multiline: true },
  ];

  const insertFormatting = useCallback((prefix: string, suffix: string, multiline = false) => {
    const textarea = textareaRef.current;
    if (!textarea) return;

    const start = textarea.selectionStart;
    const end = textarea.selectionEnd;
    const selectedText = value.substring(start, end);

    let newText: string;
    let newCursorPos: number;

    if (multiline && selectedText.includes('\n')) {
      // Apply prefix to each line
      const lines = selectedText.split('\n');
      const formattedLines = lines.map(line => `${prefix}${line}`).join('\n');
      newText = value.substring(0, start) + formattedLines + value.substring(end);
      newCursorPos = start + formattedLines.length;
    } else if (multiline && !selectedText) {
      // Insert at beginning of current line
      const beforeCursor = value.substring(0, start);
      const lastNewline = beforeCursor.lastIndexOf('\n');
      const lineStart = lastNewline + 1;
      newText = value.substring(0, lineStart) + prefix + value.substring(lineStart);
      newCursorPos = start + prefix.length;
    } else if (selectedText) {
      // Wrap selected text
      newText = value.substring(0, start) + prefix + selectedText + suffix + value.substring(end);
      newCursorPos = end + prefix.length + suffix.length;
    } else {
      // Insert and place cursor between
      newText = value.substring(0, start) + prefix + suffix + value.substring(end);
      newCursorPos = start + prefix.length;
    }

    onChange(newText);

    // Restore cursor position after React re-render
    requestAnimationFrame(() => {
      textarea.focus();
      textarea.setSelectionRange(newCursorPos, newCursorPos);
    });
  }, [value, onChange]);

  const handleKeyDown = useCallback((e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (!e.ctrlKey && !e.metaKey) return;

    const tool = tools.find(t => t.shortcut === e.key.toLowerCase());
    if (tool) {
      e.preventDefault();
      insertFormatting(tool.prefix, tool.suffix, tool.multiline);
    }
  }, [tools, insertFormatting]);

  const handleToolClick = useCallback((tool: ToolbarButton) => {
    insertFormatting(tool.prefix, tool.suffix, tool.multiline);
  }, [insertFormatting]);

  const insertImageMarkdown = useCallback((url: string, altText = 'Bild') => {
    const textarea = textareaRef.current;
    if (!textarea) return;

    const start = textarea.selectionStart;
    const imageMarkdown = `![${altText}](${url})`;
    const newText = value.substring(0, start) + imageMarkdown + value.substring(start);
    onChange(newText);

    requestAnimationFrame(() => {
      textarea.focus();
      const newPos = start + imageMarkdown.length;
      textarea.setSelectionRange(newPos, newPos);
    });
  }, [value, onChange]);

  const handlePaste = useCallback(async (e: ClipboardEvent<HTMLTextAreaElement>) => {
    if (!onImagePaste) return;

    const items = e.clipboardData?.items;
    if (!items) return;

    for (const item of Array.from(items)) {
      if (item.type.startsWith('image/')) {
        e.preventDefault();
        const file = item.getAsFile();
        if (!file) continue;

        setIsUploading(true);
        try {
          const url = await onImagePaste(file);
          insertImageMarkdown(url);
        } catch (error) {
          console.error('Failed to upload image:', error);
        } finally {
          setIsUploading(false);
        }
        return;
      }
    }
  }, [onImagePaste, insertImageMarkdown]);

  return (
    <div className={`border border-gray-300 dark:border-dark-border rounded-lg overflow-hidden ${className}`}>
      {/* Toolbar */}
      <div className="flex items-center gap-1 px-2 py-1.5 bg-gray-50 dark:bg-dark-100 border-b border-gray-200 dark:border-dark-border">
        {tools.map((tool, index) => {
          const Icon = tool.icon;
          return (
            <button
              key={index}
              type="button"
              onClick={() => handleToolClick(tool)}
              disabled={disabled}
              title={tool.title}
              className="p-1.5 rounded hover:bg-gray-200 dark:hover:bg-dark-200 text-gray-600 dark:text-dark-400 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              <Icon size={16} />
            </button>
          );
        })}
        {onImagePaste && (
          <div className="flex items-center gap-1 ml-2 pl-2 border-l border-gray-200 dark:border-dark-border">
            <span className="text-xs text-gray-400 dark:text-dark-400 hidden sm:inline">
              <Image size={14} className="inline mr-1" />
              Strg+V für Screenshots
            </span>
          </div>
        )}
        {isUploading && (
          <div className="flex items-center gap-1 ml-2 text-accent-primary">
            <Loader2 size={14} className="animate-spin" />
            <span className="text-xs">Hochladen...</span>
          </div>
        )}
        <span className="ml-auto text-xs text-gray-400 dark:text-dark-400 hidden sm:inline">
          Markdown unterstützt
        </span>
      </div>

      {/* Textarea */}
      <textarea
        ref={textareaRef}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={handleKeyDown}
        onPaste={handlePaste}
        placeholder={placeholder}
        rows={rows}
        disabled={disabled || isUploading}
        className="w-full px-3 py-2 bg-white dark:bg-dark-50 text-gray-900 dark:text-white resize-none focus:outline-none"
      />
    </div>
  );
};
