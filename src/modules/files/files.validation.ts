import path from 'path';
import multer from 'multer';
import { z } from 'zod';
import { Request, Response, NextFunction } from 'express';
import { env } from '../../config/env';
import { AppError } from '../../utils/api-response';
import { FileAccessLevel } from '@prisma/client';

// ============================================================================
// CONFIGURABLE ALLOWED MIME TYPES & EXTENSIONS
// ============================================================================

export const ALLOWED_MIME_TYPES = new Set<string>([
  // Documents
  'application/pdf',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'text/plain',
  'text/csv',
  // Spreadsheets & Presentations
  'application/vnd.ms-excel',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/vnd.ms-powerpoint',
  'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  // Images
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/gif',
  'image/svg+xml',
  // Archives
  'application/zip',
  'application/x-zip-compressed',
]);

export const DANGEROUS_EXTENSIONS = new Set<string>([
  '.php', '.phtml', '.php3', '.php4', '.php5', '.phps', '.phar',
  '.exe', '.dll', '.so', '.com', '.bat', '.cmd', '.ps1', '.sh', '.bash',
  '.js', '.mjs', '.cjs', '.vbs', '.vbe', '.wsf', '.wsh',
  '.htaccess', '.htpasswd', '.ini', '.env', '.config'
]);

// Inspect magic bytes for common binary formats to prevent MIME-spoofing
export function validateMagicBytes(buffer: Buffer, mimeType: string): boolean {
  if (!buffer || buffer.length < 4) return true;

  // PDF magic bytes: %PDF- (0x25, 0x50, 0x44, 0x46)
  if (mimeType === 'application/pdf') {
    return buffer[0] === 0x25 && buffer[1] === 0x50 && buffer[2] === 0x44 && buffer[3] === 0x46;
  }

  // PNG magic bytes: 0x89 0x50 0x4E 0x47
  if (mimeType === 'image/png') {
    return buffer[0] === 0x89 && buffer[1] === 0x50 && buffer[2] === 0x4E && buffer[3] === 0x47;
  }

  // JPEG magic bytes: 0xFF 0xD8 0xFF
  if (mimeType === 'image/jpeg') {
    return buffer[0] === 0xFF && buffer[1] === 0xD8 && buffer[2] === 0xFF;
  }

  // GIF magic bytes: GIF8 (0x47 0x49 0x46 0x38)
  if (mimeType === 'image/gif') {
    return buffer[0] === 0x47 && buffer[1] === 0x49 && buffer[2] === 0x46 && buffer[3] === 0x38;
  }

  // ZIP / DOCX / XLSX / PPTX magic bytes: PK.. (0x50 0x4B 0x03 0x04)
  if (
    mimeType === 'application/zip' ||
    mimeType === 'application/x-zip-compressed' ||
    mimeType.includes('openxmlformats')
  ) {
    return buffer[0] === 0x50 && buffer[1] === 0x4B;
  }

  return true;
}

// ============================================================================
// MULTER IN-MEMORY UPLOAD CONFIGURATION
// ============================================================================

const maxFileSize = (env.MAX_UPLOAD_SIZE_MB || 25) * 1024 * 1024;

const storage = multer.memoryStorage();

export const uploadMiddleware = multer({
  storage,
  limits: {
    fileSize: maxFileSize,
    files: 1,
  },
  fileFilter: (_req, file, cb) => {
    // 1. Sanitize original filename and check path traversal
    if (file.originalname.includes('..') || file.originalname.includes('/') || file.originalname.includes('\\')) {
      return cb(new AppError('Invalid filename: path traversal characters prohibited', 400));
    }

    // 2. Validate file extension
    const ext = path.extname(file.originalname).toLowerCase();
    if (DANGEROUS_EXTENSIONS.has(ext)) {
      return cb(new AppError(`Upload blocked: executable or script extension "${ext}" is not allowed`, 400));
    }

    // 3. Validate MIME type
    if (!ALLOWED_MIME_TYPES.has(file.mimetype)) {
      return cb(new AppError(`Unsupported file format: ${file.mimetype}. Allowed types include PDF, Word, Excel, CSV, text, images, and ZIP.`, 400));
    }

    cb(null, true);
  },
});

export function handleMulterError(err: any, _req: Request, _res: Response, next: NextFunction) {
  if (err instanceof multer.MulterError) {
    if (err.code === 'LIMIT_FILE_SIZE') {
      return next(new AppError(`File exceeds maximum size limit of ${env.MAX_UPLOAD_SIZE_MB || 25} MB`, 400));
    }
    return next(new AppError(`Upload error: ${err.message}`, 400));
  }
  return next(err);
}

// ============================================================================
// ZOD VALIDATION SCHEMAS
// ============================================================================

export const fileUploadBodySchema = z.object({
  name: z.string().trim().min(1).max(255).optional(),
  folderId: z.string().uuid('Invalid folder ID format').optional().nullable(),
  relatedType: z.enum(['CLIENT', 'PROJECT', 'TASK', 'EMPLOYEE']).optional(),
  relatedId: z.string().uuid('Invalid related ID format').optional(),
  accessLevel: z.nativeEnum(FileAccessLevel).optional().default(FileAccessLevel.PRIVATE),
  starred: z.union([z.boolean(), z.string().transform((val) => val === 'true')]).optional(),
});

export const updateFileSchema = z.object({
  name: z.string().trim().min(1, 'Display name cannot be empty').max(255).optional(),
  folderId: z.string().uuid('Invalid folder ID').nullable().optional(),
  starred: z.boolean().optional(),
  accessLevel: z.nativeEnum(FileAccessLevel).optional(),
  relatedType: z.enum(['CLIENT', 'PROJECT', 'TASK', 'EMPLOYEE']).nullable().optional(),
  relatedId: z.string().uuid('Invalid related ID format').nullable().optional(),
});

export const fileListQuerySchema = z.object({
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().positive().max(100).default(20),
  search: z.string().trim().optional(),
  folderId: z.string().uuid().optional().or(z.literal('root')).or(z.literal('null')),
  relatedType: z.enum(['CLIENT', 'PROJECT', 'TASK', 'EMPLOYEE']).optional(),
  relatedId: z.string().uuid().optional(),
  clientId: z.string().uuid().optional(),
  projectId: z.string().uuid().optional(),
  taskId: z.string().uuid().optional(),
  employeeId: z.string().uuid().optional(),
  uploadedById: z.string().uuid().optional(),
  mimeType: z.string().optional(),
  category: z.enum(['document', 'image', 'archive', 'sheet', 'other']).optional(),
  dateFrom: z.coerce.date().optional(),
  dateTo: z.coerce.date().optional(),
  starred: z.coerce.boolean().optional(),
  sortBy: z.enum(['createdAt', 'name', 'size', 'updatedAt']).default('createdAt'),
  sortOrder: z.enum(['asc', 'desc']).default('desc'),
});

export const createFolderSchema = z.object({
  name: z.string().trim().min(1, 'Folder name is required').max(100),
  parentId: z.string().uuid('Invalid parent folder ID').nullable().optional(),
});

export const updateFolderSchema = z.object({
  name: z.string().trim().min(1, 'Folder name cannot be empty').max(100).optional(),
  parentId: z.string().uuid('Invalid parent folder ID').nullable().optional(),
});
