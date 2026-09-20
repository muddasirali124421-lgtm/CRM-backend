import { FileAccessLevel } from '@prisma/client';

export interface SafeUserSummary {
  id: string;
  email: string;
  employee?: {
    id: string;
    employeeCode: string;
    firstName: string;
    lastName: string;
    jobTitle: string;
    profileImage: string | null;
  } | null;
}

export interface SafeFolderSummary {
  id: string;
  name: string;
  parentId: string | null;
  createdAt: Date;
}

export interface SafeLinkedEntitySummary {
  type: 'CLIENT' | 'PROJECT' | 'TASK' | 'EMPLOYEE';
  id: string;
  name?: string;
  code?: string;
}

export interface SafeFileResponse {
  id: string;
  name: string;
  originalName: string;
  mimeType: string;
  size: number;
  storageProvider: string;
  folderId: string | null;
  folder?: SafeFolderSummary | null;
  relatedType: string | null;
  relatedId: string | null;
  relatedEntity?: SafeLinkedEntitySummary | null;
  accessLevel: FileAccessLevel;
  starred: boolean;
  uploadedById: string | null;
  uploadedBy?: SafeUserSummary | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface SafeFolderResponse {
  id: string;
  name: string;
  parentId: string | null;
  createdById: string | null;
  createdBy?: SafeUserSummary | null;
  filesCount?: number;
  subfoldersCount?: number;
  subfolders?: SafeFolderSummary[];
  createdAt: Date;
  updatedAt: Date;
}

export interface FileListFilters {
  page?: number;
  limit?: number;
  search?: string;
  folderId?: string | null;
  relatedType?: 'CLIENT' | 'PROJECT' | 'TASK' | 'EMPLOYEE';
  relatedId?: string;
  clientId?: string;
  projectId?: string;
  taskId?: string;
  employeeId?: string;
  uploadedById?: string;
  mimeType?: string;
  category?: 'document' | 'image' | 'archive' | 'sheet' | 'other';
  dateFrom?: Date;
  dateTo?: Date;
  starred?: boolean;
  sortBy?: 'createdAt' | 'name' | 'size' | 'updatedAt';
  sortOrder?: 'asc' | 'desc';
}

export interface UpdateFileDTO {
  name?: string;
  folderId?: string | null;
  starred?: boolean;
  accessLevel?: FileAccessLevel;
  relatedType?: 'CLIENT' | 'PROJECT' | 'TASK' | 'EMPLOYEE' | null;
  relatedId?: string | null;
}

export interface CreateFolderDTO {
  name: string;
  parentId?: string | null;
}

export interface UpdateFolderDTO {
  name?: string;
  parentId?: string | null;
}
