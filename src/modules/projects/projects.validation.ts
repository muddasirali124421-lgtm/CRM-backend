import { PriorityLevel, ProjectStatus } from '@prisma/client';
import { z } from 'zod';

export const projectQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  search: z.string().trim().optional(),
  status: z.nativeEnum(ProjectStatus).optional(),
  priority: z.nativeEnum(PriorityLevel).optional(),
  clientId: z.string().uuid('Invalid client ID format').optional(),
  managerId: z.string().uuid('Invalid manager ID format').optional(),
  teamMemberId: z.string().uuid('Invalid team member ID format').optional(),
  startDateFrom: z.coerce.date().optional(),
  startDateTo: z.coerce.date().optional(),
  dueDateFrom: z.coerce.date().optional(),
  dueDateTo: z.coerce.date().optional(),
  sortBy: z
    .enum(['createdAt', 'name', 'projectCode', 'status', 'priority', 'startDate', 'dueDate', 'budget'])
    .default('createdAt'),
  sortOrder: z.enum(['asc', 'desc']).default('desc'),
});

export const createProjectSchema = z
  .object({
    name: z.string().trim().min(1, 'Project name is required').max(255),
    clientId: z.string().uuid('Valid client ID is required'),
    description: z.string().trim().optional(),
    status: z.nativeEnum(ProjectStatus).default(ProjectStatus.PLANNING),
    priority: z.nativeEnum(PriorityLevel).default(PriorityLevel.MEDIUM),
    startDate: z.coerce.date().optional(),
    dueDate: z.coerce.date().optional(),
    budget: z.coerce.number().min(0, 'Budget must be greater than or equal to 0').optional(),
    currency: z.string().trim().max(10).default('USD'),
    managerId: z.string().uuid('Invalid manager ID format').optional(),
    memberIds: z.array(z.string().uuid('Invalid member ID format')).optional(),
  })
  .refine(
    (data) => {
      if (data.startDate && data.dueDate) {
        return data.dueDate >= data.startDate;
      }
      return true;
    },
    {
      message: 'Due date cannot be earlier than start date',
      path: ['dueDate'],
    }
  );

export const updateProjectSchema = z
  .object({
    name: z.string().trim().min(1, 'Project name cannot be empty').max(255).optional(),
    clientId: z.string().uuid('Invalid client ID format').optional(),
    description: z.string().trim().nullable().optional(),
    status: z.nativeEnum(ProjectStatus).optional(),
    priority: z.nativeEnum(PriorityLevel).optional(),
    startDate: z.coerce.date().nullable().optional(),
    dueDate: z.coerce.date().nullable().optional(),
    completedAt: z.coerce.date().nullable().optional(),
    budget: z.coerce.number().min(0, 'Budget must be greater than or equal to 0').nullable().optional(),
    currency: z.string().trim().max(10).optional(),
    managerId: z.string().uuid('Invalid manager ID format').nullable().optional(),
  })
  .refine(
    (data) => {
      if (data.startDate && data.dueDate) {
        return data.dueDate >= data.startDate;
      }
      return true;
    },
    {
      message: 'Due date cannot be earlier than start date',
      path: ['dueDate'],
    }
  );

export const assignManagerSchema = z.object({
  employeeId: z.string().uuid('Invalid employee ID format').nullable(),
});

export const addTeamMemberSchema = z.object({
  employeeId: z.string().uuid('Invalid employee ID format'),
  projectRole: z.string().trim().max(50).default('MEMBER'),
});
