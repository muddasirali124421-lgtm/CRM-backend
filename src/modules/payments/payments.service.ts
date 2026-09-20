import { InvoiceStatus, Prisma } from '@prisma/client';
import prisma from '../../config/database';
import { AuditService } from '../../services/audit.service';
import { AuthenticatedUser } from '../../types/auth.types';
import { AppError } from '../../utils/api-response';
import { NotificationService } from '../notifications/notifications.service';
import { NotificationCategory } from '@prisma/client';
import {
  CreateInvoiceDTO,
  FinancialSummaryQuery,
  FinancialSummaryResponse,
  InvoiceFilterQuery,
  PaymentFilterQuery,
  RecordPaymentDTO,
  SafeClientSummary,
  SafeInvoiceDetailsResponse,
  SafeInvoiceItem,
  SafeInvoiceResponse,
  SafePaymentResponse,
  SafeProjectSummary,
  SafeUserSummary,
  UpdateInvoiceDTO,
  UpdatePaymentDTO,
} from './payments.types';

export class PaymentsService {
  /**
   * Collision-safe unique invoice number generator (e.g. INV-0001, INV-0002)
   */
  public static async generateNextInvoiceNumber(): Promise<string> {
    const invoices = await prisma.invoice.findMany({
      select: { invoiceNumber: true },
    });

    let maxNum = 0;
    for (const inv of invoices) {
      const match = inv.invoiceNumber.match(/INV-(\d+)/i);
      if (match && match[1]) {
        const num = parseInt(match[1], 10);
        if (!isNaN(num) && num > maxNum) {
          maxNum = num;
        }
      }
    }

    return `INV-${String(maxNum + 1).padStart(4, '0')}`;
  }

  /**
   * Compute dynamic overdue status for an invoice:
   * dueDate < now AND balanceDue > 0 AND status != PAID AND status != CANCELLED
   */
  public static calculateIsOverdue(dueDate: Date, balanceDue: Prisma.Decimal, status: InvoiceStatus): boolean {
    if (status === InvoiceStatus.PAID || status === InvoiceStatus.CANCELLED) {
      return false;
    }
    return new Date(dueDate).getTime() < Date.now() && balanceDue.greaterThan(0);
  }

  /**
   * Safe mapping for Client display
   */
  private static formatClient(client: any): SafeClientSummary {
    return {
      id: client.id,
      clientCode: client.clientCode,
      name: client.name,
      company: client.company ?? null,
      email: client.email,
      phone: client.phone ?? null,
    };
  }

  /**
   * Safe mapping for Project display
   */
  private static formatProject(project: any): SafeProjectSummary | null {
    if (!project) return null;
    return {
      id: project.id,
      projectCode: project.projectCode,
      name: project.name,
      status: project.status,
    };
  }

  /**
   * Safe mapping for User display
   */
  private static formatUser(user: any): SafeUserSummary | null {
    if (!user) return null;
    return {
      id: user.id,
      email: user.email,
      employee: user.employee
        ? {
            id: user.employee.id,
            employeeCode: user.employee.employeeCode,
            firstName: user.employee.firstName,
            lastName: user.employee.lastName,
            profileImage: user.employee.profileImage ?? null,
          }
        : null,
    };
  }

  /**
   * Safe mapping for InvoiceItem
   */
  private static formatInvoiceItem(item: any): SafeInvoiceItem {
    return {
      id: item.id,
      invoiceId: item.invoiceId,
      description: item.description,
      quantity: new Prisma.Decimal(item.quantity).toFixed(2),
      unitPrice: new Prisma.Decimal(item.unitPrice).toFixed(2),
      taxRate: new Prisma.Decimal(item.taxRate ?? 0).toFixed(2),
      lineTotal: new Prisma.Decimal(item.lineTotal).toFixed(2),
      position: item.position ?? 0,
    };
  }

  /**
   * Safe mapping for Payment
   */
  private static formatPayment(payment: any): SafePaymentResponse {
    return {
      id: payment.id,
      invoiceId: payment.invoiceId,
      invoiceNumber: payment.invoice?.invoiceNumber,
      amount: new Prisma.Decimal(payment.amount).toFixed(2),
      paymentDate: payment.paymentDate,
      paymentMethod: payment.paymentMethod,
      reference: payment.reference ?? null,
      notes: payment.notes ?? null,
      recordedById: payment.recordedById ?? null,
      recordedBy: this.formatUser(payment.recordedBy),
      client: payment.invoice?.client ? this.formatClient(payment.invoice.client) : undefined,
      project: payment.invoice?.project ? this.formatProject(payment.invoice.project) : undefined,
      createdAt: payment.createdAt,
    };
  }

