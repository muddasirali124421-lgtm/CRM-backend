import { ClientStatus } from '@prisma/client';

export interface ClientFilterQuery {
  page?: number;
  limit?: number;
  search?: string;
  status?: ClientStatus;
  assignedToId?: string;
  isConverted?: boolean;
  startDate?: Date;
  endDate?: Date;
  sortBy?: 'createdAt' | 'name' | 'company' | 'clientCode' | 'status';
  sortOrder?: 'asc' | 'desc';
  compact?: boolean;
}

export interface SafeAssignedEmployee {
  id: string;
  employeeCode: string;
  firstName: string;
  lastName: string;
  jobTitle: string;
  profileImage: string | null;
}

export interface SafeSourceLeadSummary {
  id: string;
  leadCode: string;
  firstName: string;
  lastName: string;
  company: string | null;
  email: string;
  status: string;
  createdAt: Date;
}

export interface ClientCounts {
  projects: number;
  openProjects: number;
  tasks: number;
  invoices: number;
  outstandingInvoices: number;
}

export interface SafeClientResponse {
  id: string;
  clientCode: string;
  name: string;
  company: string | null;
  email: string;
  phone: string | null;
  website: string | null;
  addressLine1: string | null;
  addressLine2: string | null;
  city: string | null;
  state: string | null;
  country: string | null;
  postalCode: string | null;
  status: ClientStatus;
  assignedToId: string | null;
  sourceLeadId: string | null;
  createdAt: Date;
  updatedAt: Date;
  assignedTo?: SafeAssignedEmployee | null;
  sourceLead?: SafeSourceLeadSummary | null;
  counts?: ClientCounts;
}

export interface CompactClientOption {
  id: string;
  clientCode: string;
  name: string;
  company: string | null;
  status: ClientStatus;
}

export interface CreateClientDTO {
  name: string;
  company?: string;
  email: string;
  phone?: string;
  website?: string;
  addressLine1?: string;
  addressLine2?: string;
  city?: string;
  state?: string;
  country?: string;
  postalCode?: string;
  status?: ClientStatus;
  assignedToId?: string;
}

export interface UpdateClientDTO {
  name?: string;
  company?: string | null;
  email?: string;
  phone?: string | null;
  website?: string | null;
  addressLine1?: string | null;
  addressLine2?: string | null;
  city?: string | null;
  state?: string | null;
  country?: string | null;
  postalCode?: string | null;
  status?: ClientStatus;
  assignedToId?: string | null;
}

export interface AssignClientDTO {
  employeeId: string;
}
