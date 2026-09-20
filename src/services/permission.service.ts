import prisma from '../config/database';
import { AuthenticatedUser } from '../types/auth.types';
import { PermissionString } from '../types/permissions.types';

/**
 * Central Capability-Based Permission Service
 *
 * Enforcement Hierarchy:
 * 1. IF role.isSuperAdmin === true -> ALLOW (Root bypass)
 * 2. ELSE IF UserPermissionOverride exists -> use override.allowed (Explicit grant or revoke)
 * 3. ELSE IF RolePermission exists -> use rolePermission.allowed
 * 4. ELSE -> DENY (Default secure deny)
 */
export class PermissionService {
  /**
   * Calculate all effective permission keys for a given user.
   * - For Super Admin: returns all registered system permissions.
   * - For all other roles: combines role permissions with user overrides.
   */
  public static async getEffectivePermissions(userId: string): Promise<string[]> {
    const user = await prisma.user.findUnique({
      where: { id: userId },
      include: {
        role: {
          include: {
            rolePermissions: {
              include: {
                permission: true,
              },
            },
          },
        },
        permissionOverrides: {
          include: {
            permission: true,
          },
        },
      },
    });

    if (!user) {
      return [];
    }

    // 1. Super Admin receives all registered capabilities
    if (user.role.isSuperAdmin) {
      const allPermissions = await prisma.permission.findMany({
        select: { key: true },
        orderBy: { key: 'asc' },
      });
      return allPermissions.map((p) => p.key);
    }

    // 2. Map role-assigned permissions
    const effectiveMap = new Map<string, boolean>();

    for (const rp of user.role.rolePermissions) {
      effectiveMap.set(rp.permission.key, rp.allowed);
    }

    // 3. Apply individual user permission overrides (precedence over role)
    for (const override of user.permissionOverrides) {
      effectiveMap.set(override.permission.key, override.allowed);
    }

    // 4. Return array of granted permission keys
    const grantedPermissions: string[] = [];
    for (const [key, allowed] of effectiveMap.entries()) {
      if (allowed) {
        grantedPermissions.push(key);
      }
    }

    return grantedPermissions.sort();
  }

  /**
   * Check if an authenticated user has a specific permission capability.
   */
  public static hasPermission(user: AuthenticatedUser, permissionKey: string): boolean {
    // 1. Super Admin bypass (ONLY via isSuperAdmin === true flag, never by role name string)
    if (user.isSuperAdmin) {
      return true;
    }

    // 2. Capability check against user's effective permissions set
    return user.permissions.has(permissionKey as PermissionString);
  }
}
