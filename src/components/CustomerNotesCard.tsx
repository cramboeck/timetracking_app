import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { StickyNote, Plus, Pencil, Trash2, Bot } from 'lucide-react';
import { Button } from './ui/Button';
import { useConfirm, useToast } from '../contexts/UIContext';
import { agentApi, NOTE_CATEGORY_LABELS, type CustomerNote, type NoteCategory } from '../services/api';

/**
 * Kundengedächtnis (Agenten-Programm Phase B): Absprachen, die Mensch UND
 * KI-Agent vor jeder Arbeit für diesen Kunden kennen sollen.
 */
const field = 'w-full px-3 py-2 rounded-xl bg-gray-50 dark:bg-dark-200 border border-gray-200 dark:border-dark-border text-gray-900 dark:text-white text-sm focus:outline-none focus:bg-white dark:focus:bg-dark-100 focus:border-accent-primary focus:ring-4 focus:ring-accent-primary/15';

const CATEGORY_STYLE: Record<NoteCategory, string> = {
  billing: 'bg-amber-50 dark:bg-amber-900/20 text-amber-700 dark:text-amber-400',
  technical: 'bg-blue-50 dark:bg-blue-900/20 text-blue-700 dark:text-blue-400',
  contact: 'bg-green-50 dark:bg-green-900/20 text-green-700 dark:text-green-400',
  general: 'bg-gray-100 dark:bg-dark-200 text-gray-700 dark:text-dark-500',
};

export const CustomerNotesCard = ({ customerId }: { customerId: string }) => {
  const showToast = useToast();
  const confirm = useConfirm();
  const queryClient = useQueryClient();
  const [editing, setEditing] = useState<string | 'new' | null>(null);
  const [category, setCategory] = useState<NoteCategory>('general');
  const [content, setContent] = useState('');

  const { data: notes = [], isLoading } = useQuery({
    queryKey: ['customer-notes', customerId],
    queryFn: async () => (await agentApi.notes(customerId)).data ?? [],
  });
  const refresh = () => queryClient.invalidateQueries({ queryKey: ['customer-notes', customerId] });

  const save = useMutation({
    mutationFn: async () => editing === 'new'
      ? agentApi.createNote(customerId, { category, content: content.trim() })
      : agentApi.updateNote(String(editing), { category, content: content.trim() }),
    onSuccess: () => { refresh(); setEditing(null); setContent(''); },
    onError: () => showToast('Absprache konnte nicht gespeichert werden', 'error'),
  });
  const remove = useMutation({
    mutationFn: async (id: string) => agentApi.deleteNote(id),
    onSuccess: refresh,
    onError: () => showToast('Absprache konnte nicht gelöscht werden', 'error'),
  });

  const startEdit = (n?: CustomerNote) => {
    setEditing(n ? n.id : 'new');
    setCategory(n?.category ?? 'general');
    setContent(n?.content ?? '');
  };

  const editor = (
    <div className="space-y-2 rounded-xl bg-gray-50 dark:bg-dark-200 p-3">
      <div className="flex flex-wrap gap-1.5">
        {(Object.keys(NOTE_CATEGORY_LABELS) as NoteCategory[]).map(c => (
          <button key={c} type="button" onClick={() => setCategory(c)}
            className={`text-xs rounded-full px-2.5 py-1 border ${category === c ? 'border-accent-primary text-accent-primary bg-white dark:bg-dark-100' : 'border-transparent text-gray-600 dark:text-dark-400'}`}>
            {NOTE_CATEGORY_LABELS[c]}
          </button>
        ))}
      </div>
      <textarea className={field} rows={3} maxLength={2000} value={content} onChange={e => setContent(e.target.value)}
        placeholder="z.B. Fahrtzeit wird nicht berechnet · Ansprechpartner IT ist Frau Huber · Wartung nur freitags" aria-label="Absprache" />
      <div className="flex justify-end gap-2">
        <Button size="sm" variant="ghost" onClick={() => setEditing(null)}>Abbrechen</Button>
        <Button size="sm" variant="primary" onClick={() => save.mutate()} disabled={!content.trim() || save.isPending}>Speichern</Button>
      </div>
    </div>
  );

  return (
    <div className="bg-white dark:bg-dark-100 rounded-xl border border-gray-200 dark:border-dark-border p-4">
      <div className="flex items-center justify-between mb-3">
        <h3 className="font-semibold text-gray-900 dark:text-white flex items-center gap-2">
          <StickyNote size={18} className="text-accent-primary" /> Absprachen & Notizen
        </h3>
        {editing === null && (
          <button type="button" onClick={() => startEdit()} className="inline-flex items-center gap-1 text-sm text-accent-primary hover:underline">
            <Plus size={14} /> Neu
          </button>
        )}
      </div>
      <div className="space-y-2">
        {editing === 'new' && editor}
        {isLoading ? (
          <p className="text-sm text-gray-500 dark:text-dark-400">Lädt…</p>
        ) : notes.length === 0 && editing !== 'new' ? (
          <p className="text-sm text-gray-500 dark:text-dark-400">
            Noch keine Absprachen. Was hier steht, berücksichtigt auch der KI-Agent – z.B. Abrechnungsregeln oder feste Ansprechpartner.
          </p>
        ) : notes.map(n => editing === n.id ? <div key={n.id}>{editor}</div> : (
          <div key={n.id} className="group flex items-start gap-2">
            <span className={`mt-0.5 text-[11px] rounded-md px-1.5 py-0.5 flex-shrink-0 ${CATEGORY_STYLE[n.category]}`}>{NOTE_CATEGORY_LABELS[n.category]}</span>
            <div className="min-w-0 flex-1">
              <p className="text-sm text-gray-900 dark:text-white whitespace-pre-wrap break-words">{n.content}</p>
              <p className="text-[11px] text-gray-400 dark:text-dark-400 flex items-center gap-1">
                {n.viaAgent && <Bot size={11} className="text-purple-500" />}
                {n.authorName ?? '—'} · {new Date(n.updatedAt).toLocaleDateString('de-DE')}
              </p>
            </div>
            <div className="flex gap-0.5 [@media(hover:hover)]:opacity-0 group-hover:opacity-100">
              <button type="button" onClick={() => startEdit(n)} title="Bearbeiten" className="p-1.5 rounded-lg text-gray-500 hover:text-accent-primary hover:bg-gray-100 dark:hover:bg-dark-200"><Pencil size={14} /></button>
              <button type="button" title="Löschen" onClick={async () => {
                const ok = await confirm({ title: 'Absprache löschen?', message: n.content.slice(0, 120), confirmText: 'Löschen', variant: 'danger' });
                if (ok) remove.mutate(n.id);
              }} className="p-1.5 rounded-lg text-gray-500 hover:text-red-600 hover:bg-gray-100 dark:hover:bg-dark-200"><Trash2 size={14} /></button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};
