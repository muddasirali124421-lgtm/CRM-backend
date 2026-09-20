import { Response, Router } from 'express';
import { z } from 'zod';
import prisma from '../../config/database';
import { authenticate, authorize } from '../../middleware/auth.middleware';
import { validateRequest } from '../../middleware/validate.middleware';
import { AuditService } from '../../services/audit.service';
import { PermissionService } from '../../services/permission.service';
import { AuthenticatedRequest } from '../../types/auth.types';
import { AppError, asyncHandler, sendSuccess } from '../../utils/api-response';

const userPermissionOverridesSchema = z
  .object({
    permissions: z
      .array(
        z.object({
          permissionKey: z.string().min(1, 'Permission key is required'),
          allowed: z.boolean().nullable(),
        })
      )
      .optional(),
    overrides: z
      .array(
        z.object({
          permissionKey: z.string().min(1, 'Permission key is required'),
          allowed: z.boolean().nullable(),
        })
      )
      .optional(),
  })
  .refine(
    (data) => (Array.isArray(data.permissions) && data.permissions.length > 0) || (Array.isArray(data.overrides) && data.overrides.length > 0),
    { message: 'Either permissions or overrides array must be provided' }
  );

export const usersRouter = Router();

usersRouter.use(authenticate);

/**
 * GET /api/users
 * List user login accounts with linked staff and role metadata
 */
usersRouter.get(
  '/',
  authorize('settings.manage_users', 'settings.view'),
  asyncHandler(async (_req: AuthenticatedRequest, res: Response) => {
    const users = await prisma.user.findMany({
      select: {
        id: true,
        email: true,
        accountStatus: true,
        lastLoginAt: true,
        createdAt: true,
        role: {
          select: {
            id: true,
            name: true,
            isSuperAdmin: true,
          },
        },
        employee: {
          select: {
            id: true,
            employeeCode: true,
            firstName: true,
            lastName: true,
            jobTitle: true,
            department: {
              select: {
                id: true,
                name: true,
              },
            },
          },
        },
      },
      orderBy: { createdAt: 'desc' },
    });

    sendSuccess(res, users, 'User accounts retrieved successfully');
  })
);

/**
 * GET /api/users/:id
 * Retrieve a single user account
 */
usersRouter.get(
  '/:id',
  authorize('settings.manage_users', 'settings.view'),
  asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const user = await prisma.user.findUnique({
      where: { id: req.params.id },
      select: {
        id: true,
        email: true,
        accountStatus: true,
        lastLoginAt: true,
        createdAt: true,
        role: {
          select: {
            id: true,
            name: true,
            isSuperAdmin: true,
          },
        },
        employee: {
          select: {
            id: true,
            employeeCode: true,
            firstName: true,
            lastName: true,
            jobTitle: true,
            department: {
              select: {
                id: true,
                name: true,
              },
            },
          },
        },
      },
    });

    if (!user) {
      throw new AppError('User not found', 404);
    }

    sendSuccess(res, user, 'User details retrieved successfully');
  })
);

/**
 * GET /api/users/:id/permissions
 * Retrieve configured permissions and individual user overrides (ALLOW / DENY)
 */
usersRouter.get(
  '/:id/permissions',
  authorize('settings.manage_permissions'),
  asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const userId = req.params.id;

    const user = await prisma.user.findUnique({
      where: { id: userId },
      include: {
        role: {
          include: {
            rolePermissions: {
              include: { permission: true },
            },
          },
        },
        permissionOverrides: {
          include: { permission: true },
        },
      },
    });

    if (!user) {
      throw new AppError('User not found', 404);
    }

    const allPermissions = await prisma.permission.findMany({
      orderBy: [{ module: 'asc' }, { key: 'asc' }],
    });

    const rolePermMap = new Map<string, boolean>();
    for (const rp of user.role.rolePermissions) {
      rolePermMap.set(rp.permission.key, rp.allowed);
    }

    const overrideMap = new Map<string, boolean>();
    for (const po of user.permissionOverrides) {
      overrideMap.set(po.permission.key, po.allowed);
    }

    const effectiveKeys = new Set(await PermissionService.getEffectivePermissions(user.id));

    const permissions = allPermissions.map((p: any) => {
      const roleAllowed = user.role.isSuperAdmin ? true : (rolePermMap.get(p.key) ?? false);
      const hasOverride = overrideMap.has(p.key);
      const overrideAllowed = hasOverride ? overrideMap.get(p.key)! : null;
      const effectiveAllowed = user.role.isSuperAdmin ? true : effectiveKeys.has(p.key as any);

      return {
        key: p.key,
        module: p.module,
        action: p.action,
        description: p.description,
        roleDefault: roleAllowed,
        override: overrideAllowed, // true = ALLOW, false = DENY, null = none
        effective: effectiveAllowed,
      };
    });

    sendSuccess(
      res,
      {
        user: {
          id: user.id,
          email: user.email,
          role: {
            id: user.role.id,
            name: user.role.name,
            isSuperAdmin: user.role.isSuperAdmin,
          },
        },
        permissions,
      },
      'User permissions and overrides retrieved successfully'
    );
  })
);

/**
 * PUT /api/users/:id/permissions
 * Apply individual user overrides (ALLOW, DENY, or null to revert to role default)
 */
usersRouter.put(
  '/:id/permissions',
  authorize('settings.manage_permissions'),
  validateRequest({ body: userPermissionOverridesSchema }),
  asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const userId = req.params.id;
    const overridesInput = ((req.body.permissions ?? req.body.overrides) || []) as Array<{
      permissionKey: string;
      allowed: boolean | null;
    }>;

    const user = await prisma.user.findUnique({
      where: { id: userId },
      include: { role: true },
    });

    if (!user) {
      throw new AppError('User not found', 404);
    }

    if (user.role.isSuperAdmin) {
      throw new AppError('Super Admin user has unconditional access; overrides cannot be applied.', 400);
    }

    await prisma.$transaction(async (tx: any) => {
      for (const item of overridesInput) {
        const perm = await tx.permission.findUnique({ where: { key: item.permissionKey } });
        if (!perm) {
          throw new AppError(`Permission "${item.permissionKey}" not found`, 404);
        }

        if (item.allowed === null) {
          await tx.userPermissionOverride.deleteMany({
            where: {
              userId: user.id,
              permissionId: perm.id,
            },
          });
        } else {
          await tx.userPermissionOverride.upsert({
            where: {
              userId_permissionId: {
                userId: user.id,
                permissionId: perm.id,
              },
            },
            update: { allowed: item.allowed },
            create: {
              userId: user.id,
              permissionId: perm.id,
              allowed: item.allowed,
            },
          });
        }
      }
    });

    await AuditService.log({
      userId: req.user!.userId,
      action: 'USER_PERMISSION_OVERRIDE_CHANGED',
      entityType: 'USER',
      entityId: user.id,
      metadata: { count: overridesInput.length },
      ipAddress: req.ip,
      userAgent: req.headers['user-agent'],
    });

    sendSuccess(res, null, `Permissions for user "${user.email}" updated successfully`);
  })
);

export default usersRouter;
