import { useRef, useCallback, KeyboardEvent } from 'react';
import { Bold, Italic, List, Code, Link2, ListOrdered, Quote } from 'lucide-react';

interface MarkdownEditorProps {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  rows?: number;
  disabled?: boolean;
  className?: string;
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
}: MarkdownEditorProps) => {
  const textareaRef = useRef<HTMLTextAreaElement>(null);

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

  return (
    <div className={`border border-gray-300 dark:border-gray-600 rounded-lg overflow-hidden ${className}`}>
      {/* Toolbar */}
      <div className="flex items-center gap-1 px-2 py-1.5 bg-gray-50 dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700">
        {tools.map((tool, index) => {
          const Icon = tool.icon;
          return (
            <button
              key={index}
              type="button"
              onClick={() => handleToolClick(tool)}
              disabled={disabled}
              title={tool.title}
              className="p-1.5 rounded hover:bg-gray-200 dark:hover:bg-gray-700 text-gray-600 dark:text-gray-400 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              <Icon size={16} />
            </button>
          );
        })}
        <span className="ml-auto text-xs text-gray-400 dark:text-gray-500 hidden sm:inline">
          Markdown unterstützt
        </span>
      </div>

      {/* Textarea */}
      <textarea
        ref={textareaRef}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={handleKeyDown}
        placeholder={placeholder}
        rows={rows}
        disabled={disabled}
        className="w-full px-3 py-2 bg-white dark:bg-gray-900 text-gray-900 dark:text-white resize-none focus:outline-none"
      />
    </div>
  );
};
