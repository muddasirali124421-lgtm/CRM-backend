import { EmploymentStatus, UserAccountStatus } from '@prisma/client';
import { z } from 'zod';

export const employeeQuerySchema = z.object({
  page: z
    .string()
    .optional()
    .transform((val) => (val ? Math.max(1, parseInt(val, 10)) : 1)),
  limit: z
    .string()
    .optional()
    .transform((val) => (val ? Math.min(100, Math.max(1, parseInt(val, 10))) : 20)),
  search: z.string().trim().optional(),
  status: z.nativeEnum(EmploymentStatus).optional(),
  departmentId: z.string().uuid().optional(),
  roleId: z.string().uuid().optional(),
  sortBy: z.enum(['createdAt', 'firstName', 'lastName', 'employeeCode', 'joiningDate']).default('createdAt'),
  sortOrder: z.enum(['asc', 'desc']).default('desc'),
});

export const createEmployeeSchema = z.object({
  firstName: z.string().trim().min(1, 'First name is required').max(100),
  lastName: z.string().trim().min(1, 'Last name is required').max(100),
  email: z.string().trim().email('Valid email address is required').max(255),
  phone: z.string().trim().max(50).optional(),
  jobTitle: z.string().trim().min(1, 'Job title is required').max(100),
  departmentId: z.string().uuid('Valid department ID is required').optional(),
  joiningDate: z
    .string()
    .or(z.date())
    .transform((val) => (typeof val === 'string' ? new Date(val) : val)),
  employmentStatus: z.nativeEnum(EmploymentStatus).default(EmploymentStatus.ACTIVE),
  profileImage: z.string().url('Profile image must be a valid URL').optional().or(z.literal('')),
});

export const updateEmployeeSchema = z.object({
  firstName: z.string().trim().min(1).max(100).optional(),
  lastName: z.string().trim().min(1).max(100).optional(),
  phone: z.string().trim().max(50).nullable().optional(),
  jobTitle: z.string().trim().min(1).max(100).optional(),
  departmentId: z.string().uuid().nullable().optional(),
  joiningDate: z
    .string()
    .or(z.date())
    .transform((val) => (typeof val === 'string' ? new Date(val) : val))
    .optional(),
  employmentStatus: z.nativeEnum(EmploymentStatus).optional(),
  profileImage: z.string().url().nullable().optional().or(z.literal('')),
});

export const createEmployeeAccountSchema = z.object({
  loginEmail: z.string().trim().email('Valid login email is required').max(255),
  temporaryPassword: z
    .string()
    .min(10, 'Temporary password must be at least 10 characters')
    .refine((val) => /[A-Z]/.test(val), 'Must contain at least one uppercase letter')
    .refine((val) => /[a-z]/.test(val), 'Must contain at least one lowercase letter')
    .refine((val) => /[0-9!@#$%^&*()_+\-=[\]{};':"\\|,.<>/?]/.test(val), 'Must contain at least one number or special character'),
  roleId: z.string().uuid('Valid role ID is required'),
});

export const updateEmployeeAccountSchema = z.object({
  loginEmail: z.string().trim().email('Valid login email is required').max(255).optional(),
  roleId: z.string().uuid('Valid role ID is required').optional(),
  accountStatus: z.nativeEnum(UserAccountStatus).optional(),
});

export const resetPasswordSchema = z.object({
  newTemporaryPassword: z
    .string()
    .min(10, 'New temporary password must be at least 10 characters')
    .refine((val) => /[A-Z]/.test(val), 'Must contain at least one uppercase letter')
    .refine((val) => /[a-z]/.test(val), 'Must contain at least one lowercase letter')
    .refine((val) => /[0-9!@#$%^&*()_+\-=[\]{};':"\\|,.<>/?]/.test(val), 'Must contain at least one number or special character'),
});

export const updatePermissionsSchema = z.object({
  overrides: z.array(
    z.object({
      permissionKey: z.string().min(1, 'Permission key is required'),
      allowed: z.boolean().nullable(), // true = ALLOW, false = DENY, null = REMOVE override
    })
  ),
});
