import { useRef } from 'react';
import { Paperclip, Download, Image, File, FileText, Trash2 } from 'lucide-react';
import { IconButton } from '../ui/Button';
import { TicketAttachment, formatFileSize } from './types';
import { getAbsoluteFileUrl } from '../../utils/fileUrls';

interface TicketAttachmentsProps {
  attachments: TicketAttachment[];
  uploadingFiles: boolean;
  onUploadFiles: (files: FileList) => Promise<void>;
  onDeleteAttachment: (attachmentId: string) => Promise<void>;
}

export const TicketAttachments = ({
  attachments,
  uploadingFiles,
  onUploadFiles,
  onDeleteAttachment,
}: TicketAttachmentsProps) => {
  const fileInputRef = useRef<HTMLInputElement>(null);

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
          Keine Anhange vorhanden
        </p>
      ) : (
        <div className="space-y-3">
          {/* Image attachments with preview */}
          {attachments.filter(a => a.mimeType?.startsWith('image/')).length > 0 && (
            <div>
              <p className="text-xs text-gray-500 dark:text-dark-400 mb-2">Bilder</p>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                {attachments.filter(a => a.mimeType?.startsWith('image/')).map((attachment) => (
                  <div key={attachment.id} className="relative group">
                    <a
                      href={getAbsoluteFileUrl(attachment.fileUrl)}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="block aspect-square rounded-lg overflow-hidden bg-gray-100 dark:bg-dark-200"
                    >
                      <img
                        src={getAbsoluteFileUrl(attachment.fileUrl)}
                        alt={attachment.filename}
                        className="w-full h-full object-cover hover:scale-105 transition-transform"
                      />
                    </a>
                    <div className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity rounded-lg flex items-center justify-center gap-2">
                      <a
                        href={getAbsoluteFileUrl(attachment.fileUrl)}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="p-2 bg-white/20 hover:bg-white/30 rounded-full text-white transition-colors"
                        title="Öffnen"
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
                          className="bg-white/20 hover:bg-red-500/50 text-white"
                        />
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
          {attachments.filter(a => !a.mimeType?.startsWith('image/')).length > 0 && (
            <div>
              {attachments.filter(a => a.mimeType?.startsWith('image/')).length > 0 && (
                <p className="text-xs text-gray-500 dark:text-dark-400 mb-2">Dokumente</p>
              )}
              <div className="space-y-2">
                {attachments.filter(a => !a.mimeType?.startsWith('image/')).map((attachment) => {
                  const FileIcon = getFileIcon(attachment.mimeType);
                  return (
                    <div
                      key={attachment.id}
                      className="flex items-center gap-3 p-3 bg-gray-50 dark:bg-dark-100 rounded-lg group"
                    >
                      <FileIcon size={20} className="text-gray-400 flex-shrink-0" />
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
    </div>
  );
};
