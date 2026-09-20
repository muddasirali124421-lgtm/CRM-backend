import { z } from 'zod';

export const createRoleSchema = z
  .object({
    name: z
      .string()
      .trim()
      .min(2, 'Role name must be at least 2 characters')
      .max(50, 'Role name cannot exceed 50 characters'),
    description: z
      .string()
      .trim()
      .max(255, 'Description cannot exceed 255 characters')
      .optional(),
  })
  .strict();

export const updateRoleSchema = z
  .object({
    name: z
      .string()
      .trim()
      .min(2, 'Role name must be at least 2 characters')
      .max(50, 'Role name cannot exceed 50 characters')
      .optional(),
    description: z
      .string()
      .trim()
      .max(255, 'Description cannot exceed 255 characters')
      .optional(),
  })
  .strict();

export const updateRolePermissionsSchema = z.object({
  permissions: z.array(
    z.object({
      permissionKey: z.string().min(1, 'Permission key is required'),
      allowed: z.boolean(),
    })
  ),
});
