import { Request } from 'express';
import { PermissionString, RoleEntity } from './permissions.types';

/**
 * Account Status for User authentication
 */
export enum AccountStatus {
  ACTIVE = 'ACTIVE',
  INACTIVE = 'INACTIVE',
  SUSPENDED = 'SUSPENDED',
  PENDING = 'PENDING',
}

/**
 * Employee: staff / business profile
 * Represents the human staff member in the organisation.
 * Note: Never store passwords directly on Employee.
 */
export interface EmployeeProfile {
  id: string;
  employeeCode: string;
  firstName: string;
  lastName: string;
  department: string;
  jobTitle: string;
  workEmail: string;
  phone?: string;
  avatarUrl?: string;
  joiningDate: Date;
  status: 'ACTIVE' | 'ON_LEAVE' | 'TERMINATED';
}

/**
 * User: login / security credential entity
 * Linked 1-to-0..1 with Employee profile.
 */
export interface UserAccount {
  id: string;
  email: string;
  passwordHash: string;
  status: AccountStatus;
  roleId: string;
  employeeId?: string; // 1-to-0..1 relationship
  createdAt: Date;
  updatedAt: Date;
}

/**
 * Safe user profile returned to frontend (without passwordHash)
 */
export interface SafeUserProfile {
  id: string;
  email: string;
  status: AccountStatus;
  role: {
    id: string;
    name: string;
    isSuperAdmin: boolean;
  };
  employee?: {
    id: string;
    employeeCode: string;
    firstName: string;
    lastName: string;
    department: string;
    jobTitle: string;
    avatarUrl?: string;
  };
  permissions: PermissionString[];
}

/**
 * JWT Payload structure for Access and Refresh tokens
 */
export interface JwtAccessTokenPayload {
  userId: string;
  email: string;
  roleId: string;
  isSuperAdmin: boolean;
  employeeId?: string;
}

export interface JwtRefreshTokenPayload {
  userId: string;
  tokenVersion?: number;
}

/**
 * Authenticated Request extending Express Request
 */
export interface AuthenticatedUser {
  userId: string;
  email: string;
  role: RoleEntity;
  isSuperAdmin: boolean;
  employeeId?: string;
  permissions: Set<PermissionString>;
}

export interface AuthenticatedRequest extends Request {
  user?: AuthenticatedUser;
}
