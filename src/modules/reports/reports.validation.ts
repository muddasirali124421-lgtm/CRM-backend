import { z } from 'zod';

export const baseReportQuerySchema = z.object({
  from: z
    .string()
    .refine((val) => !val || !isNaN(Date.parse(val)), {
      message: "Invalid 'from' date format. Use ISO 8601 or YYYY-MM-DD.",
    })
    .optional(),
  to: z
    .string()
    .refine((val) => !val || !isNaN(Date.parse(val)), {
      message: "Invalid 'to' date format. Use ISO 8601 or YYYY-MM-DD.",
    })
    .optional(),
  preset: z.enum(['7d', '30d', '90d', 'this_month', 'this_year']).optional(),
  groupBy: z.enum(['day', 'week', 'month']).optional(),
});

export const projectsReportQuerySchema = baseReportQuerySchema.extend({
  clientId: z.string().uuid('Invalid clientId UUID').optional(),
});

export const tasksReportQuerySchema = baseReportQuerySchema.extend({
  projectId: z.string().uuid('Invalid projectId UUID').optional(),
  employeeId: z.string().uuid('Invalid employeeId UUID').optional(),
});

export const employeesReportQuerySchema = z.object({
  departmentId: z.string().uuid('Invalid departmentId UUID').optional(),
});

export const financialReportQuerySchema = baseReportQuerySchema.extend({
  clientId: z.string().uuid('Invalid clientId UUID').optional(),
});

export const exportReportParamsSchema = z.object({
  reportType: z.enum(['leads', 'clients', 'projects', 'tasks', 'employees', 'financial'], {
    message: "Invalid reportType. Supported: 'leads', 'clients', 'projects', 'tasks', 'employees', 'financial'",
  }),
});

export const exportReportQuerySchema = baseReportQuerySchema.extend({
  format: z.enum(['csv']).default('csv').optional(),
  clientId: z.string().uuid('Invalid clientId UUID').optional(),
  projectId: z.string().uuid('Invalid projectId UUID').optional(),
  employeeId: z.string().uuid('Invalid employeeId UUID').optional(),
  departmentId: z.string().uuid('Invalid departmentId UUID').optional(),
});
