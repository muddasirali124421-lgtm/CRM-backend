import { LeadStatus, PriorityLevel } from '@prisma/client';

export interface LeadFilterQuery {
  page?: number;
  limit?: number;
  search?: string;
  status?: LeadStatus;
  priority?: PriorityLevel;
  source?: string;
  assignedToId?: string;
  followUp?: 'overdue' | 'today' | 'upcoming';
  startDate?: Date;
  endDate?: Date;
  sortBy?: 'createdAt' | 'followUpAt' | 'estimatedValue' | 'firstName' | 'lastName' | 'leadCode';
  sortOrder?: 'asc' | 'desc';
}

export interface SafeAssignedEmployee {
  id: string;
  employeeCode: string;
  firstName: string;
  lastName: string;
  jobTitle: string;
  profileImage: string | null;
}

export interface SafeLeadResponse {
  id: string;
  leadCode: string;
  firstName: string;
  lastName: string;
  company: string | null;
  email: string;
  phone: string | null;
  source: string | null;
  status: LeadStatus;
  priority: PriorityLevel;
  assignedToId: string | null;
  estimatedValue: number | null;
  followUpAt: Date | null;
  notes: string | null;
  createdAt: Date;
  updatedAt: Date;
  assignedTo: SafeAssignedEmployee | null;
  convertedClient?: {
    id: string;
    clientCode: string;
    name: string;
    company: string | null;
    createdAt: Date;
  } | null;
}

export interface CreateLeadDTO {
  firstName: string;
  lastName: string;
  company?: string;
  email: string;
  phone?: string;
  source?: string;
  status?: LeadStatus;
  priority?: PriorityLevel;
  assignedToId?: string;
  estimatedValue?: number;
  followUpAt?: Date;
  notes?: string;
}

export interface UpdateLeadDTO {
  firstName?: string;
  lastName?: string;
  company?: string | null;
  email?: string;
  phone?: string | null;
  source?: string | null;
  status?: LeadStatus;
  priority?: PriorityLevel;
  assignedToId?: string | null;
  estimatedValue?: number | null;
  followUpAt?: Date | null;
  notes?: string | null;
}

export interface AssignLeadDTO {
  employeeId: string | null;
}

export interface ConvertLeadDTO {
  company?: string;
  website?: string;
  addressLine1?: string;
  addressLine2?: string;
  city?: string;
  state?: string;
  country?: string;
  postalCode?: string;
}
