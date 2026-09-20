import { InvoiceStatus } from '@prisma/client';
import { z } from 'zod';

export const invoiceItemInputSchema = z.object({
  description: z.string().trim().min(1, 'Item description is required').max(500),
  quantity: z
    .union([z.number(), z.string()])
    .refine((val) => Number(val) > 0, { message: 'Quantity must be greater than 0' }),
  unitPrice: z
    .union([z.number(), z.string()])
    .refine((val) => Number(val) >= 0, { message: 'Unit price must be greater than or equal to 0' }),
  taxRate: z
    .union([z.number(), z.string()])
    .refine((val) => Number(val) >= 0 && Number(val) <= 100, {
      message: 'Tax rate must be between 0 and 100 percent',
    })
    .optional(),
  position: z.number().int().min(0).optional(),
});

export const createInvoiceSchema = z
  .object({
    clientId: z.string().uuid('Valid client ID is required'),
    projectId: z.string().uuid('Invalid project ID format').optional(),
    issueDate: z.coerce.date({ required_error: 'Issue date is required' }),
    dueDate: z.coerce.date({ required_error: 'Due date is required' }),
    currency: z.string().trim().min(1).max(10).default('USD'),
    notes: z.string().trim().optional(),
    discount: z
      .union([z.number(), z.string()])
      .refine((val) => Number(val) >= 0, { message: 'Discount must be greater than or equal to 0' })
      .optional(),
    tax: z
      .union([z.number(), z.string()])
      .refine((val) => Number(val) >= 0, { message: 'Tax must be greater than or equal to 0' })
      .optional(),
    status: z.nativeEnum(InvoiceStatus).default(InvoiceStatus.DRAFT),
    items: z.array(invoiceItemInputSchema).min(1, 'Invoice must have at least one line item'),
  })
  .refine((data) => data.dueDate >= data.issueDate, {
    message: 'Due date cannot be earlier than issue date',
    path: ['dueDate'],
  });

export const updateInvoiceSchema = z
  .object({
    clientId: z.string().uuid('Invalid client ID format').optional(),
    projectId: z.string().uuid('Invalid project ID format').nullable().optional(),
    issueDate: z.coerce.date().optional(),
    dueDate: z.coerce.date().optional(),
    currency: z.string().trim().min(1).max(10).optional(),
    status: z.nativeEnum(InvoiceStatus).optional(),
    notes: z.string().trim().nullable().optional(),
    discount: z
      .union([z.number(), z.string()])
      .refine((val) => Number(val) >= 0, { message: 'Discount must be greater than or equal to 0' })
      .optional(),
    tax: z
      .union([z.number(), z.string()])
      .refine((val) => Number(val) >= 0, { message: 'Tax must be greater than or equal to 0' })
      .optional(),
    items: z.array(invoiceItemInputSchema).min(1, 'Invoice must have at least one line item').optional(),
  })
  .refine(
    (data) => {
      if (data.issueDate && data.dueDate) {
        return data.dueDate >= data.issueDate;
      }
      return true;
    },
    {
      message: 'Due date cannot be earlier than issue date',
      path: ['dueDate'],
    }
  );

export const recordPaymentSchema = z.object({
  amount: z
    .union([z.number(), z.string()])
    .refine((val) => Number(val) > 0, { message: 'Payment amount must be greater than 0' }),
  paymentDate: z.coerce.date().optional(),
  paymentMethod: z.string().trim().min(1, 'Payment method is required').max(100),
  reference: z.string().trim().max(255).optional(),
  notes: z.string().trim().max(2000).optional(),
});

export const updatePaymentSchema = z.object({
  amount: z
    .union([z.number(), z.string()])
    .refine((val) => Number(val) > 0, { message: 'Payment amount must be greater than 0' })
    .optional(),
  paymentDate: z.coerce.date().optional(),
  paymentMethod: z.string().trim().min(1).max(100).optional(),
  reference: z.string().trim().max(255).nullable().optional(),
  notes: z.string().trim().max(2000).nullable().optional(),
});

export const invoiceQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  search: z.string().trim().optional(),
  status: z.nativeEnum(InvoiceStatus).optional(),
  clientId: z.string().uuid('Invalid client ID format').optional(),
  projectId: z.string().uuid('Invalid project ID format').optional(),
  issueDateFrom: z.coerce.date().optional(),
  issueDateTo: z.coerce.date().optional(),
  dueDateFrom: z.coerce.date().optional(),
  dueDateTo: z.coerce.date().optional(),
  overdue: z
    .enum(['true', 'false'])
    .transform((val) => val === 'true')
    .optional(),
  sortBy: z
    .enum(['createdAt', 'updatedAt', 'invoiceNumber', 'issueDate', 'dueDate', 'total', 'amountPaid', 'balanceDue', 'status'])
    .default('createdAt'),
  sortOrder: z.enum(['asc', 'desc']).default('desc'),
});

export const paymentQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  search: z.string().trim().optional(),
  clientId: z.string().uuid('Invalid client ID format').optional(),
  projectId: z.string().uuid('Invalid project ID format').optional(),
  invoiceId: z.string().uuid('Invalid invoice ID format').optional(),
  paymentMethod: z.string().trim().optional(),
  paymentDateFrom: z.coerce.date().optional(),
  paymentDateTo: z.coerce.date().optional(),
  sortBy: z.enum(['paymentDate', 'amount', 'createdAt']).default('paymentDate'),
  sortOrder: z.enum(['asc', 'desc']).default('desc'),
});

export const financialSummaryQuerySchema = z.object({
  clientId: z.string().uuid('Invalid client ID format').optional(),
  projectId: z.string().uuid('Invalid project ID format').optional(),
  startDate: z.coerce.date().optional(),
  endDate: z.coerce.date().optional(),
});