  /**
   * Safe mapping for Invoice header summary
   */
  private static formatInvoice(invoice: any): SafeInvoiceResponse {
    const balanceDueDecimal = new Prisma.Decimal(invoice.balanceDue);
    const isOverdue = this.calculateIsOverdue(invoice.dueDate, balanceDueDecimal, invoice.status);

    return {
      id: invoice.id,
      invoiceNumber: invoice.invoiceNumber,
      clientId: invoice.clientId,
      client: this.formatClient(invoice.client),
      projectId: invoice.projectId ?? null,
      project: this.formatProject(invoice.project),
      status: invoice.status,
      issueDate: invoice.issueDate,
      dueDate: invoice.dueDate,
      currency: invoice.currency,
      subtotal: new Prisma.Decimal(invoice.subtotal).toFixed(2),
      discount: new Prisma.Decimal(invoice.discount).toFixed(2),
      tax: new Prisma.Decimal(invoice.tax).toFixed(2),
      total: new Prisma.Decimal(invoice.total).toFixed(2),
      amountPaid: new Prisma.Decimal(invoice.amountPaid).toFixed(2),
      balanceDue: balanceDueDecimal.toFixed(2),
      isOverdue,
      notes: invoice.notes ?? null,
      createdAt: invoice.createdAt,
      updatedAt: invoice.updatedAt,
      itemsCount: invoice.items?.length ?? invoice._count?.items,
      paymentsCount: invoice.payments?.length ?? invoice._count?.payments,
    };
  }

  // ==========================================================================
  // INVOICES
  // ==========================================================================

  /**
   * List Invoices with search, filters, pagination, and sorting
   */
  public static async listInvoices(
    query: InvoiceFilterQuery
  ): Promise<{ items: SafeInvoiceResponse[]; pagination: any }> {
    const {
      page = 1,
      limit = 20,
      search,
      status,
      clientId,
      projectId,
      issueDateFrom,
      issueDateTo,
      dueDateFrom,
      dueDateTo,
      overdue,
      sortBy = 'createdAt',
      sortOrder = 'desc',
    } = query;

    const where: Prisma.InvoiceWhereInput = {};

    if (search) {
      where.OR = [
        { invoiceNumber: { contains: search, mode: 'insensitive' } },
        { client: { name: { contains: search, mode: 'insensitive' } } },
        { client: { company: { contains: search, mode: 'insensitive' } } },
        { project: { name: { contains: search, mode: 'insensitive' } } },
      ];
    }

    if (status) where.status = status;
    if (clientId) where.clientId = clientId;
    if (projectId) where.projectId = projectId;

    if (issueDateFrom || issueDateTo) {
      where.issueDate = {};
      if (issueDateFrom) where.issueDate.gte = issueDateFrom;
      if (issueDateTo) where.issueDate.lte = issueDateTo;
    }

    if (dueDateFrom || dueDateTo) {
      where.dueDate = {};
      if (dueDateFrom) where.dueDate.gte = dueDateFrom;
      if (dueDateTo) where.dueDate.lte = dueDateTo;
    }

    if (overdue === true) {
      where.dueDate = { lt: new Date() };
      where.balanceDue = { gt: 0 };
      where.status = { notIn: [InvoiceStatus.PAID, InvoiceStatus.CANCELLED] };
    } else if (overdue === false) {
      where.OR = [
        { dueDate: { gte: new Date() } },
        { balanceDue: { lte: 0 } },
        { status: { in: [InvoiceStatus.PAID, InvoiceStatus.CANCELLED] } },
      ];
    }

    const [total, rawInvoices] = await Promise.all([
      prisma.invoice.count({ where }),
      prisma.invoice.findMany({
        where,
        include: {
          client: true,
          project: true,
          _count: {
            select: { items: true, payments: true },
          },
        },
        skip: (page - 1) * limit,
        take: limit,
        orderBy: { [sortBy]: sortOrder },
      }),
    ]);

    const items = rawInvoices.map((inv) => this.formatInvoice(inv));
    const totalPages = Math.ceil(total / limit);

    return {
      items,
      pagination: {
        page,
        limit,
        total,
        totalPages,
        hasNextPage: page < totalPages,
        hasPrevPage: page > 1,
      },
    };
  }

