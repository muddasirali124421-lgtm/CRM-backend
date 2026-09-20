import { EmploymentStatus, UserAccountStatus } from '@prisma/client';

export interface EmployeeFilterQuery {
  page?: number;
  limit?: number;
  search?: string;
  status?: EmploymentStatus;
  departmentId?: string;
  roleId?: string;
  sortBy?: 'createdAt' | 'firstName' | 'lastName' | 'employeeCode' | 'joiningDate';
  sortOrder?: 'asc' | 'desc';
}

export interface SafeEmployeeListItem {
  id: string;
  employeeCode: string;
  firstName: string;
  lastName: string;
  email: string;
  phone: string | null;
  jobTitle: string;
  employmentStatus: EmploymentStatus;
  joiningDate: Date;
  profileImage: string | null;
  createdAt: Date;
  department: {
    id: string;
    name: string;
  } | null;
  user: {
    id: string;
    email: string;
    accountStatus: UserAccountStatus;
    role: {
      id: string;
      name: string;
      isSuperAdmin: boolean;
    };
  } | null;
}

export interface EmployeeDetailResponse extends SafeEmployeeListItem {
  updatedAt: Date;
  counts: {
    managedProjects: number;
    projectMemberships: number;
    assignedTasks: number;
    assignedLeads: number;
  };
}

export interface CreateEmployeeDTO {
  firstName: string;
  lastName: string;
  email: string;
  phone?: string;
  jobTitle: string;
  departmentId?: string;
  joiningDate: Date;
  employmentStatus?: EmploymentStatus;
  profileImage?: string;
}

export interface UpdateEmployeeDTO {
  firstName?: string;
  lastName?: string;
  phone?: string | null;
  jobTitle?: string;
  departmentId?: string | null;
  joiningDate?: Date;
  employmentStatus?: EmploymentStatus;
  profileImage?: string | null;
}

export interface CreateEmployeeAccountDTO {
  loginEmail: string;
  temporaryPassword: string;
  roleId: string;
}

export interface UpdateEmployeeAccountDTO {
  loginEmail?: string;
  roleId?: string;
  accountStatus?: UserAccountStatus;
}

export interface ResetPasswordDTO {
  newTemporaryPassword: string;
}

export interface PermissionOverrideInput {
  permissionKey: string;
  allowed: boolean | null; // true = ALLOW, false = DENY, null = REMOVE override (inherit)
}
