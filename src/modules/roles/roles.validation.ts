import { z } from 'zod';

export const updateRolePermissionsSchema = z.object({
  permissions: z.array(
    z.object({
      permissionKey: z.string().min(1, 'Permission key is required'),
      allowed: z.boolean(),
    })
  ),
});
