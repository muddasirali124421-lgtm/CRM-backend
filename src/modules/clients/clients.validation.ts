import { ClientStatus } from '@prisma/client';
import { z } from 'zod';

export const clientQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  search: z.string().trim().optional(),
  status: z.nativeEnum(ClientStatus).optional(),
  assignedToId: z.string().uuid('Invalid employee ID format').optional(),
  isConverted: z
    .enum(['true', 'false'])
    .transform((val) => val === 'true')
    .optional(),
  startDate: z.coerce.date().optional(),
  endDate: z.coerce.date().optional(),
  sortBy: z.enum(['createdAt', 'name', 'company', 'clientCode', 'status']).default('createdAt'),
  sortOrder: z.enum(['asc', 'desc']).default('desc'),
  compact: z
    .enum(['true', 'false'])
    .transform((val) => val === 'true')
    .optional(),
});

export const createClientSchema = z.object({
  name: z.string().trim().min(1, 'Client name is required').max(255),
  company: z.string().trim().max(255).optional(),
  email: z.string().trim().email('Invalid email address format').toLowerCase(),
  phone: z.string().trim().max(50).optional(),
  website: z.string().trim().max(255).optional(),
  addressLine1: z.string().trim().max(255).optional(),
  addressLine2: z.string().trim().max(255).optional(),
  city: z.string().trim().max(100).optional(),
  state: z.string().trim().max(100).optional(),
  country: z.string().trim().max(100).optional(),
  postalCode: z.string().trim().max(20).optional(),
  status: z.nativeEnum(ClientStatus).default(ClientStatus.ACTIVE),
  assignedToId: z.string().uuid('Invalid employee ID format').optional(),
});

export const updateClientSchema = z.object({
  name: z.string().trim().min(1, 'Client name cannot be empty').max(255).optional(),
  company: z.string().trim().max(255).nullable().optional(),
  email: z.string().trim().email('Invalid email address format').toLowerCase().optional(),
  phone: z.string().trim().max(50).nullable().optional(),
  website: z.string().trim().max(255).nullable().optional(),
  addressLine1: z.string().trim().max(255).nullable().optional(),
  addressLine2: z.string().trim().max(255).nullable().optional(),
  city: z.string().trim().max(100).nullable().optional(),
  state: z.string().trim().max(100).nullable().optional(),
  country: z.string().trim().max(100).nullable().optional(),
  postalCode: z.string().trim().max(20).nullable().optional(),
  status: z.nativeEnum(ClientStatus).optional(),
  assignedToId: z.string().uuid('Invalid employee ID format').nullable().optional(),
});

export const assignClientSchema = z.object({
  employeeId: z.string().uuid('Invalid employee ID format'),
});
