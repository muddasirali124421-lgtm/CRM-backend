import { PriorityLevel, TaskStatus } from '@prisma/client';
import { z } from 'zod';

export const taskQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  search: z.string().trim().optional(),
  status: z.nativeEnum(TaskStatus).optional(),
  priority: z.nativeEnum(PriorityLevel).optional(),
  projectId: z.string().uuid('Invalid project ID format').optional(),
  clientId: z.string().uuid('Invalid client ID format').optional(),
  assigneeId: z.string().uuid('Invalid assignee ID format').optional(),
  createdById: z.string().uuid('Invalid creator ID format').optional(),
  dueDateFrom: z.coerce.date().optional(),
  dueDateTo: z.coerce.date().optional(),
  overdue: z
    .enum(['true', 'false'])
    .transform((val) => val === 'true')
    .optional(),
  sortBy: z
    .enum(['createdAt', 'updatedAt', 'title', 'taskCode', 'status', 'priority', 'startDate', 'dueDate'])
    .default('createdAt'),
  sortOrder: z.enum(['asc', 'desc']).default('desc'),
  view: z.enum(['list', 'kanban']).default('list'),
});

export const createTaskSchema = z
  .object({
    title: z.string().trim().min(1, 'Task title is required').max(255),
    description: z.string().trim().optional(),
    projectId: z.string().uuid('Valid project ID is required'),
    clientId: z.string().uuid('Invalid client ID format').optional(),
    status: z.nativeEnum(TaskStatus).default(TaskStatus.TODO),
    priority: z.nativeEnum(PriorityLevel).default(PriorityLevel.MEDIUM),
    startDate: z.coerce.date().optional(),
    dueDate: z.coerce.date().optional(),
    assigneeIds: z.array(z.string().uuid('Invalid assignee ID format')).optional(),
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

export const updateTaskSchema = z
  .object({
    title: z.string().trim().min(1, 'Task title cannot be empty').max(255).optional(),
    description: z.string().trim().nullable().optional(),
    priority: z.nativeEnum(PriorityLevel).optional(),
    startDate: z.coerce.date().nullable().optional(),
    dueDate: z.coerce.date().nullable().optional(),
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

export const updateTaskStatusSchema = z.object({
  status: z.nativeEnum(TaskStatus, {
    errorMap: () => ({ message: 'Invalid task status. Must be TODO, IN_PROGRESS, QA, REVISION, or COMPLETED' }),
  }),
});

export const addAssigneeSchema = z.object({
  employeeId: z.string().uuid('Valid employee ID is required'),
});

export const createChecklistSchema = z.object({
  title: z.string().trim().min(1, 'Checklist item title is required').max(255),
  isCompleted: z.boolean().default(false).optional(),
  position: z.number().int().min(0).optional(),
});

export const updateChecklistSchema = z.object({
  title: z.string().trim().min(1, 'Checklist item title cannot be empty').max(255).optional(),
  isCompleted: z.boolean().optional(),
  position: z.number().int().min(0).optional(),
});

export const reorderChecklistSchema = z.object({
  itemIds: z.array(z.string().uuid('Invalid item ID format')).min(1, 'At least one item ID is required to reorder'),
});

export const createSubtaskSchema = z
  .object({
    title: z.string().trim().min(1, 'Subtask title is required').max(255),
    description: z.string().trim().optional(),
    priority: z.nativeEnum(PriorityLevel).default(PriorityLevel.MEDIUM),
    startDate: z.coerce.date().optional(),
    dueDate: z.coerce.date().optional(),
    assigneeIds: z.array(z.string().uuid('Invalid assignee ID format')).optional(),
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

export const createCommentSchema = z.object({
  content: z.string().trim().min(1, 'Comment content cannot be empty').max(5000),
  parentId: z.string().uuid('Invalid parent comment ID format').optional(),
});

export const updateCommentSchema = z.object({
  content: z.string().trim().min(1, 'Comment content cannot be empty').max(5000),
});
