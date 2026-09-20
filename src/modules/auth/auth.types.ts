export interface SafeAuthUser {
  id: string;
  email: string;
  accountStatus: string;
}

export interface SafeAuthEmployee {
  id: string;
  employeeCode: string;
  firstName: string;
  lastName: string;
  jobTitle: string;
  department?: string | null;
  profileImage?: string | null;
}

export interface SafeAuthRole {
  id: string;
  name: string;
  isSuperAdmin: boolean;
}

export interface LoginResult {
  user: SafeAuthUser;
  employee: SafeAuthEmployee | null;
  role: SafeAuthRole;
  permissions: string[];
  accessToken: string;
  refreshToken: string;
  refreshTokenExpiresAt: Date;
}

export interface RefreshResult {
  accessToken: string;
  refreshToken: string;
  refreshTokenExpiresAt: Date;
}

export interface CurrentUserResult {
  user: SafeAuthUser;
  employee: SafeAuthEmployee | null;
  role: SafeAuthRole;
  permissions: string[];
  effectivePermissions: string[];
}