  /**
   * Get single Invoice Details with items, payments, client, project
   */
  public static async getInvoiceById(id: string): Promise<SafeInvoiceDetailsResponse> {
    const invoice = await prisma.invoice.findUnique({
      where: { id },
      include: {
        client: true,
        project: true,
        items: {
          orderBy: { position: 'asc' },
        },
        payments: {
          include: {
            recordedBy: {
              include: {
                employee: true,
              },
            },
          },
          orderBy: { paymentDate: 'desc' },
        },
      },
    });

    if (!invoice) {
      throw new AppError('Invoice not found', 404);
    }

    const base = this.formatInvoice(invoice);
    const items = invoice.items.map((it) => this.formatInvoiceItem(it));
    const payments = invoice.payments.map((pm) => this.formatPayment(pm));

    return {
      ...base,
      items,
      payments,
    };
  }

  /**
   * Create an Invoice with line items, server-calculated totals, and audit logging
   */
  public static async createInvoice(
    data: CreateInvoiceDTO,
    user: AuthenticatedUser
  ): Promise<SafeInvoiceDetailsResponse> {
    // 1. Verify client exists
    const client = await prisma.client.findUnique({ where: { id: data.clientId } });
    if (!client) {
      throw new AppError('Client not found', 404);
    }

    // 2. Verify project if supplied
    if (data.projectId) {
      const project = await prisma.project.findUnique({ where: { id: data.projectId } });
      if (!project) {
        throw new AppError('Project not found', 404);
      }
      if (project.clientId !== data.clientId) {
        throw new AppError('Selected project does not belong to the specified client', 400);
      }
    }

    // 3. Server-side calculation of line totals and invoice totals using Prisma.Decimal
    let subtotal = new Prisma.Decimal(0);
    const calculatedItems = data.items.map((item, index) => {
      const qty = new Prisma.Decimal(item.quantity);
      const price = new Prisma.Decimal(item.unitPrice);
      const taxRate = item.taxRate ? new Prisma.Decimal(item.taxRate) : new Prisma.Decimal(0);
      const lineTotal = new Prisma.Decimal(qty.times(price).toFixed(2));
      subtotal = subtotal.plus(lineTotal);

      return {
        description: item.description,
        quantity: qty,
        unitPrice: price,
        taxRate,
        lineTotal,
        position: item.position ?? index,
      };
    });

    const discount = data.discount ? new Prisma.Decimal(new Prisma.Decimal(data.discount).toFixed(2)) : new Prisma.Decimal(0);
    const tax = data.tax ? new Prisma.Decimal(new Prisma.Decimal(data.tax).toFixed(2)) : new Prisma.Decimal(0);

    let total = subtotal.minus(discount).plus(tax);
    if (total.isNegative()) {
      total = new Prisma.Decimal(0);
    }
    total = new Prisma.Decimal(total.toFixed(2));

    const amountPaid = new Prisma.Decimal(0);
    const balanceDue = total;

    // 4. Generate unique invoice number
    const invoiceNumber = await this.generateNextInvoiceNumber();

    // 5. Execute creation within a Prisma transaction
    const created = await prisma.$transaction(async (tx) => {
      const inv = await tx.invoice.create({
        data: {
          invoiceNumber,
          clientId: data.clientId,
          projectId: data.projectId ?? null,
          status: data.status ?? InvoiceStatus.DRAFT,
          issueDate: data.issueDate,
          dueDate: data.dueDate,
          currency: data.currency ?? 'USD',
          subtotal,
          discount,
          tax,
          total,
          amountPaid,
          balanceDue,
          notes: data.notes ?? null,
          items: {
            create: calculatedItems,
          },
        },
        include: {
          client: true,
          project: true,
          items: { orderBy: { position: 'asc' } },
          payments: true,
        },
      });

      return inv;
    });

    // 6. Record AuditLog entry
    await AuditService.log({
      userId: user.userId,
      action: 'INVOICE_CREATED',
      entityType: 'INVOICE',
      entityId: created.id,
      metadata: {
        invoiceNumber: created.invoiceNumber,
        clientId: created.clientId,
        total: created.total.toString(),
        currency: created.currency,
      },
    });

    return this.getInvoiceById(created.id);
  }

