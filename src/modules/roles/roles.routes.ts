import { Response, Router } from 'express';
import prisma from '../../config/database';
import { authenticate, authorize } from '../../middleware/auth.middleware';
import { validateRequest } from '../../middleware/validate.middleware';
import { AuditService } from '../../services/audit.service';
import { AuthenticatedRequest } from '../../types/auth.types';
import { AppError, asyncHandler, sendSuccess } from '../../utils/api-response';
import {
  createRoleSchema,
  updateRolePermissionsSchema,
  updateRoleSchema,
} from './roles.validation';

export const rolesRouter = Router();

rolesRouter.use(authenticate);

/**
 * GET /api/roles
 * List all roles for role selection & administration
 */
rolesRouter.get(
  '/',
  asyncHandler(async (_req: AuthenticatedRequest, res: Response) => {
    const roles = await prisma.role.findMany({
      select: {
        id: true,
        name: true,
        description: true,
        isSuperAdmin: true,
        isSystem: true,
        createdAt: true,
        _count: {
          select: {
            users: true,
            rolePermissions: true,
          },
        },
      },
      orderBy: {
        name: 'asc',
      },
    });

    const formatted = roles.map((r: any) => ({
      id: r.id,
      name: r.name,
      description: r.description,
      isSuperAdmin: r.isSuperAdmin,
      isSystem: r.isSystem,
      userCount: r._count.users,
      configuredPermissionsCount: r._count.rolePermissions,
      createdAt: r.createdAt,
    }));

    sendSuccess(res, formatted, 'Roles retrieved successfully');
  })
);

/**
 * GET /api/roles/:id
 * Retrieve detailed role profile
 */
rolesRouter.get(
  '/:id',
  asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const role = await prisma.role.findUnique({
      where: { id: req.params.id },
      include: {
        _count: {
          select: { users: true },
        },
        rolePermissions: {
          include: { permission: true },
        },
      },
    });

    if (!role) {
      throw new AppError('Role not found', 404);
    }

    sendSuccess(
      res,
      {
        id: role.id,
        name: role.name,
        description: role.description,
        isSuperAdmin: role.isSuperAdmin,
        isSystem: role.isSystem,
        userCount: role._count.users,
        permissions: role.rolePermissions.map((rp: any) => ({
          key: rp.permission.key,
          module: rp.permission.module,
          action: rp.permission.action,
          allowed: rp.allowed,
        })),
        createdAt: role.createdAt,
        updatedAt: role.updatedAt,
      },
      'Role details retrieved successfully'
    );
  })
);

/**
 * POST /api/roles
 * Create a new custom role
 */
rolesRouter.post(
  '/',
  authorize('settings.manage_roles'),
  validateRequest({ body: createRoleSchema }),
  asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const { name, description } = req.body;

    const existing = await prisma.role.findUnique({ where: { name } });
    if (existing) {
      throw new AppError(`A role with name "${name}" already exists`, 409);
    }

    const role = await prisma.role.create({
      data: {
        name,
        description: description || null,
        isSystem: false,
        isSuperAdmin: false,
      },
    });

    await AuditService.log({
      userId: req.user!.userId,
      action: 'ROLE_CREATED',
      entityType: 'ROLE',
      entityId: role.id,
      metadata: { roleName: role.name },
      ipAddress: req.ip,
      userAgent: req.headers['user-agent'],
    });

    sendSuccess(res, role, `Role "${role.name}" created successfully`, 201);
  })
);

/**
 * PATCH /api/roles/:id
 * Update role name or description
 */
rolesRouter.patch(
  '/:id',
  authorize('settings.manage_roles'),
  validateRequest({ body: updateRoleSchema }),
  asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const roleId = req.params.id;
    const { name, description } = req.body;

    const role = await prisma.role.findUnique({ where: { id: roleId } });
    if (!role) {
      throw new AppError('Role not found', 404);
    }

    // Protect Super Admin role from renaming
    if (role.isSuperAdmin && name && name !== role.name) {
      throw new AppError('Super Admin role name is protected and cannot be changed', 403);
    }

    // Check unique name
    if (name && name !== role.name) {
      const existing = await prisma.role.findUnique({ where: { name } });
      if (existing) {
        throw new AppError(`A role with name "${name}" already exists`, 409);
      }
    }

    const updated = await prisma.role.update({
      where: { id: roleId },
      data: {
        ...(name ? { name } : {}),
        ...(description !== undefined ? { description: description || null } : {}),
      },
    });

    await AuditService.log({
      userId: req.user!.userId,
      action: 'ROLE_UPDATED',
      entityType: 'ROLE',
      entityId: updated.id,
      metadata: { roleName: updated.name, previousName: role.name },
      ipAddress: req.ip,
      userAgent: req.headers['user-agent'],
    });

    sendSuccess(res, updated, `Role "${updated.name}" updated successfully`);
  })
);

/**
 * DELETE /api/roles/:id
 * Delete a custom role with strict Super Admin and active-user safeguards
 */
rolesRouter.delete(
  '/:id',
  authorize('settings.manage_roles'),
  asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const roleId = req.params.id;

    const role = await prisma.role.findUnique({
      where: { id: roleId },
      include: {
        _count: { select: { users: true } },
      },
    });

    if (!role) {
      throw new AppError('Role not found', 404);
    }

    // 1. Critical Safeguard: Super Admin role can NEVER be deleted
    if (role.isSuperAdmin) {
      throw new AppError('The Super Admin role is protected and cannot be deleted.', 403);
    }

    // 2. Safeguard: System roles cannot be deleted
    if (role.isSystem) {
      throw new AppError('System-defined roles cannot be deleted.', 403);
    }

    // 3. Safeguard: In-use roles cannot be deleted
    if (role._count.users > 0) {
      throw new AppError(
        `Cannot delete role "${role.name}": it is currently assigned to ${role._count.users} active user(s). Reassign users first.`,
        400
      );
    }

    // Cascade delete role permissions and delete role
    await prisma.$transaction(async (tx: any) => {
      await tx.rolePermission.deleteMany({ where: { roleId: role.id } });
      await tx.role.delete({ where: { id: role.id } });
    });

    await AuditService.log({
      userId: req.user!.userId,
      action: 'ROLE_DELETED',
      entityType: 'ROLE',
      entityId: role.id,
      metadata: { roleName: role.name },
      ipAddress: req.ip,
      userAgent: req.headers['user-agent'],
    });

    sendSuccess(res, null, `Role "${role.name}" deleted successfully`);
  })
);

/**
 * GET /api/roles/:id/permissions
 * List all capability permissions with allowed status for the role
 */
rolesRouter.get(
  '/:id/permissions',
  authorize('settings.manage_permissions'),
  asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
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

    const permissions = allPermissions.map((p: any) => ({
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
  })
);

/**
 * PUT /api/roles/:id/permissions
 * Update configured permissions for a non-Super-Admin role
 */
rolesRouter.put(
  '/:id/permissions',
  authorize('settings.manage_permissions'),
  validateRequest({ body: updateRolePermissionsSchema }),
  asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
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
    await prisma.$transaction(async (tx: any) => {
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

    await AuditService.log({
      userId: req.user!.userId,
      action: 'ROLE_PERMISSIONS_CHANGED',
      entityType: 'ROLE',
      entityId: role.id,
      metadata: { roleName: role.name, count: permissions.length },
      ipAddress: req.ip,
      userAgent: req.headers['user-agent'],
    });

    sendSuccess(res, null, `Permissions for role "${role.name}" updated successfully`);
  })
);

export default rolesRouter;
