import { Bot, Sparkles, Lightbulb, Tag, ChevronDown, MessageSquare, Loader2, ThumbsUp, ThumbsDown, Copy, ArrowRight } from 'lucide-react';
import { Button, IconButton } from '../ui/Button';
import { AISuggestion, TicketPriority } from './types';

interface TicketAIPanelProps {
  suggestions: AISuggestion[];
  loading: boolean;
  error: string | null;
  onGenerateSuggestion: (type: 'solution' | 'category' | 'priority' | 'response') => void;
  onFeedback: (suggestionId: string, isHelpful: boolean) => void;
  onApplyResponse: (content: string) => void;
  onApplyPriority: (content: string) => void;
  onApplySolution: (content: string) => void;
  onCopy: (content: string) => void;
}

export const TicketAIPanel = ({
  suggestions,
  loading,
  error,
  onGenerateSuggestion,
  onFeedback,
  onApplyResponse,
  onApplyPriority,
  onApplySolution,
  onCopy,
}: TicketAIPanelProps) => {
  const typeConfig = {
    solution: { label: 'Losung', color: 'bg-purple-100 text-purple-800 dark:bg-purple-900/50 dark:text-purple-300', icon: Lightbulb },
    category: { label: 'Kategorie', color: 'bg-accent-lighter text-accent-dark dark:bg-accent-primary/50 dark:text-accent-primary', icon: Tag },
    priority: { label: 'Prioritat', color: 'bg-orange-100 text-orange-800 dark:bg-orange-900/50 dark:text-orange-300', icon: ChevronDown },
    response: { label: 'Antwort', color: 'bg-green-100 text-green-800 dark:bg-green-900/50 dark:text-green-300', icon: MessageSquare },
  };

  return (
    <div className="p-4 bg-purple-50 dark:bg-purple-900/20 border border-purple-200 dark:border-purple-800 rounded-lg">
      <div className="flex items-center gap-2 mb-3">
        <Sparkles className="text-purple-600 dark:text-purple-400" size={18} />
        <h3 className="text-sm font-medium text-purple-800 dark:text-purple-300">
          KI-Assistent
        </h3>
      </div>

      {/* AI Assistant Type Buttons */}
      <div className="grid grid-cols-2 gap-2 mb-3">
        <Button
          onClick={() => onGenerateSuggestion('solution')}
          disabled={loading}
          variant="primary"
          size="sm"
          icon={<Lightbulb size={14} />}
          className="bg-purple-600 hover:bg-purple-700"
        >
          Losung vorschlagen
        </Button>
        <Button
          onClick={() => onGenerateSuggestion('category')}
          disabled={loading}
          variant="primary"
          size="sm"
          icon={<Tag size={14} />}
        >
          Kategorie analysieren
        </Button>
        <Button
          onClick={() => onGenerateSuggestion('priority')}
          disabled={loading}
          variant="warning"
          size="sm"
          icon={<ChevronDown size={14} />}
        >
          Prioritat bewerten
        </Button>
        <Button
          onClick={() => onGenerateSuggestion('response')}
          disabled={loading}
          variant="success"
          size="sm"
          icon={<MessageSquare size={14} />}
        >
          Antwort generieren
        </Button>
      </div>

      {loading && (
        <div className="flex items-center justify-center gap-2 py-4 text-purple-600 dark:text-purple-400">
          <Loader2 size={18} className="animate-spin" />
          <span className="text-sm">KI analysiert das Ticket...</span>
        </div>
      )}

      {error && (
        <div className="mb-3 p-2 bg-red-100 dark:bg-red-900/30 border border-red-300 dark:border-red-700 rounded text-sm text-red-700 dark:text-red-300">
          {error}
        </div>
      )}

      {suggestions.length === 0 && !loading && (
        <p className="text-sm text-purple-600 dark:text-purple-400 italic">
          Wahle eine der Optionen oben, um KI-basierte Vorschlage zu erhalten.
        </p>
      )}

      <div className="space-y-3 max-h-96 overflow-y-auto">
        {suggestions.map((suggestion) => {
          const config = typeConfig[suggestion.suggestionType] || typeConfig.solution;
          const TypeIcon = config.icon;

          return (
            <div
              key={suggestion.id}
              className="p-3 bg-white dark:bg-dark-100 rounded-lg border border-purple-100 dark:border-purple-800"
            >
              <div className="flex items-center gap-2 mb-2">
                <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium ${config.color}`}>
                  <TypeIcon size={12} />
                  {config.label}
                </span>
                {suggestion.confidence && (
                  <span className="text-xs text-gray-500 dark:text-dark-400">
                    {Math.round(suggestion.confidence * 100)}% Konfidenz
                  </span>
                )}
              </div>
              <div className="prose prose-sm dark:prose-invert max-w-none whitespace-pre-wrap">
                {suggestion.content}
              </div>

              {/* Action Buttons based on type */}
              <div className="flex flex-wrap items-center gap-2 mt-3 pt-2 border-t border-purple-100 dark:border-purple-800">
                {/* Type-specific actions */}
                {suggestion.suggestionType === 'response' && (
                  <Button
                    onClick={() => onApplyResponse(suggestion.content)}
                    variant="success"
                    size="sm"
                    icon={<ArrowRight size={12} />}
                    className="text-xs"
                  >
                    In Kommentar
                  </Button>
                )}
                {suggestion.suggestionType === 'priority' && (
                  <Button
                    onClick={() => onApplyPriority(suggestion.content)}
                    variant="warning"
                    size="sm"
                    icon={<ArrowRight size={12} />}
                    className="text-xs"
                  >
                    Ubernehmen
                  </Button>
                )}
                {suggestion.suggestionType === 'solution' && (
                  <Button
                    onClick={() => onApplySolution(suggestion.content)}
                    variant="secondary"
                    size="sm"
                    icon={<ArrowRight size={12} />}
                    className="text-xs bg-purple-100 hover:bg-purple-200 text-purple-700 dark:bg-purple-900/30 dark:hover:bg-purple-900/50 dark:text-purple-400"
                  >
                    Als Losung
                  </Button>
                )}

                {/* Copy button for all types */}
                <Button
                  onClick={() => onCopy(suggestion.content)}
                  variant="secondary"
                  size="sm"
                  icon={<Copy size={12} />}
                  className="text-xs"
                >
                  Kopieren
                </Button>

                <div className="flex-1" />

                {/* Feedback buttons */}
                <span className="text-xs text-gray-500 dark:text-dark-400">
                  {new Date(suggestion.createdAt).toLocaleString('de-DE')}
                </span>
                <IconButton
                  onClick={() => onFeedback(suggestion.id, true)}
                  icon={<ThumbsUp size={14} />}
                  variant="success"
                  size="sm"
                  tooltip="Hilfreich"
                />
                <IconButton
                  onClick={() => onFeedback(suggestion.id, false)}
                  icon={<ThumbsDown size={14} />}
                  variant="danger"
                  size="sm"
                  tooltip="Nicht hilfreich"
                />
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};