  /**
   * Update invoice fields and optionally line items with server recalculation
   */
  public static async updateInvoice(
    id: string,
    data: UpdateInvoiceDTO,
    user: AuthenticatedUser
  ): Promise<SafeInvoiceDetailsResponse> {
    const existing = await prisma.invoice.findUnique({
      where: { id },
      include: { items: true, payments: true },
    });

    if (!existing) {
      throw new AppError('Invoice not found', 404);
    }

    if (existing.status === InvoiceStatus.CANCELLED) {
      throw new AppError('Cannot edit a cancelled invoice', 400);
    }

    // Validate client & project if changing
    const resolvedClientId = data.clientId ?? existing.clientId;
    if (data.clientId) {
      const client = await prisma.client.findUnique({ where: { id: data.clientId } });
      if (!client) throw new AppError('Client not found', 404);
    }

    if (data.projectId !== undefined) {
      if (data.projectId) {
        const project = await prisma.project.findUnique({ where: { id: data.projectId } });
        if (!project) throw new AppError('Project not found', 404);
        if (project.clientId !== resolvedClientId) {
          throw new AppError('Selected project does not belong to the specified client', 400);
        }
      }
    }

    // Recalculate totals if items, tax, or discount are supplied
    let subtotal = new Prisma.Decimal(existing.subtotal);
    let discount = data.discount !== undefined ? new Prisma.Decimal(new Prisma.Decimal(data.discount).toFixed(2)) : new Prisma.Decimal(existing.discount);
    let tax = data.tax !== undefined ? new Prisma.Decimal(new Prisma.Decimal(data.tax).toFixed(2)) : new Prisma.Decimal(existing.tax);
    let calculatedItems: any[] | null = null;

    if (data.items && data.items.length > 0) {
      subtotal = new Prisma.Decimal(0);
      calculatedItems = data.items.map((item, index) => {
        const qty = new Prisma.Decimal(item.quantity);
        const price = new Prisma.Decimal(item.unitPrice);
        const taxRate = item.taxRate ? new Prisma.Decimal(item.taxRate) : new Prisma.Decimal(0);
        const lineTotal = new Prisma.Decimal(qty.times(price).toFixed(2));
        subtotal = subtotal.plus(lineTotal);

        return {
          description: item.description,
          quantity: qty,
          unitPrice: price,
          taxRate,
          lineTotal,
          position: item.position ?? index,
        };
      });
    }

    let total = subtotal.minus(discount).plus(tax);
    if (total.isNegative()) {
      total = new Prisma.Decimal(0);
    }
    total = new Prisma.Decimal(total.toFixed(2));

    // Ensure new total is not lower than already paid amount
    const amountPaid = new Prisma.Decimal(existing.amountPaid);
    if (total.lessThan(amountPaid)) {
      throw new AppError(
        `Cannot update invoice: new total (${total.toFixed(2)}) cannot be less than already recorded payments (${amountPaid.toFixed(2)})`,
        400
      );
    }

    const balanceDue = new Prisma.Decimal(total.minus(amountPaid).toFixed(2));

    // Derive status based on balanceDue
    let derivedStatus = data.status ?? existing.status;
    if (balanceDue.isZero()) {
      derivedStatus = InvoiceStatus.PAID;
    } else if (amountPaid.greaterThan(0)) {
      derivedStatus = InvoiceStatus.PARTIAL;
    }

    await prisma.$transaction(async (tx) => {
      if (calculatedItems) {
        // Replace items
        await tx.invoiceItem.deleteMany({ where: { invoiceId: id } });
        await tx.invoiceItem.createMany({
          data: calculatedItems.map((ci) => ({ ...ci, invoiceId: id })),
        });
      }

      await tx.invoice.update({
        where: { id },
        data: {
          clientId: data.clientId,
          projectId: data.projectId,
          issueDate: data.issueDate,
          dueDate: data.dueDate,
          currency: data.currency,
          status: derivedStatus,
          notes: data.notes,
          subtotal,
          discount,
          tax,
          total,
          balanceDue,
        },
      });
    });

    await AuditService.log({
      userId: user.userId,
      action: 'INVOICE_UPDATED',
      entityType: 'INVOICE',
      entityId: id,
      metadata: {
        invoiceNumber: existing.invoiceNumber,
        newTotal: total.toString(),
        newStatus: derivedStatus,
      },
    });

    return this.getInvoiceById(id);
  }

