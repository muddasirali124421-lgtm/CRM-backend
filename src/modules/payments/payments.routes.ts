import { Router } from 'express';
import { authenticate, authorize } from '../../middleware/auth.middleware';
import { validateRequest } from '../../middleware/validate.middleware';
import { InvoicesController, PaymentsController } from './payments.controller';
import {
  createInvoiceSchema,
  financialSummaryQuerySchema,
  invoiceQuerySchema,
  paymentQuerySchema,
  recordPaymentSchema,
  updateInvoiceSchema,
  updatePaymentSchema,
} from './payments.validation';

// ============================================================================
// INVOICES ROUTER (/api/invoices)
// ============================================================================

export const invoicesRouter = Router();
invoicesRouter.use(authenticate);

// 1. List invoices
invoicesRouter.get(
  '/',
  authorize('payments.view'),
  validateRequest({ query: invoiceQuerySchema }),
  InvoicesController.listInvoices
);

// 2. Create invoice
invoicesRouter.post(
  '/',
  authorize('payments.create_invoice', 'payments.create'),
  validateRequest({ body: createInvoiceSchema }),
  InvoicesController.createInvoice
);

// 3. Invoice details
invoicesRouter.get(
  '/:id',
  authorize('payments.view'),
  InvoicesController.getInvoiceById
);

// 4. Update invoice
invoicesRouter.patch(
  '/:id',
  authorize('payments.edit_invoice', 'payments.edit'),
  validateRequest({ body: updateInvoiceSchema }),
  InvoicesController.updateInvoice
);

// 5. Delete or cancel invoice
invoicesRouter.delete(
  '/:id',
  authorize('payments.cancel_invoice', 'payments.delete'),
  InvoicesController.deleteInvoice
);

// 6. Record payment against invoice
invoicesRouter.post(
  '/:id/payments',
  authorize('payments.record_payment', 'payments.create'),
  validateRequest({ body: recordPaymentSchema }),
  InvoicesController.recordPayment
);

// ============================================================================
// PAYMENTS ROUTER (/api/payments)
// ============================================================================

export const paymentsRouter = Router();
paymentsRouter.use(authenticate);

// 1. List payments
paymentsRouter.get(
  '/',
  authorize('payments.view'),
  validateRequest({ query: paymentQuerySchema }),
  PaymentsController.listPayments
);

// 2. Financial summary (must precede /:id)
paymentsRouter.get(
  '/summary',
  authorize('payments.view'),
  validateRequest({ query: financialSummaryQuerySchema }),
  PaymentsController.getFinancialSummary
);

// 3. Payment details
paymentsRouter.get(
  '/:id',
  authorize('payments.view'),
  PaymentsController.getPaymentById
);

// 4. Edit payment
paymentsRouter.patch(
  '/:id',
  authorize('payments.record_payment', 'payments.edit'),
  validateRequest({ body: updatePaymentSchema }),
  PaymentsController.updatePayment
);

// 5. Delete payment
paymentsRouter.delete(
  '/:id',
  authorize('payments.cancel_invoice', 'payments.delete', 'payments.record_payment'),
  PaymentsController.deletePayment
);
