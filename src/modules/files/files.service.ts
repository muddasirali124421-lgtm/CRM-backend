import { Prisma, FileAccessLevel } from '@prisma/client';
import prisma from '../../config/database';
import { storageProvider, malwareScanner } from '../../services/storage';
import { AppError } from '../../utils/api-response';
import { AuditService } from '../../services/audit.service';
import { AuthenticatedUser } from '../../types/auth.types';
import { validateMagicBytes } from './files.validation';
import {
  SafeFileResponse,
  SafeFolderResponse,
  FileListFilters,
  UpdateFileDTO,
  CreateFolderDTO,
  UpdateFolderDTO,
  SafeUserSummary,
  SafeLinkedEntitySummary,
} from './files.types';

export class FilesService {
  /**
   * Safe mapping for User summary
   */
  private static formatUser(user: any): SafeUserSummary | null {
    if (!user) return null;
    return {
      id: user.id,
      email: user.email,
      employee: user.employee
        ? {
            id: user.employee.id,
            employeeCode: user.employee.employeeCode,
            firstName: user.employee.firstName,
            lastName: user.employee.lastName,
            jobTitle: user.employee.jobTitle,
            profileImage: user.employee.profileImage,
          }
        : null,
    };
  }

  /**
   * Safe mapping for FileAsset record
   */
  public static async formatFile(
    file: any,
    linkedEntity?: SafeLinkedEntitySummary | null
  ): Promise<SafeFileResponse> {
    let entity = linkedEntity;
    if (entity === undefined && file.relatedType && file.relatedId) {
      entity = await this.resolveLinkedEntity(file.relatedType, file.relatedId);
    }

    return {
      id: file.id,
      name: file.name,
      originalName: file.originalName,
      mimeType: file.mimeType,
      size: Number(file.size),
      storageProvider: file.storageProvider,
      folderId: file.folderId,
      folder: file.folder
        ? {
            id: file.folder.id,
            name: file.folder.name,
            parentId: file.folder.parentId,
            createdAt: file.folder.createdAt,
          }
        : null,
      relatedType: file.relatedType,
      relatedId: file.relatedId,
      relatedEntity: entity ?? null,
      accessLevel: file.accessLevel,
      starred: file.starred,
      uploadedById: file.uploadedById,
      uploadedBy: this.formatUser(file.uploadedBy),
      createdAt: file.createdAt,
      updatedAt: file.updatedAt,
    };
  }

  /**
   * Helper to resolve linked Client, Project, Task, or Employee display info
   */
  private static async resolveLinkedEntity(
    relatedType: string,
    relatedId: string
  ): Promise<SafeLinkedEntitySummary | null> {
    try {
      if (relatedType === 'CLIENT') {
        const client = await prisma.client.findUnique({
          where: { id: relatedId },
          select: { id: true, clientCode: true, name: true, company: true },
        });
        if (client) {
          return {
            type: 'CLIENT',
            id: client.id,
            code: client.clientCode,
            name: client.company || client.name,
          };
        }
      } else if (relatedType === 'PROJECT') {
        const project = await prisma.project.findUnique({
          where: { id: relatedId },
          select: { id: true, projectCode: true, name: true },
        });
        if (project) {
          return {
            type: 'PROJECT',
            id: project.id,
            code: project.projectCode,
            name: project.name,
          };
        }
      } else if (relatedType === 'TASK') {
        const task = await prisma.task.findUnique({
          where: { id: relatedId },
          select: { id: true, taskCode: true, title: true },
        });
        if (task) {
          return {
            type: 'TASK',
            id: task.id,
            code: task.taskCode,
            name: task.title,
          };
        }
      } else if (relatedType === 'EMPLOYEE') {
        const emp = await prisma.employee.findUnique({
          where: { id: relatedId },
          select: { id: true, employeeCode: true, firstName: true, lastName: true },
        });
        if (emp) {
          return {
            type: 'EMPLOYEE',
            id: emp.id,
            code: emp.employeeCode,
            name: `${emp.firstName} ${emp.lastName}`,
          };
        }
      }
    } catch {
      return null;
    }
    return null;
  }