  /**
   * Delete or Cancel an Invoice safely:
   * If payments exist, hard delete is blocked; invoice is cancelled (status = CANCELLED).
   * If zero payments exist, invoice and items are safely deleted.
   */
  public static async deleteInvoice(
    id: string,
    user: AuthenticatedUser
  ): Promise<{ message: string; cancelled?: boolean; deleted?: boolean }> {
    const invoice = await prisma.invoice.findUnique({
      where: { id },
      include: { payments: true },
    });

    if (!invoice) {
      throw new AppError('Invoice not found', 404);
    }

    if (invoice.payments.length > 0) {
      if (invoice.status === InvoiceStatus.CANCELLED) {
        throw new AppError('Invoice is already cancelled', 400);
      }

      await prisma.invoice.update({
        where: { id },
        data: { status: InvoiceStatus.CANCELLED },
      });

      await AuditService.log({
        userId: user.userId,
        action: 'INVOICE_CANCELLED',
        entityType: 'INVOICE',
        entityId: id,
        metadata: {
          invoiceNumber: invoice.invoiceNumber,
          paymentsCount: invoice.payments.length,
          reason: 'Cancelled due to existing payment history',
        },
      });

      return {
        cancelled: true,
        message: `Invoice ${invoice.invoiceNumber} has payment history and was cancelled (status set to CANCELLED).`,
      };
    }

    // No payments: safely hard-delete invoice and line items
    await prisma.invoice.delete({ where: { id } });

    await AuditService.log({
      userId: user.userId,
      action: 'INVOICE_DELETED',
      entityType: 'INVOICE',
      entityId: id,
      metadata: {
        invoiceNumber: invoice.invoiceNumber,
      },
    });

    return {
      deleted: true,
      message: `Invoice ${invoice.invoiceNumber} deleted successfully.`,
    };
  }

  // ==========================================================================
  // PAYMENTS
  // ==========================================================================

  /**
   * Record a payment against an invoice transactionally:
   * - Validates payment amount > 0
   * - Prevents overpayment beyond balanceDue
   * - Recalculates amountPaid and balanceDue from persisted payments
   * - Updates invoice status (PARTIAL or PAID)
   * - Records AuditLog entry
   */
  public static async recordPayment(
    invoiceId: string,
    data: RecordPaymentDTO,
    user: AuthenticatedUser
  ): Promise<SafePaymentResponse> {
    const paymentAmount = new Prisma.Decimal(new Prisma.Decimal(data.amount).toFixed(2));

    if (paymentAmount.lessThanOrEqualTo(0)) {
      throw new AppError('Payment amount must be greater than zero', 400);
    }

    const result = await prisma.$transaction(async (tx) => {
      // 1. Fetch invoice with lock / fresh state
      const invoice = await tx.invoice.findUnique({
        where: { id: invoiceId },
        include: { client: true, project: true },
      });

      if (!invoice) {
        throw new AppError('Invoice not found', 404);
      }

      if (invoice.status === InvoiceStatus.CANCELLED) {
        throw new AppError('Cannot record payment against a cancelled invoice', 400);
      }

      const currentBalance = new Prisma.Decimal(invoice.balanceDue);
      if (paymentAmount.greaterThan(currentBalance)) {
        throw new AppError(
          `Payment amount (${paymentAmount.toFixed(2)}) exceeds outstanding balance (${currentBalance.toFixed(2)})`,
          400
        );
      }

      // 2. Create payment record
      const payment = await tx.payment.create({
        data: {
          invoiceId,
          amount: paymentAmount,
          paymentDate: data.paymentDate ?? new Date(),
          paymentMethod: data.paymentMethod,
          reference: data.reference ?? null,
          notes: data.notes ?? null,
          recordedById: user.userId,
        },
        include: {
          invoice: {
            include: {
              client: true,
              project: true,
            },
          },
          recordedBy: {
            include: {
              employee: true,
            },
          },
        },
      });

      // 3. Recalculate cumulative payments from database
      const allPayments = await tx.payment.findMany({
        where: { invoiceId },
        select: { amount: true },
      });

      const totalPaid = allPayments.reduce(
        (sum, p) => sum.plus(new Prisma.Decimal(p.amount)),
        new Prisma.Decimal(0)
      );

      const invoiceTotal = new Prisma.Decimal(invoice.total);
      const balanceDue = new Prisma.Decimal(invoiceTotal.minus(totalPaid).toFixed(2));

      // 4. Determine new invoice status
      let newStatus: InvoiceStatus = invoice.status;
      if (balanceDue.isZero()) {
        newStatus = InvoiceStatus.PAID;
      } else if (totalPaid.greaterThan(0)) {
        newStatus = InvoiceStatus.PARTIAL;
      }

      // 5. Update invoice financial state
      await tx.invoice.update({
        where: { id: invoiceId },
        data: {
          amountPaid: totalPaid,
          balanceDue,
          status: newStatus,
        },
      });

      return payment;
    });

    // 6. Record AuditLog entry
    await AuditService.log({
      userId: user.userId,
      action: 'PAYMENT_RECORDED',
      entityType: 'PAYMENT',
      entityId: result.id,
      metadata: {
        invoiceId: result.invoiceId,
        invoiceNumber: result.invoice.invoiceNumber,
        amount: paymentAmount.toString(),
        paymentMethod: result.paymentMethod,
      },
    });

    // Notify project manager or invoice creator if different from payer (failure-isolated)
    if (result.invoice.project?.managerId) {
      NotificationService.getUserIdForEmployee(result.invoice.project.managerId).then((recipientUserId) => {
        if (recipientUserId && recipientUserId !== user.userId) {
          NotificationService.createNotification({
            userId: recipientUserId,
            type: 'PAYMENT_RECORDED',
            title: `Payment Received: ${result.invoice.invoiceNumber}`,
            message: `A payment of ${result.invoice.currency} ${paymentAmount.toFixed(2)} was recorded for ${result.invoice.invoiceNumber}.`,
            entityType: 'PAYMENT',
            entityId: result.id,
            actorId: user.userId,
            category: NotificationCategory.PAYMENTS,
            metadata: {
              invoiceId: result.invoiceId,
              invoiceNumber: result.invoice.invoiceNumber,
              amount: paymentAmount.toString(),
            },
          }).catch(() => {});
        }
      }).catch(() => {});
    }

    return this.formatPayment(result);
  }

