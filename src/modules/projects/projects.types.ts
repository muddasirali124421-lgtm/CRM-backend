import { PriorityLevel, ProjectStatus } from '@prisma/client';

export interface ProjectFilterQuery {
  page?: number;
  limit?: number;
  search?: string;
  status?: ProjectStatus;
  priority?: PriorityLevel;
  clientId?: string;
  managerId?: string;
  teamMemberId?: string;
  startDateFrom?: Date;
  startDateTo?: Date;
  dueDateFrom?: Date;
  dueDateTo?: Date;
  sortBy?: 'createdAt' | 'name' | 'projectCode' | 'status' | 'priority' | 'startDate' | 'dueDate' | 'budget';
  sortOrder?: 'asc' | 'desc';
}

export interface SafeClientSummary {
  id: string;
  clientCode: string;
  name: string;
  company: string | null;
  email: string;
  phone: string | null;
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

export interface SafeTeamMember {
  id: string;
  projectId: string;
  employeeId: string;
  projectRole: string;
  joinedAt: Date;
  employee: SafeEmployeeSummary;
}

export interface ProjectTaskSummary {
  total: number;
  todo: number;
  inProgress: number;
  qa: number;
  revision: number;
  completed: number;
}

export interface SafeProjectResponse {
  id: string;
  projectCode: string;
  name: string;
  description: string | null;
  clientId: string;
  managerId: string | null;
  status: ProjectStatus;
  priority: PriorityLevel;
  startDate: Date | null;
  dueDate: Date | null;
  completedAt: Date | null;
  budget: number | null;
  currency: string;
  createdAt: Date;
  updatedAt: Date;
  client?: SafeClientSummary | null;
  manager?: SafeEmployeeSummary | null;
  members?: SafeTeamMember[];
  taskSummary?: ProjectTaskSummary;
  invoicesCount?: number;
}

export interface CreateProjectDTO {
  name: string;
  clientId: string;
  description?: string;
  status?: ProjectStatus;
  priority?: PriorityLevel;
  startDate?: Date;
  dueDate?: Date;
  budget?: number;
  currency?: string;
  managerId?: string;
  memberIds?: string[];
}

export interface UpdateProjectDTO {
  name?: string;
  description?: string | null;
  clientId?: string;
  managerId?: string | null;
  status?: ProjectStatus;
  priority?: PriorityLevel;
  startDate?: Date | null;
  dueDate?: Date | null;
  completedAt?: Date | null;
  budget?: number | null;
  currency?: string;
}

export interface AssignManagerDTO {
  employeeId: string | null;
}

export interface AddTeamMemberDTO {
  employeeId: string;
  projectRole?: string;
}
