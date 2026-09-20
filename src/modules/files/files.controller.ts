import { Response, NextFunction } from 'express';
import { FilesService } from './files.service';
import { sendSuccess, AppError } from '../../utils/api-response';
import { AuthenticatedRequest } from '../../types/auth.types';

export class FilesController {
  /**
   * POST /api/files - Upload file
   */
  public static async uploadFile(req: AuthenticatedRequest, res: Response, next: NextFunction) {
    try {
      if (!req.file) {
        throw new AppError('No file uploaded. Please supply a file with key "file"', 400);
      }

      const fileData = await FilesService.uploadFile(
        req.file.buffer,
        req.file.originalname,
        req.file.mimetype,
        req.file.size,
        req.body,
        req.user!
      );

      return sendSuccess(res, fileData, 'File uploaded successfully', 201);
    } catch (error) {
      next(error);
    }
  }

  /**
   * GET /api/files - List files with filters & pagination
   */
  public static async listFiles(req: AuthenticatedRequest, res: Response, next: NextFunction) {
    try {
      const result = await FilesService.listFiles(req.query as any, req.user!);
      return sendSuccess(res, result, 'Files retrieved successfully', 200);
    } catch (error) {
      next(error);
    }
  }

  /**
   * GET /api/files/:id - Get file details
   */
  public static async getFileById(req: AuthenticatedRequest, res: Response, next: NextFunction) {
    try {
      const file = await FilesService.getFileById(req.params.id, req.user!);
      return sendSuccess(res, file, 'File details retrieved successfully');
    } catch (error) {
      next(error);
    }
  }

  /**
   * GET /api/files/:id/download - Secure download stream
   */
  public static async downloadFile(req: AuthenticatedRequest, res: Response, next: NextFunction) {
    try {
      const { stream, mimeType, size, filename } = await FilesService.getDownloadStream(
        req.params.id,
        req.user!
      );

      // Safe HTTP download headers
      res.setHeader('Content-Type', mimeType);
      res.setHeader('Content-Length', size);
      res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
      res.setHeader('X-Content-Type-Options', 'nosniff');

      stream.pipe(res);
    } catch (error) {
      next(error);
    }
  }

  /**
   * PATCH /api/files/:id - Update metadata
   */
  public static async updateFile(req: AuthenticatedRequest, res: Response, next: NextFunction) {
    try {
      const file = await FilesService.updateFile(req.params.id, req.body, req.user!);
      return sendSuccess(res, file, 'File metadata updated successfully');
    } catch (error) {
      next(error);
    }
  }

  /**
   * DELETE /api/files/:id - Delete file
   */
  public static async deleteFile(req: AuthenticatedRequest, res: Response, next: NextFunction) {
    try {
      const result = await FilesService.deleteFile(req.params.id, req.user!);
      return sendSuccess(res, result, 'File deleted successfully');
    } catch (error) {
      next(error);
    }
  }

  // ==========================================================================
  // FOLDERS CONTROLLER METHODS
  // ==========================================================================

  /**
   * GET /api/file-folders - List folders
   */
  public static async listFolders(req: AuthenticatedRequest, res: Response, next: NextFunction) {
    try {
      const folders = await FilesService.listFolders(req.user!);
      return sendSuccess(res, folders, 'Folders retrieved successfully');
    } catch (error) {
      next(error);
    }
  }

  /**
   * POST /api/file-folders - Create folder
   */
  public static async createFolder(req: AuthenticatedRequest, res: Response, next: NextFunction) {
    try {
      const folder = await FilesService.createFolder(req.body, req.user!);
      return sendSuccess(res, folder, 'Folder created successfully', 201);
    } catch (error) {
      next(error);
    }
  }

  /**
   * PATCH /api/file-folders/:id - Update folder
   */
  public static async updateFolder(req: AuthenticatedRequest, res: Response, next: NextFunction) {
    try {
      const folder = await FilesService.updateFolder(req.params.id, req.body, req.user!);
      return sendSuccess(res, folder, 'Folder updated successfully');
    } catch (error) {
      next(error);
    }
  }

  /**
   * DELETE /api/file-folders/:id - Delete folder
   */
  public static async deleteFolder(req: AuthenticatedRequest, res: Response, next: NextFunction) {
    try {
      const result = await FilesService.deleteFolder(req.params.id, req.user!);
      return sendSuccess(res, result, 'Folder deleted successfully');
    } catch (error) {
      next(error);
    }
  }
}
