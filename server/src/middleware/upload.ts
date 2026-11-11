import multer from 'multer';
import path from 'path';
import crypto from 'crypto';
import fs from 'fs';

// Ensure uploads directory exists
const uploadsDir = process.env.UPLOADS_DIR || '/app/uploads';
if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir, { recursive: true });
}

// Gespeicherte Endung NIE aus dem Client-Dateinamen übernehmen: uploads/tickets
// wird statisch mit Content-Type aus der Endung serviert — eine als text/plain
// deklarierte "x.html" liefe sonst als aktives HTML auf der App-Origin (Stored
// XSS, auch von extern via Mail-Anhang). Endung kommt deshalb aus dem
// validierten MIME-Type; alles Unbekannte wird ".bin".
const EXT_BY_MIME: Record<string, string> = {
  'image/jpeg': '.jpg',
  'image/png': '.png',
  'image/gif': '.gif',
  'image/webp': '.webp',
  'application/pdf': '.pdf',
  'application/msword': '.doc',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document': '.docx',
  'application/vnd.ms-excel': '.xls',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': '.xlsx',
  'application/vnd.ms-powerpoint': '.ppt',
  'application/vnd.openxmlformats-officedocument.presentationml.presentation': '.pptx',
  'text/plain': '.txt',
  'text/csv': '.csv',
  'application/zip': '.zip',
  'application/x-rar-compressed': '.rar',
  'application/x-7z-compressed': '.7z',
  'message/rfc822': '.eml',
  'application/vnd.ms-outlook': '.msg',
};

// Endungen, die der Browser inline rendern darf (Bild-Preview, PDF-iframe).
// Alles andere liefert index.ts mit Content-Disposition: attachment aus.
export const INLINE_SAFE_EXTENSIONS = new Set(['.jpg', '.jpeg', '.png', '.gif', '.webp', '.pdf']);

// Für Dateien, die nicht durch den Multer-Filter laufen (E-Mail-Anhänge):
// nur diese Endungen bleiben erhalten, alles andere (.html, .svg, .xml, …)
// wird zu ".bin" — niemals aktiver Inhalt auf der App-Origin.
const SAFE_STORED_EXTENSIONS = new Set([
  ...INLINE_SAFE_EXTENSIONS,
  '.doc', '.docx', '.xls', '.xlsx', '.ppt', '.pptx',
  '.txt', '.csv', '.zip', '.rar', '.7z', '.eml', '.msg',
]);

function sanitizeStoredExtension(originalName: string): string {
  const ext = path.extname(originalName).toLowerCase().slice(0, 20);
  return SAFE_STORED_EXTENSIONS.has(ext) ? ext : '.bin';
}

// Configure storage
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    // Create subdirectory for tickets
    const ticketUploadsDir = path.join(uploadsDir, 'tickets');
    if (!fs.existsSync(ticketUploadsDir)) {
      fs.mkdirSync(ticketUploadsDir, { recursive: true });
    }
    cb(null, ticketUploadsDir);
  },
  filename: (req, file, cb) => {
    // Unique Dateiname; Endung aus dem (whitelist-geprüften) MIME-Type —
    // der Client-Dateiname ist Angreifer-kontrolliert
    const uniqueId = crypto.randomUUID();
    const ext = EXT_BY_MIME[file.mimetype] ?? sanitizeStoredExtension(file.originalname);
    const safeName = `${uniqueId}${ext}`;
    cb(null, safeName);
  }
});

// File filter - allow common file types.
// image/svg+xml ist bewusst NICHT erlaubt: SVG kann Script enthalten und
// würde vom Static-Serving als aktiver Inhalt ausgeliefert.
const fileFilter = (req: Express.Request, file: Express.Multer.File, cb: multer.FileFilterCallback) => {
  const allowedMimeTypes = [
    // Images
    'image/jpeg',
    'image/png',
    'image/gif',
    'image/webp',
    // Documents
    'application/pdf',
    'application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/vnd.ms-excel',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'application/vnd.ms-powerpoint',
    'application/vnd.openxmlformats-officedocument.presentationml.presentation',
    // Text
    'text/plain',
    'text/csv',
    // Archives
    'application/zip',
    'application/x-rar-compressed',
    'application/x-7z-compressed',
    // Email files
    'message/rfc822',           // .eml files
    'application/vnd.ms-outlook', // .msg files
  ];

  if (allowedMimeTypes.includes(file.mimetype)) {
    cb(null, true);
  } else {
    cb(new Error(`Dateityp ${file.mimetype} ist nicht erlaubt`));
  }
};

// Create multer instance
export const upload = multer({
  storage,
  fileFilter,
  limits: {
    fileSize: 10 * 1024 * 1024, // 10MB max file size
    files: 10, // Must match the route's upload.array('files', 10)
  }
});

// Helper to get file URL
export function getFileUrl(filename: string): string {
  return `/api/uploads/tickets/${filename}`;
}

// Helper to delete file. Accepts either a bare filename or a stored file URL
// (`/api/uploads/tickets/<name>`) — DB rows store the URL, so basename() keeps
// the delete working for both shapes instead of silently missing the file.
export async function deleteFile(filenameOrUrl: string): Promise<void> {
  const filename = path.basename(filenameOrUrl);
  if (!filename) return;
  const filePath = path.join(uploadsDir, 'tickets', filename);
  if (fs.existsSync(filePath)) {
    fs.unlinkSync(filePath);
  }
}

// Persist an in-memory buffer (e.g. an email attachment fetched from
// Microsoft Graph) into the tickets upload directory, mirroring the multer
// naming scheme (random UUID + original extension).
export function saveTicketFileFromBuffer(
  buffer: Buffer,
  originalName: string
): { storedFilename: string; fileUrl: string } {
  const ticketUploadsDir = path.join(uploadsDir, 'tickets');
  if (!fs.existsSync(ticketUploadsDir)) {
    fs.mkdirSync(ticketUploadsDir, { recursive: true });
  }
  // E-Mail-Anhänge kommen von EXTERN und laufen nicht durch den Multer-Filter:
  // Endung strikt gegen die Whitelist, sonst .bin (kein .html/.svg auf Origin)
  const ext = sanitizeStoredExtension(originalName);
  const storedFilename = `${crypto.randomUUID()}${ext}`;
  fs.writeFileSync(path.join(ticketUploadsDir, storedFilename), buffer);
  return { storedFilename, fileUrl: getFileUrl(storedFilename) };
}
