import prisma from '../../config/database';
import { AuditService } from '../../services/audit.service';
import { PermissionService } from '../../services/permission.service';
import { AppError } from '../../utils/api-response';
import { generateRefreshTokenString, hashRefreshToken, signAccessToken } from '../../utils/jwt';
import { verifyPassword } from '../../utils/password';
import { CurrentUserResult, LoginResult, RefreshResult } from './auth.types';

export interface RequestContext {
  ipAddress?: string;
  userAgent?: string;
}

// 7 days duration in milliseconds for refresh token sessions
const REFRESH_TOKEN_TTL_MS = 7 * 24 * 60 * 60 * 1000;

export class AuthService {
  /**
   * Authenticate user with email and password
   */
  public static async login(
    emailInput: string,
    passwordInput: string,
    context: RequestContext = {}
  ): Promise<LoginResult> {
    const email = emailInput.trim().toLowerCase();

    // 1. Find user with linked Employee and Role
    const user = await prisma.user.findUnique({
      where: { email },
      include: {
        role: true,
        employee: {
          include: {
            department: true,
          },
        },
      },
    });

    // 2. Generic error for email non-existence or password mismatch
    if (!user) {
      throw new AppError('Invalid email or password.', 401);
    }

    const isPasswordValid = await verifyPassword(passwordInput, user.passwordHash);
    if (!isPasswordValid) {
      throw new AppError('Invalid email or password.', 401);
    }

    // 3. Verify user account status
    if (user.accountStatus !== 'ACTIVE') {
      throw new AppError(
        `Account access denied: your account is currently ${user.accountStatus.toLowerCase()}.`,
        403
      );
    }

    // 4. Verify linked employee status if present
    if (user.employee && user.employee.employmentStatus === 'INACTIVE') {
      throw new AppError('Account access denied: linked employee profile is inactive.', 403);
    }

    // 5. Update lastLoginAt
    await prisma.user.update({
      where: { id: user.id },
      data: { lastLoginAt: new Date() },
    });

    // 6. Calculate effective capability permissions
    const permissions = await PermissionService.getEffectivePermissions(user.id);

    // 7. Issue short-lived JWT access token
    const accessToken = signAccessToken({
      userId: user.id,
      email: user.email,
      roleId: user.role.id,
      isSuperAdmin: user.role.isSuperAdmin,
      employeeId: user.employeeId ?? undefined,
    });

    // 8. Generate and store cryptographically secure database-backed refresh session
    const rawRefreshToken = generateRefreshTokenString();
    const tokenHash = hashRefreshToken(rawRefreshToken);
    const expiresAt = new Date(Date.now() + REFRESH_TOKEN_TTL_MS);

    await prisma.refreshSession.create({
      data: {
        userId: user.id,
        tokenHash,
        expiresAt,
        ipAddress: context.ipAddress || null,
        userAgent: context.userAgent || null,
      },
    });

    // 9. Record non-blocking Audit Log
    AuditService.log({
      userId: user.id,
      action: 'USER_LOGIN',
      entityType: 'USER',
      entityId: user.id,
      ipAddress: context.ipAddress,
      userAgent: context.userAgent,
    });

    return {
      user: {
        id: user.id,
        email: user.email,
        accountStatus: user.accountStatus,
      },
      employee: user.employee
        ? {
            id: user.employee.id,
            employeeCode: user.employee.employeeCode,
            firstName: user.employee.firstName,
            lastName: user.employee.lastName,
            jobTitle: user.employee.jobTitle,
            department: user.employee.department?.name ?? null,
            profileImage: user.employee.profileImage,
          }
        : null,
      role: {
        id: user.role.id,
        name: user.role.name,
        isSuperAdmin: user.role.isSuperAdmin,
      },
      permissions,
      accessToken,
      refreshToken: rawRefreshToken,
      refreshTokenExpiresAt: expiresAt,
    };
  }

  /**
   * Rotate and reissue tokens using a valid refresh token session
   */
  public static async refresh(
    rawRefreshToken: string,
    context: RequestContext = {}
  ): Promise<RefreshResult> {
    if (!rawRefreshToken) {
      throw new AppError('Refresh token required.', 401);
    }

    const tokenHash = hashRefreshToken(rawRefreshToken);

    // 1. Locate active session in database
    const session = await prisma.refreshSession.findUnique({
      where: { tokenHash },
      include: {
        user: {
          include: {
            role: true,
            employee: true,
          },
        },
      },
    });

    if (!session || session.revokedAt !== null || session.expiresAt < new Date()) {
      throw new AppError('Invalid or expired refresh session. Please login again.', 401);
    }

    const user = session.user;

    // 2. Validate user account status
    if (user.accountStatus !== 'ACTIVE') {
      throw new AppError('Account access denied: user account is not active.', 403);
    }

    // 3. Rotate session: revoke the old session
    await prisma.refreshSession.update({
      where: { id: session.id },
      data: { revokedAt: new Date() },
    });

    // 4. Create new refresh session
    const newRawRefreshToken = generateRefreshTokenString();
    const newTokenHash = hashRefreshToken(newRawRefreshToken);
    const expiresAt = new Date(Date.now() + REFRESH_TOKEN_TTL_MS);

    await prisma.refreshSession.create({
      data: {
        userId: user.id,
        tokenHash: newTokenHash,
        expiresAt,
        ipAddress: context.ipAddress || null,
        userAgent: context.userAgent || null,
      },
    });

    // 5. Issue new access token
    const accessToken = signAccessToken({
      userId: user.id,
      email: user.email,
      roleId: user.role.id,
      isSuperAdmin: user.role.isSuperAdmin,
      employeeId: user.employeeId ?? undefined,
    });

    return {
      accessToken,
      refreshToken: newRawRefreshToken,
      refreshTokenExpiresAt: expiresAt,
    };
  }

  /**
   * Revoke refresh session and record logout
   */
  public static async logout(
    rawRefreshToken?: string,
    userId?: string,
    context: RequestContext = {}
  ): Promise<void> {
    if (rawRefreshToken) {
      const tokenHash = hashRefreshToken(rawRefreshToken);
      await prisma.refreshSession.updateMany({
        where: {
          tokenHash,
          revokedAt: null,
        },
        data: { revokedAt: new Date() },
      });
    }

    if (userId) {
      AuditService.log({
        userId,
        action: 'USER_LOGOUT',
        entityType: 'USER',
        entityId: userId,
        ipAddress: context.ipAddress,
        userAgent: context.userAgent,
      });
    }
  }

  /**
   * Get safe profile of currently authenticated user
   */
  public static async getMe(userId: string): Promise<CurrentUserResult> {
    const user = await prisma.user.findUnique({
      where: { id: userId },
      include: {
        role: true,
        employee: {
          include: {
            department: true,
          },
        },
      },
    });

    if (!user) {
      throw new AppError('User not found.', 404);
    }

    const permissions = await PermissionService.getEffectivePermissions(user.id);

    return {
      user: {
        id: user.id,
        email: user.email,
        accountStatus: user.accountStatus,
      },
      employee: user.employee
        ? {
            id: user.employee.id,
            employeeCode: user.employee.employeeCode,
            firstName: user.employee.firstName,
            lastName: user.employee.lastName,
            jobTitle: user.employee.jobTitle,
            department: user.employee.department?.name ?? null,
            profileImage: user.employee.profileImage,
          }
        : null,
      role: {
        id: user.role.id,
        name: user.role.name,
        isSuperAdmin: user.role.isSuperAdmin,
      },
      permissions,
      effectivePermissions: permissions,
    };
  }
}