  /**
   * List Payments with search, client, project, invoice, date filters, sorting, and pagination
   */
  public static async listPayments(
    query: PaymentFilterQuery
  ): Promise<{ items: SafePaymentResponse[]; pagination: any }> {
    const {
      page = 1,
      limit = 20,
      search,
      clientId,
      projectId,
      invoiceId,
      paymentMethod,
      paymentDateFrom,
      paymentDateTo,
      sortBy = 'paymentDate',
      sortOrder = 'desc',
    } = query;

    const where: Prisma.PaymentWhereInput = {};

    if (search) {
      where.OR = [
        { reference: { contains: search, mode: 'insensitive' } },
        { notes: { contains: search, mode: 'insensitive' } },
        { invoice: { invoiceNumber: { contains: search, mode: 'insensitive' } } },
        { invoice: { client: { name: { contains: search, mode: 'insensitive' } } } },
        { invoice: { client: { company: { contains: search, mode: 'insensitive' } } } },
        { invoice: { project: { name: { contains: search, mode: 'insensitive' } } } },
      ];
    }

    if (invoiceId) where.invoiceId = invoiceId;
    if (paymentMethod) where.paymentMethod = paymentMethod;

    if (clientId || projectId) {
      where.invoice = {};
      if (clientId) where.invoice.clientId = clientId;
      if (projectId) where.invoice.projectId = projectId;
    }

    if (paymentDateFrom || paymentDateTo) {
      where.paymentDate = {};
      if (paymentDateFrom) where.paymentDate.gte = paymentDateFrom;
      if (paymentDateTo) where.paymentDate.lte = paymentDateTo;
    }

    const [total, rawPayments] = await Promise.all([
      prisma.payment.count({ where }),
      prisma.payment.findMany({
        where,
        include: {
          invoice: {
            include: {
              client: true,
              project: true,
            },
          },
          recordedBy: {
            include: {
              employee: true,
            },
          },
        },
        skip: (page - 1) * limit,
        take: limit,
        orderBy: { [sortBy]: sortOrder },
      }),
    ]);

    const items = rawPayments.map((pm) => this.formatPayment(pm));
    const totalPages = Math.ceil(total / limit);

    return {
      items,
      pagination: {
        page,
        limit,
        total,
        totalPages,
        hasNextPage: page < totalPages,
        hasPrevPage: page > 1,
      },
    };
  }

  /**
   * Get single Payment details
   */
  public static async getPaymentById(id: string): Promise<SafePaymentResponse> {
    const payment = await prisma.payment.findUnique({
      where: { id },
      include: {
        invoice: {
          include: {
            client: true,
            project: true,
          },
        },
        recordedBy: {
          include: {
            employee: true,
          },
        },
      },
    });

    if (!payment) {
      throw new AppError('Payment not found', 404);
    }

    return this.formatPayment(payment);
  }

