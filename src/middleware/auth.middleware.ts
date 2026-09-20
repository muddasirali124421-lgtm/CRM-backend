import { NextFunction, Response } from 'express';
import { JsonWebTokenError, TokenExpiredError } from 'jsonwebtoken';
import { AuthenticatedRequest } from '../types/auth.types';
import { PermissionString, SystemModule } from '../types/permissions.types';
import { sendError } from '../utils/api-response';
import { verifyAccessToken } from '../utils/jwt';

/**
 * Authentication Middleware Preparation
 * Extracts Bearer token from Authorization header and verifies it.
 * Note: Full DB user retrieval, status check, and permission override loading
 * will be linked in Step 2 when database models are migrated.
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

    const payload = verifyAccessToken(token);

    // In this foundation step, we bind the decoded token payload to req.user.
    // In Step 2 (Auth implementation), this will also hydrate active status and permission overrides from DB.
    req.user = {
      userId: payload.userId,
      email: payload.email,
      isSuperAdmin: payload.isSuperAdmin,
      employeeId: payload.employeeId,
      role: {
        id: payload.roleId,
        name: payload.isSuperAdmin ? 'Super Admin' : 'Configured Role',
        isSuperAdmin: payload.isSuperAdmin,
        isSystemRole: true,
        permissions: [],
      },
      permissions: new Set<PermissionString>(),
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
 * Enforcement Rules:
 * 1. IF user is Super Admin -> ALLOW
 * 2. User Permission Override check (handled when permissions set is loaded)
 * 3. Role Permission check
 * 4. Strictly NO hardcoded role string checks (e.g., role === 'Admin')
 *
 * Example usage:
 * router.delete('/projects/:id', authenticate, authorize('projects', 'delete'), controller);
 */
export function authorize(module: SystemModule, action: string) {
  const requiredPermission: PermissionString = `${module}.${action}`;

  return (req: AuthenticatedRequest, res: Response, next: NextFunction): void => {
    if (!req.user) {
      sendError(res, 'Unauthorized: user is not authenticated', 401);
      return;
    }

    // 1. Super Admin has unrestricted access across all modules
    if (req.user.isSuperAdmin) {
      next();
      return;
    }

    // 2. Capability-based permission check
    const hasPermission = req.user.permissions.has(requiredPermission);

    if (!hasPermission) {
      sendError(
        res,
        `Forbidden: you do not have the required permission (${requiredPermission})`,
        403
      );
      return;
    }

    next();
  };
}
