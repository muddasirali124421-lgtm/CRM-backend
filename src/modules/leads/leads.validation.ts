import { LeadStatus, PriorityLevel } from '@prisma/client';
import { z } from 'zod';

export const leadQuerySchema = z.object({
  page: z
    .string()
    .optional()
    .transform((val) => (val ? Math.max(1, parseInt(val, 10)) : 1)),
  limit: z
    .string()
    .optional()
    .transform((val) => (val ? Math.min(100, Math.max(1, parseInt(val, 10))) : 20)),
  search: z.string().trim().optional(),
  status: z.nativeEnum(LeadStatus).optional(),
  priority: z.nativeEnum(PriorityLevel).optional(),
  source: z.string().trim().optional(),
  assignedToId: z.string().uuid().optional(),
  followUp: z.enum(['overdue', 'today', 'upcoming']).optional(),
  startDate: z
    .string()
    .optional()
    .transform((val) => (val ? new Date(val) : undefined)),
  endDate: z
    .string()
    .optional()
    .transform((val) => (val ? new Date(val) : undefined)),
  sortBy: z
    .enum(['createdAt', 'followUpAt', 'estimatedValue', 'firstName', 'lastName', 'leadCode'])
    .default('createdAt'),
  sortOrder: z.enum(['asc', 'desc']).default('desc'),
});

export const createLeadSchema = z.object({
  firstName: z.string().trim().min(1, 'First name is required').max(100),
  lastName: z.string().trim().min(1, 'Last name is required').max(100),
  company: z.string().trim().max(150).optional(),
  email: z.string().trim().email('Valid email is required').max(255),
  phone: z.string().trim().max(50).optional(),
  source: z.string().trim().max(100).optional(),
  status: z
    .nativeEnum(LeadStatus)
    .refine((val) => val !== LeadStatus.CONVERTED, {
      message: 'Status cannot be set to CONVERTED upon creation. Please use the conversion workflow.',
    })
    .default(LeadStatus.NEW),
  priority: z.nativeEnum(PriorityLevel).default(PriorityLevel.MEDIUM),
  assignedToId: z.string().uuid('Valid employee ID required').optional(),
  estimatedValue: z.number().nonnegative('Estimated value must be non-negative').optional(),
  followUpAt: z
    .string()
    .or(z.date())
    .transform((val) => (typeof val === 'string' ? new Date(val) : val))
    .optional(),
  notes: z.string().max(5000).optional(),
});

export const updateLeadSchema = z.object({
  firstName: z.string().trim().min(1).max(100).optional(),
  lastName: z.string().trim().min(1).max(100).optional(),
  company: z.string().trim().max(150).nullable().optional(),
  email: z.string().trim().email('Valid email is required').max(255).optional(),
  phone: z.string().trim().max(50).nullable().optional(),
  source: z.string().trim().max(100).nullable().optional(),
  status: z
    .nativeEnum(LeadStatus)
    .refine((val) => val !== LeadStatus.CONVERTED, {
      message: 'Status cannot be manually changed to CONVERTED. Please use the /convert endpoint.',
    })
    .optional(),
  priority: z.nativeEnum(PriorityLevel).optional(),
  assignedToId: z.string().uuid('Valid employee ID required').nullable().optional(),
  estimatedValue: z.number().nonnegative('Estimated value must be non-negative').nullable().optional(),
  followUpAt: z
    .string()
    .or(z.date())
    .transform((val) => (typeof val === 'string' ? new Date(val) : val))
    .nullable()
    .optional(),
  notes: z.string().max(5000).nullable().optional(),
});

export const assignLeadSchema = z.object({
  employeeId: z.string().uuid('Valid employee ID required').nullable(),
});

export const convertLeadSchema = z.object({
  company: z.string().trim().max(150).optional(),
  website: z.string().trim().url('Website must be a valid URL').optional().or(z.literal('')),
  addressLine1: z.string().trim().max(255).optional(),
  addressLine2: z.string().trim().max(255).optional(),
  city: z.string().trim().max(100).optional(),
  state: z.string().trim().max(100).optional(),
  country: z.string().trim().max(100).optional(),
  postalCode: z.string().trim().max(20).optional(),
});
