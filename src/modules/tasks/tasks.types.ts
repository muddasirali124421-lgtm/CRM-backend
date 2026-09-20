import { PriorityLevel, TaskStatus } from '@prisma/client';

export interface TaskFilterQuery {
  page?: number;
  limit?: number;
  search?: string;
  status?: TaskStatus;
  priority?: PriorityLevel;
  projectId?: string;
  clientId?: string;
  assigneeId?: string;
  createdById?: string;
  dueDateFrom?: Date;
  dueDateTo?: Date;
  overdue?: boolean;
  sortBy?: 'createdAt' | 'updatedAt' | 'title' | 'taskCode' | 'status' | 'priority' | 'startDate' | 'dueDate';
  sortOrder?: 'asc' | 'desc';
  view?: 'list' | 'kanban';
}

export interface SafeEmployeeSummary {
  id: string;
  employeeCode: string;
  firstName: string;
  lastName: string;
  jobTitle: string;
  profileImage: string | null;
  employmentStatus: string;
}

export interface SafeClientSummary {
  id: string;
  clientCode: string;
  name: string;
  company: string | null;
  email: string;
  phone: string | null;
}

export interface SafeProjectSummary {
  id: string;
  projectCode: string;
  name: string;
  status: string;
  priority: string;
}

export interface SafeUserSummary {
  id: string;
  email: string;
  employee?: {
    id: string;
    employeeCode: string;
    firstName: string;
    lastName: string;
    profileImage: string | null;
  } | null;
}

export interface SafeTaskAssigneeSummary {
  id: string;
  taskId: string;
  employeeId: string;
  assignedAt: Date;
  employee: SafeEmployeeSummary;
}

export interface SafeTaskChecklistItem {
  id: string;
  taskId: string;
  title: string;
  isCompleted: boolean;
  position: number;
  createdAt: Date;
  updatedAt: Date;
}

export interface SafeTaskComment {
  id: string;
  taskId: string;
  authorId: string;
  parentId: string | null;
  content: string;
  createdAt: Date;
  updatedAt: Date;
  author: SafeUserSummary;
  replies?: SafeTaskComment[];
}

export interface SafeTaskActivity {
  id: string;
  taskId: string;
  actorId: string | null;
  action: string;
  metadata: any;
  createdAt: Date;
  actor: SafeUserSummary | null;
}

export interface SafeTaskSubtask {
  id: string;
  taskCode: string;
  title: string;
  status: TaskStatus;
  priority: PriorityLevel;
  startDate: Date | null;
  dueDate: Date | null;
  completedAt: Date | null;
  isOverdue: boolean;
  createdAt: Date;
  assignees: SafeTaskAssigneeSummary[];
}

export interface SafeTaskAttachment {
  id: string;
  name: string;
  originalName: string;
  mimeType: string;
  size: number;
  storageProvider: string;
  accessLevel: string;
  createdAt: Date;
}

export interface SafeTaskResponse {
  id: string;
  taskCode: string;
  title: string;
  description: string | null;
  projectId: string;
  project: SafeProjectSummary;
  clientId: string | null;
  client: SafeClientSummary | null;
  createdById: string | null;
  createdBy: SafeUserSummary | null;
  status: TaskStatus;
  priority: PriorityLevel;
  startDate: Date | null;
  dueDate: Date | null;
  completedAt: Date | null;
  isOverdue: boolean;
  parentTaskId: string | null;
  createdAt: Date;
  updatedAt: Date;
  assignees: SafeTaskAssigneeSummary[];
  checklistSummary?: {
    total: number;
    completed: number;
  };
  commentsCount?: number;
  subtasksCount?: number;
}

export interface SafeTaskDetailsResponse extends SafeTaskResponse {
  checklist: SafeTaskChecklistItem[];
  subtasks: SafeTaskSubtask[];
  comments: SafeTaskComment[];
  activities: SafeTaskActivity[];
  attachments: SafeTaskAttachment[];
}

export interface KanbanColumnsResponse {
  view: 'kanban';
  columns: Record<TaskStatus, SafeTaskResponse[]>;
  total: number;
}

export interface CreateTaskDTO {
  title: string;
  description?: string;
  projectId: string;
  clientId?: string;
  status?: TaskStatus;
  priority?: PriorityLevel;
  startDate?: Date;
  dueDate?: Date;
  assigneeIds?: string[];
}

export interface UpdateTaskDTO {
  title?: string;
  description?: string | null;
  priority?: PriorityLevel;
  startDate?: Date | null;
  dueDate?: Date | null;
}

export interface UpdateTaskStatusDTO {
  status: TaskStatus;
}

export interface AddAssigneeDTO {
  employeeId: string;
}

export interface CreateChecklistItemDTO {
  title: string;
  isCompleted?: boolean;
  position?: number;
}

export interface UpdateChecklistItemDTO {
  title?: string;
  isCompleted?: boolean;
  position?: number;
}

export interface ReorderChecklistDTO {
  itemIds: string[];
}

export interface CreateSubtaskDTO {
  title: string;
  description?: string;
  priority?: PriorityLevel;
  startDate?: Date;
  dueDate?: Date;
  assigneeIds?: string[];
}

export interface CreateCommentDTO {
  content: string;
  parentId?: string;
}

export interface UpdateCommentDTO {
  content: string;
}
