import { NextFunction, Response } from 'express';
import { JsonWebTokenError, TokenExpiredError } from 'jsonwebtoken';
import prisma from '../config/database';
import { PermissionService } from '../services/permission.service';
import { AuthenticatedRequest } from '../types/auth.types';
import { PermissionString } from '../types/permissions.types';
import { sendError } from '../utils/api-response';
import { verifyAccessToken } from '../utils/jwt';

/**
 * Authentication Middleware
 * Validates JWT access token, checks database user status,
 * loads linked employee and role, calculates effective permissions,
 * and attaches authenticated user context to the request.
 */
export async function authenticate(
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const authHeader = req.headers.authorization;

    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      sendError(res, 'Authentication required: missing or invalid Authorization header', 401);
      return;
    }

    const token = authHeader.substring(7).trim();
    if (!token) {
      sendError(res, 'Authentication required: access token missing', 401);
      return;
    }

    // 1. Verify token signature and expiration
    const payload = verifyAccessToken(token);

    // 2. Fetch fresh user account from database
    const user = await prisma.user.findUnique({
      where: { id: payload.userId },
      include: {
        role: true,
        employee: true,
      },
    });

    if (!user) {
      sendError(res, 'Authentication failed: user account no longer exists', 401);
      return;
    }

    // 3. Check account status
    if (user.accountStatus !== 'ACTIVE') {
      sendError(
        res,
        `Account access denied: your account is currently ${user.accountStatus.toLowerCase()}`,
        403
      );
      return;
    }

    // 4. Check linked employee status if present
    if (user.employee && user.employee.employmentStatus === 'INACTIVE') {
      sendError(res, 'Account access denied: linked employee profile is inactive', 403);
      return;
    }

    // 5. Calculate effective permissions
    const effectivePermissionKeys = await PermissionService.getEffectivePermissions(user.id);

    // 6. Attach authenticated user context
    req.user = {
      userId: user.id,
      email: user.email,
      role: {
        id: user.role.id,
        name: user.role.name,
        isSuperAdmin: user.role.isSuperAdmin,
        isSystemRole: user.role.isSystem,
        permissions: effectivePermissionKeys as PermissionString[],
      },
      isSuperAdmin: user.role.isSuperAdmin,
      employeeId: user.employeeId ?? undefined,
      permissions: new Set<PermissionString>(effectivePermissionKeys as PermissionString[]),
    };

    next();
  } catch (error) {
    if (error instanceof TokenExpiredError) {
      sendError(res, 'Token expired. Please refresh your session.', 401);
      return;
    }
    if (error instanceof JsonWebTokenError) {
      sendError(res, 'Invalid authentication token.', 401);
      return;
    }
    sendError(res, 'Authentication failed.', 401);
  }
}

/**
 * Capability-based Authorization Middleware
 *
 * Rules:
 * 1. ONLY Role.isSuperAdmin === true bypasses checks unconditionally.
 * 2. Never check role names (e.g. role.name === 'Admin').
 * 3. Evaluates effective capabilities (user overrides take precedence over role permissions).
 *
 * Example usage:
 * router.post('/projects', authenticate, authorize('projects.create'), controller);
 */
export function authorize(permissionKey: string) {
  return (req: AuthenticatedRequest, res: Response, next: NextFunction): void => {
    if (!req.user) {
      sendError(res, 'Unauthorized: user is not authenticated', 401);
      return;
    }

    // 1. Super Admin bypass (ONLY via isSuperAdmin === true, before normal evaluation)
    if (req.user.isSuperAdmin) {
      next();
      return;
    }

    // 2. Capability check against effective permissions
    const hasCapability = req.user.permissions.has(permissionKey as PermissionString);

    if (!hasCapability) {
      sendError(
        res,
        `Forbidden: you do not have the required permission (${permissionKey})`,
        403
      );
      return;
    }

    next();
  };
}
