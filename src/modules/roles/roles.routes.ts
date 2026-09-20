import { Response, Router } from 'express';
import prisma from '../../config/database';
import { authenticate, authorize } from '../../middleware/auth.middleware';
import { validateRequest } from '../../middleware/validate.middleware';
import { AuditService } from '../../services/audit.service';
import { AuthenticatedRequest } from '../../types/auth.types';
import { AppError, sendSuccess } from '../../utils/api-response';
import { updateRolePermissionsSchema } from './roles.validation';

const rolesRouter = Router();

rolesRouter.use(authenticate);

/**
 * GET /api/roles
 * List roles for dropdowns and role selection
 */
rolesRouter.get('/', async (_req: AuthenticatedRequest, res: Response) => {
  const roles = await prisma.role.findMany({
    select: {
      id: true,
      name: true,
      description: true,
      isSuperAdmin: true,
      isSystem: true,
    },
    orderBy: {
      name: 'asc',
    },
  });

  sendSuccess(res, roles, 'Roles retrieved successfully');
});

/**
 * GET /api/roles/:id/permissions
 * List all capability permissions with allowed status for the role
 */
rolesRouter.get(
  '/:id/permissions',
  authorize('settings.manage_permissions'),
  async (req: AuthenticatedRequest, res: Response) => {
    const roleId = req.params.id;

    const role = await prisma.role.findUnique({
      where: { id: roleId },
      include: {
        rolePermissions: {
          include: { permission: true },
        },
      },
    });

    if (!role) {
      throw new AppError('Role not found', 404);
    }

    const allPermissions = await prisma.permission.findMany({
      orderBy: { key: 'asc' },
    });

    const rolePermissionMap = new Map<string, boolean>();
    for (const rp of role.rolePermissions) {
      rolePermissionMap.set(rp.permission.key, rp.allowed);
    }

    const permissions = allPermissions.map((p) => ({
      key: p.key,
      module: p.module,
      action: p.action,
      description: p.description,
      allowed: role.isSuperAdmin ? true : (rolePermissionMap.get(p.key) ?? false),
    }));

    sendSuccess(
      res,
      {
        role: {
          id: role.id,
          name: role.name,
          isSuperAdmin: role.isSuperAdmin,
        },
        permissions,
      },
      'Role permissions retrieved successfully'
    );
  }
);

/**
 * PUT /api/roles/:id/permissions
 * Update configured permissions for a non-Super-Admin role
 */
rolesRouter.put(
  '/:id/permissions',
  authorize('settings.manage_permissions'),
  validateRequest({ body: updateRolePermissionsSchema }),
  async (req: AuthenticatedRequest, res: Response) => {
    const roleId = req.params.id;
    const { permissions } = req.body;

    const role = await prisma.role.findUnique({ where: { id: roleId } });
    if (!role) {
      throw new AppError('Role not found', 404);
    }

    // Super Admin protection: cannot restrict Super Admin permissions
    if (role.isSuperAdmin) {
      throw new AppError(
        'Super Admin role has unconditional access and cannot be restricted.',
        400
      );
    }

    // Atomically upsert role permissions
    await prisma.$transaction(async (tx) => {
      for (const item of permissions) {
        const perm = await tx.permission.findUnique({ where: { key: item.permissionKey } });
        if (!perm) {
          throw new AppError(`Permission "${item.permissionKey}" not found`, 404);
        }

        await tx.rolePermission.upsert({
          where: {
            roleId_permissionId: {
              roleId: role.id,
              permissionId: perm.id,
            },
          },
          update: { allowed: item.allowed },
          create: {
            roleId: role.id,
            permissionId: perm.id,
            allowed: item.allowed,
          },
        });
      }
    });

    AuditService.log({
      userId: req.user!.userId,
      action: 'ROLE_PERMISSIONS_CHANGED',
      entityType: 'ROLE',
      entityId: role.id,
      metadata: { roleName: role.name, count: permissions.length },
    });

    sendSuccess(res, null, `Permissions for role "${role.name}" updated successfully`);
  }
);

export default rolesRouter;