  /**
   * Update Payment fields (amount, paymentDate, paymentMethod, reference, notes)
   * Recalculates invoice totals and status inside transaction
   */
  public static async updatePayment(
    id: string,
    data: UpdatePaymentDTO,
    user: AuthenticatedUser
  ): Promise<SafePaymentResponse> {
    const existing = await prisma.payment.findUnique({
      where: { id },
      include: { invoice: true },
    });

    if (!existing) {
      throw new AppError('Payment not found', 404);
    }

    const updated = await prisma.$transaction(async (tx) => {
      // 1. If amount changed, validate no overpayment
      if (data.amount !== undefined) {
        const newAmount = new Prisma.Decimal(new Prisma.Decimal(data.amount).toFixed(2));
        if (newAmount.lessThanOrEqualTo(0)) {
          throw new AppError('Payment amount must be greater than zero', 400);
        }

        const otherPayments = await tx.payment.findMany({
          where: { invoiceId: existing.invoiceId, id: { not: id } },
          select: { amount: true },
        });

        const otherPaid = otherPayments.reduce(
          (sum, p) => sum.plus(new Prisma.Decimal(p.amount)),
          new Prisma.Decimal(0)
        );

        const tentativeTotalPaid = otherPaid.plus(newAmount);
        const invoiceTotal = new Prisma.Decimal(existing.invoice.total);

        if (tentativeTotalPaid.greaterThan(invoiceTotal)) {
          throw new AppError(
            `Updated payment amount causes total payments (${tentativeTotalPaid.toFixed(2)}) to exceed invoice total (${invoiceTotal.toFixed(2)})`,
            400
          );
        }
      }

      // 2. Update payment
      const pm = await tx.payment.update({
        where: { id },
        data: {
          amount: data.amount !== undefined ? new Prisma.Decimal(new Prisma.Decimal(data.amount).toFixed(2)) : undefined,
          paymentDate: data.paymentDate,
          paymentMethod: data.paymentMethod,
          reference: data.reference,
          notes: data.notes,
        },
        include: {
          invoice: {
            include: {
              client: true,
              project: true,
            },
          },
          recordedBy: {
            include: {
              employee: true,
            },
          },
        },
      });

      // 3. Recalculate invoice totals
      const allPayments = await tx.payment.findMany({
        where: { invoiceId: existing.invoiceId },
        select: { amount: true },
      });

      const totalPaid = allPayments.reduce(
        (sum, p) => sum.plus(new Prisma.Decimal(p.amount)),
        new Prisma.Decimal(0)
      );

      const invoiceTotal = new Prisma.Decimal(existing.invoice.total);
      const balanceDue = new Prisma.Decimal(invoiceTotal.minus(totalPaid).toFixed(2));

      let newStatus = existing.invoice.status;
      if (balanceDue.isZero()) {
        newStatus = InvoiceStatus.PAID;
      } else if (totalPaid.greaterThan(0)) {
        newStatus = InvoiceStatus.PARTIAL;
      } else {
        newStatus = InvoiceStatus.SENT;
      }

      await tx.invoice.update({
        where: { id: existing.invoiceId },
        data: {
          amountPaid: totalPaid,
          balanceDue,
          status: newStatus,
        },
      });

      return pm;
    });

    await AuditService.log({
      userId: user.userId,
      action: 'PAYMENT_UPDATED',
      entityType: 'PAYMENT',
      entityId: id,
      metadata: {
        invoiceId: existing.invoiceId,
        newAmount: data.amount ? data.amount.toString() : existing.amount.toString(),
      },
    });

    return this.formatPayment(updated);
  }

