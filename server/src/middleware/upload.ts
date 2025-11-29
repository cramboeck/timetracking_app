import multer from 'multer';
import path from 'path';
import crypto from 'crypto';
import fs from 'fs';

// Ensure uploads directory exists
const uploadsDir = process.env.UPLOADS_DIR || '/app/uploads';
if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir, { recursive: true });
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
    // Generate unique filename with original extension
    const uniqueId = crypto.randomUUID();
    const ext = path.extname(file.originalname);
    const safeName = `${uniqueId}${ext}`;
    cb(null, safeName);
  }
});

// File filter - allow common file types
const fileFilter = (req: Express.Request, file: Express.Multer.File, cb: multer.FileFilterCallback) => {
  const allowedMimeTypes = [
    // Images
    'image/jpeg',
    'image/png',
    'image/gif',
    'image/webp',
    'image/svg+xml',
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
  ];

  if (allowedMimeTypes.includes(file.mimetype)) {
    cb(null, true);
  } else {
    cb(new Error(`File type ${file.mimetype} is not allowed`));
  }
};

// Create multer instance
export const upload = multer({
  storage,
  fileFilter,
  limits: {
    fileSize: 10 * 1024 * 1024, // 10MB max file size
    files: 5, // Max 5 files per upload
  }
});

// Helper to get file URL
export function getFileUrl(filename: string): string {
  return `/api/uploads/tickets/${filename}`;
}

// Helper to delete file
export async function deleteFile(filename: string): Promise<void> {
  const filePath = path.join(uploadsDir, 'tickets', filename);
  if (fs.existsSync(filePath)) {
    fs.unlinkSync(filePath);
  }
}