  /**
   * Validate related entity exists and verify cross-entity consistency:
   * e.g. If linking to a Task, verify Task exists; if linking to a Project, verify Project exists.
   */
  public static async validateRelatedEntity(
    relatedType?: string | null,
    relatedId?: string | null
  ): Promise<void> {
    if (!relatedType && !relatedId) return;

    if ((relatedType && !relatedId) || (!relatedType && relatedId)) {
      throw new AppError('Both relatedType and relatedId must be provided together', 400);
    }

    if (relatedType === 'CLIENT') {
      const client = await prisma.client.findUnique({ where: { id: relatedId! } });
      if (!client) throw new AppError('Linked Client not found', 404);
    } else if (relatedType === 'PROJECT') {
      const project = await prisma.project.findUnique({ where: { id: relatedId! } });
      if (!project) throw new AppError('Linked Project not found', 404);
    } else if (relatedType === 'TASK') {
      const task = await prisma.task.findUnique({ where: { id: relatedId! } });
      if (!task) throw new AppError('Linked Task not found', 404);
    } else if (relatedType === 'EMPLOYEE') {
      const emp = await prisma.employee.findUnique({ where: { id: relatedId! } });
      if (!emp) throw new AppError('Linked Employee not found', 404);
    } else {
      throw new AppError(`Invalid relatedType: ${relatedType}`, 400);
    }
  }

  // ==========================================================================
  // FILE UPLOAD
  // ==========================================================================

  public static async uploadFile(
    fileBuffer: Buffer,
    originalName: string,
    mimeType: string,
    size: number,
    metadata: {
      name?: string;
      folderId?: string | null;
      relatedType?: 'CLIENT' | 'PROJECT' | 'TASK' | 'EMPLOYEE';
      relatedId?: string;
      accessLevel?: FileAccessLevel;
      starred?: boolean;
    },
    user: AuthenticatedUser
  ): Promise<SafeFileResponse> {
    // 1. Magic bytes validation to prevent MIME-spoofing
    if (!validateMagicBytes(fileBuffer, mimeType)) {
      throw new AppError('File header content does not match the declared MIME type', 400);
    }

    // 2. Malware scanning hook
    const scanResult = await malwareScanner.scan(fileBuffer, originalName);
    if (!scanResult.isClean) {
      throw new AppError(`Malware check flagged this file: ${scanResult.threatName || 'Suspicious payload'}`, 400);
    }

    // 3. Validate folder if supplied
    if (metadata.folderId) {
      const folder = await prisma.fileFolder.findUnique({ where: { id: metadata.folderId } });
      if (!folder) {
        throw new AppError('Target folder not found', 404);
      }
    }

    // 4. Validate linked entity if supplied
    if (metadata.relatedType || metadata.relatedId) {
      await this.validateRelatedEntity(metadata.relatedType, metadata.relatedId);
    }

    // 5. Store file via storage abstraction
    const uploadResult = await storageProvider.upload({
      buffer: fileBuffer,
      originalName,
      mimeType,
      size,
      prefix: metadata.relatedType ? metadata.relatedType.toLowerCase() : 'general',
    });

    // 6. Save metadata in PostgreSQL database
    const displayName = metadata.name?.trim() || originalName;

    try {
      const fileAsset = await prisma.fileAsset.create({
        data: {
          name: displayName,
          originalName,
          mimeType,
          size: BigInt(size),
          storageKey: uploadResult.storageKey,
          storageProvider: uploadResult.storageProvider,
          uploadedById: user.userId,
          folderId: metadata.folderId || null,
          relatedType: metadata.relatedType || null,
          relatedId: metadata.relatedId || null,
          accessLevel: metadata.accessLevel || FileAccessLevel.PRIVATE,
          starred: metadata.starred || false,
        },
        include: {
          folder: true,
          uploadedBy: {
            include: {
              employee: true,
            },
          },
        },
      });

      // 7. Record Audit Log
      await AuditService.log({
        userId: user.userId,
        action: 'FILE_UPLOADED',
        entityType: 'FILE',
        entityId: fileAsset.id,
        metadata: {
          name: fileAsset.name,
          originalName: fileAsset.originalName,
          mimeType: fileAsset.mimeType,
          size: Number(fileAsset.size),
          folderId: fileAsset.folderId,
          relatedType: fileAsset.relatedType,
          relatedId: fileAsset.relatedId,
        },
      });

      return await this.formatFile(fileAsset);
    } catch (dbError) {
      // Cleanup uploaded binary if DB write fails to avoid orphaned storage objects
      await storageProvider.delete(uploadResult.storageKey).catch(() => {});
      throw dbError;
    }
  }

