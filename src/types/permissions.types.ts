/**
 * OfficeCRM Capability-Based Permission Architecture
 *
 * Rules:
 * 1. Only Super Admin has unrestricted access.
 * 2. All other roles (including Admin) use configurable capability permissions.
 * 3. Custom roles must be supported.
 * 4. Never use hard-coded role checks like `if (role === 'Admin')` or `if (role === 'Manager')`.
 * 5. Effective permission hierarchy:
 *    - IF user is Super Admin -> ALLOW
 *    - ELSE IF individual User Permission Override exists -> use override (allow/deny)
 *    - ELSE -> use Role Permission default
 */

export const SYSTEM_MODULES = [
  'employees',
  'users',
  'roles',
  'permissions',
  'leads',
  'clients',
  'projects',
  'tasks',
  'kanban',
  'chat',
  'payments',
  'reports',
  'files',
  'notifications',
  'settings',
  'audit',
] as const;

export type SystemModule = (typeof SYSTEM_MODULES)[number];

export const STANDARD_ACTIONS = [
  'view',
  'create',
  'edit',
  'delete',
  'assign',
  'approve',
  'export',
  'share',
  'upload',
  'download',
  'manage_users',
  'manage_roles',
  'manage_permissions',
  'create_invoice',
  'edit_invoice',
  'record_payment',
  'view_financial',
] as const;

export type StandardAction = (typeof STANDARD_ACTIONS)[number] | string;

export type PermissionString = `${SystemModule}.${string}`;

/**
 * Standard System Role Names
 */
export enum PredefinedRole {
  SUPER_ADMIN = 'Super Admin',
  ADMIN = 'Admin',
  MANAGER = 'Manager',
  SALES_ADMIN = 'Sales Admin',
  SALES_EXECUTIVE = 'Sales Executive',
  DEVELOPER = 'Developer',
  DESIGNER = 'Designer',
  ACCOUNTS = 'Accounts',
}

/**
 * Role representation in permission engine
 */
export interface RoleEntity {
  id: string;
  name: string;
  isSuperAdmin: boolean;
  isSystemRole: boolean;
  permissions: PermissionString[];
}

/**
 * User permission override entity (granular grant or deny per user)
 */
export interface UserPermissionOverride {
  userId: string;
  permission: PermissionString;
  granted: boolean; // true = explicitly granted, false = explicitly revoked
}

/**
 * Effective permissions calculated for authenticated session
 */
export interface EffectivePermissions {
  isSuperAdmin: boolean;
  permissions: Set<PermissionString>;
}