  /**
   * Delete Payment and recalculate invoice totals and status inside transaction
   */
  public static async deletePayment(
    id: string,
    user: AuthenticatedUser
  ): Promise<{ message: string }> {
    const payment = await prisma.payment.findUnique({
      where: { id },
      include: { invoice: true },
    });

    if (!payment) {
      throw new AppError('Payment not found', 404);
    }

    await prisma.$transaction(async (tx) => {
      // 1. Delete payment
      await tx.payment.delete({ where: { id } });

      // 2. Recalculate remaining payments
      const remainingPayments = await tx.payment.findMany({
        where: { invoiceId: payment.invoiceId },
        select: { amount: true },
      });

      const totalPaid = remainingPayments.reduce(
        (sum, p) => sum.plus(new Prisma.Decimal(p.amount)),
        new Prisma.Decimal(0)
      );

      const invoiceTotal = new Prisma.Decimal(payment.invoice.total);
      const balanceDue = new Prisma.Decimal(invoiceTotal.minus(totalPaid).toFixed(2));

      let newStatus = payment.invoice.status;
      if (balanceDue.isZero()) {
        newStatus = InvoiceStatus.PAID;
      } else if (totalPaid.greaterThan(0)) {
        newStatus = InvoiceStatus.PARTIAL;
      } else {
        newStatus = InvoiceStatus.SENT;
      }

      await tx.invoice.update({
        where: { id: payment.invoiceId },
        data: {
          amountPaid: totalPaid,
          balanceDue,
          status: newStatus,
        },
      });
    });

    await AuditService.log({
      userId: user.userId,
      action: 'PAYMENT_DELETED',
      entityType: 'PAYMENT',
      entityId: id,
      metadata: {
        invoiceId: payment.invoiceId,
        amount: payment.amount.toString(),
      },
    });

    return { message: 'Payment deleted and invoice balance recalculated successfully' };
  }

  // ==========================================================================
  // FINANCIAL SUMMARY
  // ==========================================================================

  /**
   * Returns organization or client/project-level financial summaries
   */
  public static async getFinancialSummary(query: FinancialSummaryQuery): Promise<FinancialSummaryResponse> {
    const where: Prisma.InvoiceWhereInput = {
      status: { not: InvoiceStatus.CANCELLED },
    };

    if (query.clientId) where.clientId = query.clientId;
    if (query.projectId) where.projectId = query.projectId;

    if (query.startDate || query.endDate) {
      where.issueDate = {};
      if (query.startDate) where.issueDate.gte = query.startDate;
      if (query.endDate) where.issueDate.lte = query.endDate;
    }

    const invoices = await prisma.invoice.findMany({
      where,
      select: {
        total: true,
        amountPaid: true,
        balanceDue: true,
        dueDate: true,
        status: true,
      },
    });

    let totalInvoiced = new Prisma.Decimal(0);
    let totalPaid = new Prisma.Decimal(0);
    let totalOutstanding = new Prisma.Decimal(0);
    let overdueAmount = new Prisma.Decimal(0);

    const now = Date.now();
    const statusCounts = {
      total: invoices.length,
      draft: 0,
      sent: 0,
      partial: 0,
      paid: 0,
      overdue: 0,
      cancelled: 0,
    };

    for (const inv of invoices) {
      const invTotal = new Prisma.Decimal(inv.total);
      const invPaid = new Prisma.Decimal(inv.amountPaid);
      const invBalance = new Prisma.Decimal(inv.balanceDue);

      totalInvoiced = totalInvoiced.plus(invTotal);
      totalPaid = totalPaid.plus(invPaid);
      totalOutstanding = totalOutstanding.plus(invBalance);

      if (new Date(inv.dueDate).getTime() < now && invBalance.greaterThan(0) && inv.status !== InvoiceStatus.PAID) {
        overdueAmount = overdueAmount.plus(invBalance);
        statusCounts.overdue++;
      }

      if (inv.status === InvoiceStatus.DRAFT) statusCounts.draft++;
      else if (inv.status === InvoiceStatus.SENT) statusCounts.sent++;
      else if (inv.status === InvoiceStatus.PARTIAL) statusCounts.partial++;
      else if (inv.status === InvoiceStatus.PAID) statusCounts.paid++;
    }

    // Count cancelled invoices
    const cancelledCount = await prisma.invoice.count({
      where: {
        status: InvoiceStatus.CANCELLED,
        ...(query.clientId ? { clientId: query.clientId } : {}),
        ...(query.projectId ? { projectId: query.projectId } : {}),
      },
    });
    statusCounts.cancelled = cancelledCount;

    // Count payments
    const paymentsWhere: Prisma.PaymentWhereInput = {};
    if (query.clientId || query.projectId) {
      paymentsWhere.invoice = {};
      if (query.clientId) paymentsWhere.invoice.clientId = query.clientId;
      if (query.projectId) paymentsWhere.invoice.projectId = query.projectId;
    }
    const paymentsCount = await prisma.payment.count({ where: paymentsWhere });

    return {
      totalInvoiced: totalInvoiced.toFixed(2),
      totalPaid: totalPaid.toFixed(2),
      totalOutstanding: totalOutstanding.toFixed(2),
      overdueAmount: overdueAmount.toFixed(2),
      currency: 'USD',
      invoicesCount: statusCounts,
      paymentsCount,
    };
  }
}