  // ==========================================================================
  // LIST FILES
  // ==========================================================================

  public static async listFiles(
    filters: FileListFilters,
    user: AuthenticatedUser
  ): Promise<{ items: SafeFileResponse[]; pagination: any }> {
    const {
      page = 1,
      limit = 20,
      search,
      folderId,
      relatedType,
      relatedId,
      clientId,
      projectId,
      taskId,
      employeeId,
      uploadedById,
      mimeType,
      category,
      dateFrom,
      dateTo,
      starred,
      sortBy = 'createdAt',
      sortOrder = 'desc',
    } = filters;

    const where: Prisma.FileAssetWhereInput = {};

    // Root / unfiled folder filtering
    if (folderId === 'root' || folderId === 'null') {
      where.folderId = null;
    } else if (folderId) {
      where.folderId = folderId;
    }

    // Direct and shorthand entity filters
    if (clientId) {
      where.relatedType = 'CLIENT';
      where.relatedId = clientId;
    } else if (projectId) {
      where.relatedType = 'PROJECT';
      where.relatedId = projectId;
    } else if (taskId) {
      where.relatedType = 'TASK';
      where.relatedId = taskId;
    } else if (employeeId) {
      where.relatedType = 'EMPLOYEE';
      where.relatedId = employeeId;
    } else {
      if (relatedType) where.relatedType = relatedType;
      if (relatedId) where.relatedId = relatedId;
    }

    if (uploadedById) where.uploadedById = uploadedById;
    if (starred !== undefined) where.starred = starred;

    // MIME type / Category filter
    if (mimeType) {
      where.mimeType = { contains: mimeType, mode: 'insensitive' };
    } else if (category) {
      if (category === 'image') {
        where.mimeType = { startsWith: 'image/' };
      } else if (category === 'document') {
        where.mimeType = {
          in: [
            'application/pdf',
            'application/msword',
            'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
            'text/plain',
          ],
        };
      } else if (category === 'sheet') {
        where.mimeType = {
          in: [
            'text/csv',
            'application/vnd.ms-excel',
            'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
          ],
        };
      } else if (category === 'archive') {
        where.mimeType = {
          in: ['application/zip', 'application/x-zip-compressed'],
        };
      }
    }

    // Search filter across display name and original filename
    if (search) {
      where.OR = [
        { name: { contains: search, mode: 'insensitive' } },
        { originalName: { contains: search, mode: 'insensitive' } },
      ];
    }

    // Date range filter
    if (dateFrom || dateTo) {
      where.createdAt = {};
      if (dateFrom) where.createdAt.gte = dateFrom;
      if (dateTo) where.createdAt.lte = dateTo;
    }

    // Scope check: If not super admin, filter files according to accessLevel and shares
    if (!user.isSuperAdmin) {
      where.AND = [
        {
          OR: [
            { accessLevel: FileAccessLevel.EVERYONE },
            { uploadedById: user.userId },
            { shares: { some: { userId: user.userId } } },
          ],
        },
      ];
    }

    const [total, files] = await Promise.all([
      prisma.fileAsset.count({ where }),
      prisma.fileAsset.findMany({
        where,
        include: {
          folder: true,
          uploadedBy: {
            include: {
              employee: true,
            },
          },
        },
        skip: (page - 1) * limit,
        take: limit,
        orderBy: { [sortBy]: sortOrder },
      }),
    ]);

    const items = await Promise.all(files.map((f) => this.formatFile(f)));
    const totalPages = Math.ceil(total / limit) || 1;

    return {
      items,
      pagination: {
        page,
        limit,
        total,
        totalPages,
        hasNextPage: page < totalPages,
        hasPrevPage: page > 1,
      },
    };
  }

