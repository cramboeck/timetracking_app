import { useEffect, useRef, useState } from 'react';
import { Paperclip, Download, Image, File, FileText, Trash2, X, ChevronLeft, ChevronRight, ExternalLink } from 'lucide-react';
import { IconButton } from '../ui/Button';
import { TicketAttachment, formatFileSize } from './types';
import { getAbsoluteFileUrl } from '../../utils/fileUrls';

interface TicketAttachmentsProps {
  attachments: TicketAttachment[];
  uploadingFiles: boolean;
  onUploadFiles: (files: FileList) => Promise<void>;
  onDeleteAttachment: (attachmentId: string) => Promise<void>;
}

// Vorschau-Zustand: Bild-Lightbox (mit Index zum Blättern) oder PDF-Ansicht
type PreviewState =
  | { kind: 'image'; index: number }
  | { kind: 'pdf'; attachment: TicketAttachment }
  | null;

export const TicketAttachments = ({
  attachments,
  uploadingFiles,
  onUploadFiles,
  onDeleteAttachment,
}: TicketAttachmentsProps) => {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [preview, setPreview] = useState<PreviewState>(null);

  const imageAttachments = attachments.filter(a => a.mimeType?.startsWith('image/'));
  const otherAttachments = attachments.filter(a => !a.mimeType?.startsWith('image/'));

  const getFileIcon = (mimeType: string) => {
    if (mimeType?.startsWith('image/')) return Image;
    if (mimeType === 'application/pdf') return FileText;
    return File;
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;

    await onUploadFiles(files);

    // Reset file input
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  // Lightbox-Navigation: Pfeiltasten blättern, Esc schließt
  useEffect(() => {
    if (!preview) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setPreview(null);
      } else if (preview.kind === 'image' && imageAttachments.length > 1) {
        if (e.key === 'ArrowRight') {
          setPreview({ kind: 'image', index: (preview.index + 1) % imageAttachments.length });
        } else if (e.key === 'ArrowLeft') {
          setPreview({ kind: 'image', index: (preview.index - 1 + imageAttachments.length) % imageAttachments.length });
        }
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [preview, imageAttachments.length]);

  const previewImage = preview?.kind === 'image' ? imageAttachments[preview.index] : null;

  return (
    <div>
      <div className="flex items-center justify-between mb-2">
        <h2 className="text-sm font-medium text-gray-700 dark:text-dark-500">
          Anhänge ({attachments.length})
        </h2>
        <label className="flex items-center gap-2 px-3 py-1.5 text-sm font-medium text-accent-primary bg-accent-primary/10 hover:bg-accent-primary/20 rounded-lg cursor-pointer transition-colors">
          <Paperclip size={16} />
          {uploadingFiles ? 'Lädt...' : 'Datei hinzufügen'}
          <input
            ref={fileInputRef}
            type="file"
            multiple
            onChange={handleFileUpload}
            disabled={uploadingFiles}
            className="hidden"
            accept="image/*,.pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.txt,.csv,.zip,.rar,.7z,.eml,.msg"
          />
        </label>
      </div>

      {attachments.length === 0 ? (
        <p className="text-sm text-gray-500 dark:text-dark-400 text-center py-4 bg-gray-50 dark:bg-dark-100 rounded-lg">
          Keine Anhänge vorhanden
        </p>
      ) : (
        <div className="space-y-3">
          {/* Image attachments with preview */}
          {imageAttachments.length > 0 && (
            <div>
              <p className="text-xs text-gray-500 dark:text-dark-400 mb-2">Bilder</p>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                {imageAttachments.map((attachment, imageIndex) => (
                  <div key={attachment.id} className="relative group">
                    <button
                      type="button"
                      onClick={() => setPreview({ kind: 'image', index: imageIndex })}
                      className="block w-full aspect-square rounded-lg overflow-hidden bg-gray-100 dark:bg-dark-200 cursor-zoom-in"
                    >
                      <img
                        src={getAbsoluteFileUrl(attachment.fileUrl)}
                        alt={attachment.filename}
                        className="w-full h-full object-cover hover:scale-105 transition-transform"
                      />
                    </button>
                    <div className="absolute inset-0 pointer-events-none bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity rounded-lg flex items-center justify-center gap-2">
                      <a
                        href={getAbsoluteFileUrl(attachment.fileUrl)}
                        target="_blank"
                        rel="noopener noreferrer"
                        onClick={(e) => e.stopPropagation()}
                        className="pointer-events-auto p-2 bg-white/20 hover:bg-white/30 rounded-full text-white transition-colors"
                        title="In neuem Tab öffnen"
                      >
                        <Download size={16} />
                      </a>
                      {attachment.source !== 'email' && (
                        <span className="pointer-events-auto">
                          <IconButton
                            onClick={() => onDeleteAttachment(attachment.id)}
                            icon={<Trash2 size={16} />}
                            variant="danger"
                            size="sm"
                            tooltip="Löschen"
                            className="bg-white/20 hover:bg-red-500/50 text-white"
                          />
                        </span>
                      )}
                    </div>
                    <p className="mt-1 text-xs text-gray-500 dark:text-dark-400 truncate">
                      {attachment.source === 'email' && (
                        <span className="mr-1 px-1 py-px text-[10px] bg-accent-primary/10 text-accent-primary rounded align-middle">E-Mail</span>
                      )}
                      {attachment.filename}
                    </p>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Other file attachments */}
          {otherAttachments.length > 0 && (
            <div>
              {imageAttachments.length > 0 && (
                <p className="text-xs text-gray-500 dark:text-dark-400 mb-2">Dokumente</p>
              )}
              <div className="space-y-2">
                {otherAttachments.map((attachment) => {
                  const FileIcon = getFileIcon(attachment.mimeType);
                  const isPdf = attachment.mimeType === 'application/pdf';
                  return (
                    <div
                      key={attachment.id}
                      className="flex items-center gap-3 p-3 bg-gray-50 dark:bg-dark-100 rounded-lg group"
                    >
                      <FileIcon size={20} className="text-gray-400 flex-shrink-0" />
                      {/* PDFs öffnen die eingebettete Vorschau, andere Typen den Download */}
                      {isPdf ? (
                        <button
                          type="button"
                          onClick={() => setPreview({ kind: 'pdf', attachment })}
                          className="flex-1 min-w-0 text-left"
                          title="Vorschau öffnen"
                        >
                          <p className="text-sm font-medium text-gray-900 dark:text-white truncate hover:text-accent-primary transition-colors">
                            {attachment.source === 'email' && (
                              <span className="mr-1.5 px-1 py-px text-[10px] bg-accent-primary/10 text-accent-primary rounded align-middle">E-Mail</span>
                            )}
                            {attachment.filename}
                          </p>
                          <p className="text-xs text-gray-500 dark:text-dark-400">
                            {formatFileSize(attachment.fileSize)} {attachment.uploadedByName && `• ${attachment.uploadedByName}`}
                          </p>
                        </button>
                      ) : (
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium text-gray-900 dark:text-white truncate">
                            {attachment.source === 'email' && (
                              <span className="mr-1.5 px-1 py-px text-[10px] bg-accent-primary/10 text-accent-primary rounded align-middle">E-Mail</span>
                            )}
                            {attachment.filename}
                          </p>
                          <p className="text-xs text-gray-500 dark:text-dark-400">
                            {formatFileSize(attachment.fileSize)} {attachment.uploadedByName && `• ${attachment.uploadedByName}`}
                          </p>
                        </div>
                      )}
                      <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                        <a
                          href={getAbsoluteFileUrl(attachment.fileUrl)}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="p-1.5 text-gray-500 hover:text-accent-primary hover:bg-accent-primary/10 rounded transition-colors"
                          title="Herunterladen"
                        >
                          <Download size={16} />
                        </a>
                        {attachment.source !== 'email' && (
                          <IconButton
                            onClick={() => onDeleteAttachment(attachment.id)}
                            icon={<Trash2 size={16} />}
                            variant="danger"
                            size="sm"
                            tooltip="Löschen"
                          />
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Bild-Lightbox: Vollbild-Overlay mit Blättern (Pfeiltasten/Buttons) */}
      {previewImage && preview?.kind === 'image' && (
        <div
          className="fixed inset-0 z-[90] bg-black/90 flex flex-col"
          onClick={() => setPreview(null)}
        >
          <div className="flex items-center justify-between px-4 py-3 text-white" onClick={(e) => e.stopPropagation()}>
            <p className="text-sm font-medium truncate">
              {previewImage.filename}
              {imageAttachments.length > 1 && (
                <span className="ml-2 text-white/60 tabular-nums">
                  {preview.index + 1} / {imageAttachments.length}
                </span>
              )}
            </p>
            <div className="flex items-center gap-1">
              <a
                href={getAbsoluteFileUrl(previewImage.fileUrl)}
                target="_blank"
                rel="noopener noreferrer"
                className="p-2 hover:bg-white/10 rounded-lg transition-colors"
                title="In neuem Tab öffnen"
              >
                <ExternalLink size={18} />
              </a>
              <button
                type="button"
                onClick={() => setPreview(null)}
                className="p-2 hover:bg-white/10 rounded-lg transition-colors"
                aria-label="Vorschau schließen"
              >
                <X size={20} />
              </button>
            </div>
          </div>
          <div className="flex-1 flex items-center justify-center min-h-0 px-4 pb-4 gap-2">
            {imageAttachments.length > 1 && (
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  setPreview({ kind: 'image', index: (preview.index - 1 + imageAttachments.length) % imageAttachments.length });
                }}
                className="p-2 text-white/70 hover:text-white hover:bg-white/10 rounded-full transition-colors"
                aria-label="Vorheriges Bild"
              >
                <ChevronLeft size={28} />
              </button>
            )}
            <img
              src={getAbsoluteFileUrl(previewImage.fileUrl)}
              alt={previewImage.filename}
              className="max-h-full max-w-full object-contain rounded-lg select-none"
              onClick={(e) => e.stopPropagation()}
            />
            {imageAttachments.length > 1 && (
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  setPreview({ kind: 'image', index: (preview.index + 1) % imageAttachments.length });
                }}
                className="p-2 text-white/70 hover:text-white hover:bg-white/10 rounded-full transition-colors"
                aria-label="Nächstes Bild"
              >
                <ChevronRight size={28} />
              </button>
            )}
          </div>
        </div>
      )}

      {/* PDF-Vorschau: eingebetteter Viewer im Overlay */}
      {preview?.kind === 'pdf' && (
        <div
          className="fixed inset-0 z-[90] bg-black/80 flex flex-col p-4 sm:p-8"
          onClick={() => setPreview(null)}
        >
          <div
            className="flex-1 min-h-0 flex flex-col bg-white dark:bg-dark-100 rounded-xl overflow-hidden shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between px-4 py-2.5 border-b border-gray-200 dark:border-dark-border">
              <p className="text-sm font-medium text-gray-900 dark:text-white truncate">
                {preview.attachment.filename}
              </p>
              <div className="flex items-center gap-1">
                <a
                  href={getAbsoluteFileUrl(preview.attachment.fileUrl)}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="p-2 text-gray-500 dark:text-dark-400 hover:text-accent-primary hover:bg-accent-primary/10 rounded-lg transition-colors"
                  title="In neuem Tab öffnen"
                >
                  <ExternalLink size={18} />
                </a>
                <button
                  type="button"
                  onClick={() => setPreview(null)}
                  className="p-2 text-gray-500 dark:text-dark-400 hover:text-gray-900 dark:hover:text-white hover:bg-gray-100 dark:hover:bg-dark-200 rounded-lg transition-colors"
                  aria-label="Vorschau schließen"
                >
                  <X size={20} />
                </button>
              </div>
            </div>
            <iframe
              src={getAbsoluteFileUrl(preview.attachment.fileUrl)}
              title={`PDF-Vorschau: ${preview.attachment.filename}`}
              className="flex-1 w-full border-0"
            />
          </div>
        </div>
      )}
    </div>
  );
};
