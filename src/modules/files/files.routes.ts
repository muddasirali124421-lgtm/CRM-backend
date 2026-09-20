import { Router } from 'express';
import { authenticate, authorize } from '../../middleware/auth.middleware';
import { validateRequest } from '../../middleware/validate.middleware';
import { FilesController } from './files.controller';
import {
  uploadMiddleware,
  handleMulterError,
  fileListQuerySchema,
  updateFileSchema,
  createFolderSchema,
  updateFolderSchema,
} from './files.validation';

// ============================================================================
// FILES ROUTER (/api/files)
// ============================================================================

export const filesRouter = Router();

// Require authentication for all file endpoints
filesRouter.use(authenticate);

// 1. List files (requires files.view)
filesRouter.get(
  '/',
  authorize('files.view'),
  validateRequest({ query: fileListQuerySchema }),
  FilesController.listFiles
);

// 2. Upload file (requires files.create or files.upload)
filesRouter.post(
  '/',
  authorize(['files.create', 'files.upload']),
  uploadMiddleware.single('file'),
  handleMulterError,
  FilesController.uploadFile
);

// 3. Download file (requires files.download or files.view)
filesRouter.get(
  '/:id/download',
  authorize(['files.download', 'files.view']),
  FilesController.downloadFile
);

// 4. Get file details (requires files.view)
filesRouter.get(
  '/:id',
  authorize('files.view'),
  FilesController.getFileById
);

// 5. Update file metadata (requires files.edit or files.upload)
filesRouter.patch(
  '/:id',
  authorize(['files.edit', 'files.upload']),
  validateRequest({ body: updateFileSchema }),
  FilesController.updateFile
);

// 6. Delete file (requires files.delete)
filesRouter.delete(
  '/:id',
  authorize('files.delete'),
  FilesController.deleteFile
);

// ============================================================================
// FILE FOLDERS ROUTER (/api/file-folders)
// ============================================================================

export const fileFoldersRouter = Router();

// Require authentication for all folder endpoints
fileFoldersRouter.use(authenticate);

// 1. List folders (requires files.view)
fileFoldersRouter.get(
  '/',
  authorize('files.view'),
  FilesController.listFolders
);

// 2. Create folder (requires files.manage_folders or files.create or files.upload)
fileFoldersRouter.post(
  '/',
  authorize(['files.manage_folders', 'files.create', 'files.upload']),
  validateRequest({ body: createFolderSchema }),
  FilesController.createFolder
);

// 3. Update folder (requires files.manage_folders or files.edit)
fileFoldersRouter.patch(
  '/:id',
  authorize(['files.manage_folders', 'files.edit']),
  validateRequest({ body: updateFolderSchema }),
  FilesController.updateFolder
);

// 4. Delete folder (requires files.manage_folders or files.delete)
fileFoldersRouter.delete(
  '/:id',
  authorize(['files.manage_folders', 'files.delete']),
  FilesController.deleteFolder
);

export default filesRouter;