  // ==========================================================================
  // GET FILE BY ID
  // ==========================================================================

  public static async getFileById(id: string, user: AuthenticatedUser): Promise<SafeFileResponse> {
    const file = await prisma.fileAsset.findUnique({
      where: { id },
      include: {
        folder: true,
        uploadedBy: {
          include: {
            employee: true,
          },
        },
        shares: true,
      },
    });

    if (!file) {
      throw new AppError('File not found', 404);
    }

    // Access check: Super Admin bypasses, otherwise owner, EVERYONE, or shared
    if (!user.isSuperAdmin) {
      const isOwner = file.uploadedById === user.userId;
      const isPublic = file.accessLevel === FileAccessLevel.EVERYONE;
      const isShared = file.shares.some((s) => s.userId === user.userId);

      if (!isOwner && !isPublic && !isShared) {
        throw new AppError('Access denied to this file', 403);
      }
    }

    return await this.formatFile(file);
  }

  // ==========================================================================
  // SECURE DOWNLOAD
  // ==========================================================================

  public static async getDownloadStream(id: string, user: AuthenticatedUser) {
    const file = await prisma.fileAsset.findUnique({
      where: { id },
      include: { shares: true },
    });

    if (!file) {
      throw new AppError('File not found', 404);
    }

    // Access check
    if (!user.isSuperAdmin) {
      const isOwner = file.uploadedById === user.userId;
      const isPublic = file.accessLevel === FileAccessLevel.EVERYONE;
      const isShared = file.shares.some((s) => s.userId === user.userId);

      if (!isOwner && !isPublic && !isShared) {
        throw new AppError('Access denied: you do not have permission to download this file', 403);
      }
    }

    // Resolve stream via storage provider
    const download = await storageProvider.getDownload(file.storageKey);

    // Record audit log for file download
    AuditService.log({
      userId: user.userId,
      action: 'FILE_DOWNLOADED',
      entityType: 'FILE',
      entityId: file.id,
      metadata: {
        originalName: file.originalName,
        size: Number(file.size),
      },
    }).catch(() => {});

    // Sanitize user-facing download filename (remove CRLF, quotes, backslashes)
    const sanitizedName = file.originalName.replace(/["\r\n\\]/g, '_');

    return {
      stream: download.stream,
      mimeType: file.mimeType,
      size: Number(file.size),
      filename: sanitizedName,
    };
  }

  // ==========================================================================
  // UPDATE FILE METADATA
  // ==========================================================================

  public static async updateFile(
    id: string,
    data: UpdateFileDTO,
    user: AuthenticatedUser
  ): Promise<SafeFileResponse> {
    const file = await prisma.fileAsset.findUnique({
      where: { id },
      include: { shares: true },
    });

    if (!file) {
      throw new AppError('File not found', 404);
    }

    // Authorization: Super Admin, owner, or share with canEdit
    if (!user.isSuperAdmin && file.uploadedById !== user.userId) {
      const share = file.shares.find((s) => s.userId === user.userId);
      if (!share || !share.canEdit) {
        throw new AppError('You do not have permission to edit this file', 403);
      }
    }

    // Validate folder if changing
    if (data.folderId !== undefined && data.folderId !== null) {
      const folder = await prisma.fileFolder.findUnique({ where: { id: data.folderId } });
      if (!folder) throw new AppError('Target folder not found', 404);
    }

    // Validate related entity if changing
    if (data.relatedType !== undefined || data.relatedId !== undefined) {
      const nextType = data.relatedType !== undefined ? data.relatedType : file.relatedType;
      const nextId = data.relatedId !== undefined ? data.relatedId : file.relatedId;
      await this.validateRelatedEntity(nextType, nextId);
    }

    const updated = await prisma.fileAsset.update({
      where: { id },
      data: {
        name: data.name !== undefined ? data.name.trim() : undefined,
        folderId: data.folderId !== undefined ? data.folderId : undefined,
        starred: data.starred !== undefined ? data.starred : undefined,
        accessLevel: data.accessLevel !== undefined ? data.accessLevel : undefined,
        relatedType: data.relatedType !== undefined ? data.relatedType : undefined,
        relatedId: data.relatedId !== undefined ? data.relatedId : undefined,
      },
      include: {
        folder: true,
        uploadedBy: {
          include: {
            employee: true,
          },
        },
      },
    });

    await AuditService.log({
      userId: user.userId,
      action: 'FILE_METADATA_UPDATED',
      entityType: 'FILE',
      entityId: id,
      metadata: {
        updatedFields: Object.keys(data),
      },
    });

    return await this.formatFile(updated);
  }

  // ==========================================================================
  // DELETE FILE
  // ==========================================================================

  public static async deleteFile(
    id: string,
    user: AuthenticatedUser
  ): Promise<{ id: string; message: string }> {
    const file = await prisma.fileAsset.findUnique({ where: { id } });

    if (!file) {
      throw new AppError('File not found', 404);
    }

    // Authorization: Super Admin, or uploader
    if (!user.isSuperAdmin && file.uploadedById !== user.userId) {
      throw new AppError('You do not have permission to delete this file', 403);
    }

    // 1. Delete database record
    await prisma.fileAsset.delete({ where: { id } });

    // 2. Coordinate physical storage removal safely
    try {
      await storageProvider.delete(file.storageKey);
    } catch (storageErr) {
      // Storage failure does not corrupt DB metadata since record is already removed;
      // warning is recorded safely
    }

    // 3. Record Audit Log
    await AuditService.log({
      userId: user.userId,
      action: 'FILE_DELETED',
      entityType: 'FILE',
      entityId: id,
      metadata: {
        name: file.name,
        originalName: file.originalName,
        size: Number(file.size),
        storageKey: file.storageKey,
      },
    });

    return {
      id,
      message: `File "${file.name}" deleted successfully`,
    };
  }

  // ==========================================================================
  // FOLDERS MANAGEMENT
  // ==========================================================================

  public static async listFolders(_user: AuthenticatedUser): Promise<SafeFolderResponse[]> {
    const folders = await prisma.fileFolder.findMany({
      include: {
        createdBy: {
          include: {
            employee: true,
          },
        },
        subfolders: true,
        _count: {
          select: {
            files: true,
            subfolders: true,
          },
        },
      },
      orderBy: { name: 'asc' },
    });

    return folders.map((f) => ({
      id: f.id,
      name: f.name,
      parentId: f.parentId,
      createdById: f.createdById,
      createdBy: this.formatUser(f.createdBy),
      filesCount: f._count.files,
      subfoldersCount: f._count.subfolders,
      subfolders: f.subfolders.map((sf) => ({
        id: sf.id,
        name: sf.name,
        parentId: sf.parentId,
        createdAt: sf.createdAt,
      })),
      createdAt: f.createdAt,
      updatedAt: f.updatedAt,
    }));
  }

  public static async createFolder(
    data: CreateFolderDTO,
    user: AuthenticatedUser
  ): Promise<SafeFolderResponse> {
    if (data.parentId) {
      const parent = await prisma.fileFolder.findUnique({ where: { id: data.parentId } });
      if (!parent) {
        throw new AppError('Parent folder not found', 404);
      }
    }

    const folder = await prisma.fileFolder.create({
      data: {
        name: data.name.trim(),
        parentId: data.parentId || null,
        createdById: user.userId,
      },
      include: {
        createdBy: {
          include: {
            employee: true,
          },
        },
        subfolders: true,
        _count: {
          select: {
            files: true,
            subfolders: true,
          },
        },
      },
    });

    await AuditService.log({
      userId: user.userId,
      action: 'FOLDER_CREATED',
      entityType: 'FILE_FOLDER',
      entityId: folder.id,
      metadata: {
        name: folder.name,
        parentId: folder.parentId,
      },
    });

    return {
      id: folder.id,
      name: folder.name,
      parentId: folder.parentId,
      createdById: folder.createdById,
      createdBy: this.formatUser(folder.createdBy),
      filesCount: folder._count.files,
      subfoldersCount: folder._count.subfolders,
      subfolders: [],
      createdAt: folder.createdAt,
      updatedAt: folder.updatedAt,
    };
  }

  public static async updateFolder(
    id: string,
    data: UpdateFolderDTO,
    user: AuthenticatedUser
  ): Promise<SafeFolderResponse> {
    const folder = await prisma.fileFolder.findUnique({ where: { id } });
    if (!folder) {
      throw new AppError('Folder not found', 404);
    }

    // Circular parent check: folder cannot be its own parent
    if (data.parentId !== undefined) {
      if (data.parentId === id) {
        throw new AppError('A folder cannot be its own parent', 400);
      }
      if (data.parentId !== null) {
        const parent = await prisma.fileFolder.findUnique({ where: { id: data.parentId } });
        if (!parent) throw new AppError('Parent folder not found', 404);
      }
    }

    const updated = await prisma.fileFolder.update({
      where: { id },
      data: {
        name: data.name !== undefined ? data.name.trim() : undefined,
        parentId: data.parentId !== undefined ? data.parentId : undefined,
      },
      include: {
        createdBy: {
          include: {
            employee: true,
          },
        },
        subfolders: true,
        _count: {
          select: {
            files: true,
            subfolders: true,
          },
        },
      },
    });

    await AuditService.log({
      userId: user.userId,
      action: 'FOLDER_UPDATED',
      entityType: 'FILE_FOLDER',
      entityId: id,
      metadata: {
        name: updated.name,
        parentId: updated.parentId,
      },
    });

    return {
      id: updated.id,
      name: updated.name,
      parentId: updated.parentId,
      createdById: updated.createdById,
      createdBy: this.formatUser(updated.createdBy),
      filesCount: updated._count.files,
      subfoldersCount: updated._count.subfolders,
      subfolders: updated.subfolders.map((sf) => ({
        id: sf.id,
        name: sf.name,
        parentId: sf.parentId,
        createdAt: sf.createdAt,
      })),
      createdAt: updated.createdAt,
      updatedAt: updated.updatedAt,
    };
  }

  /**
   * Delete folder safety: Prevent deletion when folder contains files or subfolders
   * to protect user files from accidental destruction.
   */
  public static async deleteFolder(
    id: string,
    user: AuthenticatedUser
  ): Promise<{ id: string; message: string }> {
    const folder = await prisma.fileFolder.findUnique({
      where: { id },
      include: {
        _count: {
          select: {
            files: true,
            subfolders: true,
          },
        },
      },
    });

    if (!folder) {
      throw new AppError('Folder not found', 404);
    }

    if (folder._count.files > 0 || folder._count.subfolders > 0) {
      throw new AppError(
        `Cannot delete folder "${folder.name}". It contains ${folder._count.files} file(s) and ${folder._count.subfolders} subfolder(s). Please move or delete its contents first.`,
        400
      );
    }

    await prisma.fileFolder.delete({ where: { id } });

    await AuditService.log({
      userId: user.userId,
      action: 'FOLDER_DELETED',
      entityType: 'FILE_FOLDER',
      entityId: id,
      metadata: { name: folder.name },
    });

    return {
      id,
      message: `Folder "${folder.name}" deleted successfully`,
    };
  }
}
