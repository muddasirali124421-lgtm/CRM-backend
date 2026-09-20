import { InvoiceStatus } from '@prisma/client';

export interface SafeClientSummary {
  id: string;
  clientCode: string;
  name: string;
  company: string | null;
  email: string;
  phone: string | null;
}

export interface SafeProjectSummary {
  id: string;
  projectCode: string;
  name: string;
  status: string;
}

export interface SafeUserSummary {
  id: string;
  email: string;
  employee?: {
    id: string;
    employeeCode: string;
    firstName: string;
    lastName: string;
    profileImage: string | null;
  } | null;
}

export interface SafeInvoiceItem {
  id: string;
  invoiceId: string;
  description: string;
  quantity: string;
  unitPrice: string;
  taxRate: string;
  lineTotal: string;
  position: number;
}

export interface SafePaymentResponse {
  id: string;
  invoiceId: string;
  invoiceNumber?: string;
  amount: string;
  paymentDate: Date;
  paymentMethod: string;
  reference: string | null;
  notes: string | null;
  recordedById: string | null;
  recordedBy: SafeUserSummary | null;
  client?: SafeClientSummary | null;
  project?: SafeProjectSummary | null;
  createdAt: Date;
}

export interface SafeInvoiceResponse {
  id: string;
  invoiceNumber: string;
  clientId: string;
  client: SafeClientSummary;
  projectId: string | null;
  project: SafeProjectSummary | null;
  status: InvoiceStatus;
  issueDate: Date;
  dueDate: Date;
  currency: string;
  subtotal: string;
  discount: string;
  tax: string;
  total: string;
  amountPaid: string;
  balanceDue: string;
  isOverdue: boolean;
  notes: string | null;
  createdAt: Date;
  updatedAt: Date;
  itemsCount?: number;
  paymentsCount?: number;
}

export interface SafeInvoiceDetailsResponse extends SafeInvoiceResponse {
  items: SafeInvoiceItem[];
  payments: SafePaymentResponse[];
}

export interface FinancialSummaryResponse {
  totalInvoiced: string;
  totalPaid: string;
  totalOutstanding: string;
  overdueAmount: string;
  currency: string;
  invoicesCount: {
    total: number;
    draft: number;
    sent: number;
    partial: number;
    paid: number;
    overdue: number;
    cancelled: number;
  };
  paymentsCount: number;
}

export interface InvoiceItemInputDTO {
  description: string;
  quantity: number | string;
  unitPrice: number | string;
  taxRate?: number | string;
  position?: number;
}

export interface CreateInvoiceDTO {
  clientId: string;
  projectId?: string;
  issueDate: Date;
  dueDate: Date;
  currency?: string;
  notes?: string;
  discount?: number | string;
  tax?: number | string;
  status?: InvoiceStatus;
  items: InvoiceItemInputDTO[];
}

export interface UpdateInvoiceDTO {
  clientId?: string;
  projectId?: string | null;
  issueDate?: Date;
  dueDate?: Date;
  currency?: string;
  status?: InvoiceStatus;
  notes?: string | null;
  discount?: number | string;
  tax?: number | string;
  items?: InvoiceItemInputDTO[];
}

export interface RecordPaymentDTO {
  amount: number | string;
  paymentDate?: Date;
  paymentMethod: string;
  reference?: string;
  notes?: string;
}

export interface UpdatePaymentDTO {
  amount?: number | string;
  paymentDate?: Date;
  paymentMethod?: string;
  reference?: string | null;
  notes?: string | null;
}

export interface InvoiceFilterQuery {
  page?: number;
  limit?: number;
  search?: string;
  status?: InvoiceStatus;
  clientId?: string;
  projectId?: string;
  issueDateFrom?: Date;
  issueDateTo?: Date;
  dueDateFrom?: Date;
  dueDateTo?: Date;
  overdue?: boolean;
  sortBy?: 'createdAt' | 'updatedAt' | 'invoiceNumber' | 'issueDate' | 'dueDate' | 'total' | 'amountPaid' | 'balanceDue' | 'status';
  sortOrder?: 'asc' | 'desc';
}

export interface PaymentFilterQuery {
  page?: number;
  limit?: number;
  search?: string;
  clientId?: string;
  projectId?: string;
  invoiceId?: string;
  paymentMethod?: string;
  paymentDateFrom?: Date;
  paymentDateTo?: Date;
  sortBy?: 'paymentDate' | 'amount' | 'createdAt';
  sortOrder?: 'asc' | 'desc';
}

export interface FinancialSummaryQuery {
  clientId?: string;
  projectId?: string;
  startDate?: Date;
  endDate?: Date;
}
