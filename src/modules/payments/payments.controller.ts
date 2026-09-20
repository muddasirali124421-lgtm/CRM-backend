import { Response } from 'express';
import { AuthenticatedRequest } from '../../types/auth.types';
import { sendSuccess } from '../../utils/api-response';
import { PaymentsService } from './payments.service';

export class InvoicesController {
  public static async listInvoices(req: AuthenticatedRequest, res: Response): Promise<void> {
    const result = await PaymentsService.listInvoices(req.query as any);
    sendSuccess(res, result, 'Invoices retrieved successfully');
  }

  public static async getInvoiceById(req: AuthenticatedRequest, res: Response): Promise<void> {
    const invoice = await PaymentsService.getInvoiceById(req.params.id);
    sendSuccess(res, invoice, 'Invoice details retrieved successfully');
  }

  public static async createInvoice(req: AuthenticatedRequest, res: Response): Promise<void> {
    const invoice = await PaymentsService.createInvoice(req.body, req.user!);
    sendSuccess(res, invoice, 'Invoice created successfully', 201);
  }

  public static async updateInvoice(req: AuthenticatedRequest, res: Response): Promise<void> {
    const invoice = await PaymentsService.updateInvoice(req.params.id, req.body, req.user!);
    sendSuccess(res, invoice, 'Invoice updated successfully');
  }

  public static async deleteInvoice(req: AuthenticatedRequest, res: Response): Promise<void> {
    const result = await PaymentsService.deleteInvoice(req.params.id, req.user!);
    sendSuccess(res, result.cancelled ? { cancelled: true } : null, result.message);
  }

  public static async recordPayment(req: AuthenticatedRequest, res: Response): Promise<void> {
    const payment = await PaymentsService.recordPayment(req.params.id, req.body, req.user!);
    sendSuccess(res, payment, 'Payment recorded successfully', 201);
  }
}

export class PaymentsController {
  public static async listPayments(req: AuthenticatedRequest, res: Response): Promise<void> {
    const result = await PaymentsService.listPayments(req.query as any);
    sendSuccess(res, result, 'Payments retrieved successfully');
  }

  public static async getFinancialSummary(req: AuthenticatedRequest, res: Response): Promise<void> {
    const summary = await PaymentsService.getFinancialSummary(req.query as any);
    sendSuccess(res, summary, 'Financial summary retrieved successfully');
  }

  public static async getPaymentById(req: AuthenticatedRequest, res: Response): Promise<void> {
    const payment = await PaymentsService.getPaymentById(req.params.id);
    sendSuccess(res, payment, 'Payment details retrieved successfully');
  }

  public static async updatePayment(req: AuthenticatedRequest, res: Response): Promise<void> {
    const payment = await PaymentsService.updatePayment(req.params.id, req.body, req.user!);
    sendSuccess(res, payment, 'Payment updated successfully');
  }

  public static async deletePayment(req: AuthenticatedRequest, res: Response): Promise<void> {
    const result = await PaymentsService.deletePayment(req.params.id, req.user!);
    sendSuccess(res, null, result.message);
  }
}
