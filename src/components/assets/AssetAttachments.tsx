import { useEffect, useRef, useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Paperclip, Upload, Trash2, FileText, Download, X } from 'lucide-react';
import { useConfirm, useToast } from '../../contexts/UIContext';
import { assetToolsApi, type AssetAttachment } from '../../services/api';

/**
 * Anhänge am Gerät (AS-7): Fotos vom Typenschild, Lieferschein, Handbuch,
 * Konfig-Export. Download läuft authentifiziert (Blob), nie über eine offene URL.
 */
const ACCEPT = '.jpg,.jpeg,.png,.gif,.webp,.pdf,.txt,.csv,.doc,.docx,.xls,.xlsx,.ppt,.pptx';
const MAX_BYTES = 15 * 1024 * 1024;

const fmtSize = (b: number) => b >= 1024 * 1024 ? `${(b / 1024 / 1024).toFixed(1)} MB` : `${Math.max(1, Math.round(b / 1024))} KB`;
const isImage = (m: string) => /^image\/(jpeg|png|gif|webp)$/.test(m);

const Thumb = ({ assetId, att, onOpen }: { assetId: string; att: AssetAttachment; onOpen: (url: string) => void }) => {
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => {
    let u: string | null = null;
    let cancelled = false;
    assetToolsApi.attachmentBlob(assetId, att.id)
      .then(b => { if (!cancelled) { u = URL.createObjectURL(b); setUrl(u); } })
      .catch(() => undefined);
    return () => { cancelled = true; if (u) URL.revokeObjectURL(u); };
  }, [assetId, att.id]);
  return url ? (
    <button type="button" onClick={() => onOpen(url)} className="w-10 h-10 rounded-lg overflow-hidden flex-shrink-0 bg-gray-100 dark:bg-dark-200">
      <img src={url} alt="" className="w-full h-full object-cover" />
    </button>
  ) : <span className="w-10 h-10 rounded-lg bg-gray-100 dark:bg-dark-200 flex-shrink-0" />;
};

export const AssetAttachments = ({ assetId, attachments }: { assetId: string; attachments: AssetAttachment[] }) => {
  const showToast = useToast();
  const confirm = useConfirm();
  const queryClient = useQueryClient();
  const fileRef = useRef<HTMLInputElement>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const refresh = () => queryClient.invalidateQueries({ queryKey: ['assets', 'detail', assetId] });

  const upload = useMutation({
    mutationFn: async (files: File[]) => {
      for (const f of files) await assetToolsApi.uploadAttachment(assetId, f);
    },
    onSuccess: () => { refresh(); showToast('Anhang gespeichert', 'success'); },
    onError: (e: Error) => { refresh(); showToast(e.message || 'Upload fehlgeschlagen', 'error'); },
  });
  const remove = useMutation({
    mutationFn: async (attId: string) => assetToolsApi.deleteAttachment(assetId, attId),
    onSuccess: refresh,
    onError: () => showToast('Anhang konnte nicht gelöscht werden', 'error'),
  });

  const pick = (list: FileList | null) => {
    const files = Array.from(list ?? []);
    if (fileRef.current) fileRef.current.value = '';
    const tooBig = files.find(f => f.size > MAX_BYTES);
    if (tooBig) { showToast(`„${tooBig.name}“ ist größer als 15 MB`, 'warning'); return; }
    if (files.length) upload.mutate(files);
  };

  const download = async (att: AssetAttachment) => {
    try {
      const blob = await assetToolsApi.attachmentBlob(assetId, att.id);
      const url = URL.createObjectURL(blob);
      if (att.mimeType === 'application/pdf') {
        window.open(url, '_blank');
      } else {
        const a = document.createElement('a');
        a.href = url; a.download = att.originalName; a.click();
      }
      setTimeout(() => URL.revokeObjectURL(url), 60_000);
    } catch {
      showToast('Anhang konnte nicht geladen werden', 'error');
    }
  };

  const handleDelete = async (att: AssetAttachment) => {
    const ok = await confirm({ title: 'Anhang löschen?', message: `„${att.originalName}“ wird entfernt.`, confirmText: 'Löschen', variant: 'danger' });
    if (ok) remove.mutate(att.id);
  };

  return (
    <div>
      <div className="flex items-center justify-between gap-2 mb-2">
        <p className="flex items-center gap-1.5 text-sm font-medium text-gray-900 dark:text-white">
          <Paperclip size={15} className="text-gray-400" /> Anhänge
        </p>
        <button type="button" onClick={() => fileRef.current?.click()} disabled={upload.isPending}
          className="inline-flex items-center gap-1.5 text-sm text-accent-primary hover:underline disabled:opacity-50">
          <Upload size={14} /> {upload.isPending ? 'Lädt hoch…' : 'Hochladen'}
        </button>
        <input ref={fileRef} type="file" multiple accept={ACCEPT} className="hidden" aria-label="Anhang hochladen"
          onChange={e => pick(e.target.files)} />
      </div>
      {attachments.length === 0 ? (
        <p className="text-sm text-gray-500 dark:text-dark-400">Fotos vom Typenschild, Lieferschein, Handbuch oder Konfiguration hier ablegen.</p>
      ) : (
        <ul className="divide-y divide-gray-100 dark:divide-dark-border rounded-xl border border-gray-200 dark:border-dark-border">
          {attachments.map(att => (
            <li key={att.id} className="flex items-center gap-3 px-3 py-2">
              {isImage(att.mimeType)
                ? <Thumb assetId={assetId} att={att} onOpen={setPreview} />
                : <span className="w-10 h-10 rounded-lg bg-gray-100 dark:bg-dark-200 flex items-center justify-center flex-shrink-0 text-gray-500 dark:text-dark-400"><FileText size={18} /></span>}
              <div className="min-w-0 flex-1">
                <p className="text-sm text-gray-900 dark:text-white truncate">{att.originalName}</p>
                <p className="text-xs text-gray-500 dark:text-dark-400">{fmtSize(att.sizeBytes)} · {new Date(att.createdAt).toLocaleDateString('de-DE')}</p>
              </div>
              <button type="button" onClick={() => download(att)} title="Öffnen / herunterladen"
                className="p-2 rounded-lg text-gray-500 hover:text-accent-primary hover:bg-gray-100 dark:hover:bg-dark-200"><Download size={16} /></button>
              <button type="button" onClick={() => handleDelete(att)} title="Löschen"
                className="p-2 rounded-lg text-gray-500 hover:text-red-600 hover:bg-gray-100 dark:hover:bg-dark-200"><Trash2 size={16} /></button>
            </li>
          ))}
        </ul>
      )}
      {preview && (
        <div className="fixed inset-0 z-[70] bg-black/80 flex items-center justify-center p-4" onClick={() => setPreview(null)}>
          <button type="button" className="absolute top-4 right-4 text-white/80 hover:text-white" onClick={() => setPreview(null)} aria-label="Schließen"><X size={26} /></button>
          <img src={preview} alt="" className="max-w-full max-h-full rounded-lg" />
        </div>
      )}
    </div>
  );
};
