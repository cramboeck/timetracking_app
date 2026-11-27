import { Bot } from 'lucide-react';

/** Kennzeichnet Einträge/Kommentare, die über einen API-Zugang (KI-Agent/MCP) entstanden sind. */
export const AgentBadge = ({ name, compact = false }: { name?: string | null; compact?: boolean }) => (
  <span title={name ? `Über KI-Agent erfasst (Zugang „${name}“)` : 'Über KI-Agent erfasst'}
    className="inline-flex items-center gap-1 text-xs font-medium px-1.5 py-0.5 rounded flex-shrink-0 bg-purple-50 dark:bg-purple-900/20 text-purple-700 dark:text-purple-300">
    <Bot size={12} />{!compact && <span>Agent</span>}
  </span>
);
