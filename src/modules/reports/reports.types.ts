import { ClientStatus, InvoiceStatus, LeadStatus, PriorityLevel, ProjectStatus, TaskStatus } from '@prisma/client';

export type ReportGrouping = 'day' | 'week' | 'month';
export type ReportPreset = '7d' | '30d' | '90d' | 'this_month' | 'this_year';
export type ExportReportType = 'leads' | 'clients' | 'projects' | 'tasks' | 'employees' | 'financial';

export interface BaseReportQuery {
  from?: string;
  to?: string;
  preset?: ReportPreset;
  groupBy?: ReportGrouping;
}

export interface ProjectsReportQuery extends BaseReportQuery {
  clientId?: string;
}

export interface TasksReportQuery extends BaseReportQuery {
  projectId?: string;
  employeeId?: string;
}

export interface EmployeesReportQuery {
  departmentId?: string;
}

export interface FinancialReportQuery extends BaseReportQuery {
  clientId?: string;
}

export interface ExportReportQuery extends BaseReportQuery {
  format?: 'csv';
  clientId?: string;
  projectId?: string;
  employeeId?: string;
  departmentId?: string;
}

// ============================================================================
// REPORT DTOs
// ============================================================================

export interface LeadsReportResponse {
  totalLeads: number;
  byStatus: Array<{ status: LeadStatus; count: number }>;
  statusCounts: Record<LeadStatus, number>;
  conversionRate: {
    rate: number;
    percentage: string;
    formula: string;
    eligibleTotal: number;
  };
  leadSources: Array<{ source: string; count: number }>;
  trend: Array<{ period: string; count: number }>;
}

export interface ClientsReportResponse {
  totalClients: number;
  newClientsInPeriod: number;
  byStatus: Array<{ status: ClientStatus; count: number }>;
  activeClients: number;
  inactiveClients: number;
  sourceBreakdown: {
    convertedFromLead: number;
    direct: number;
  };
  trend: Array<{ period: string; count: number }>;
}

export interface ProjectsReportResponse {
  totalProjects: number;
  byStatus: Array<{ status: ProjectStatus; count: number }>;
  statusCounts: Record<ProjectStatus, number>;
  active: number;
  completed: number;
  onHold: number;
  cancelled: number;
  overdue: number;
  completionRate: {
    rate: number;
    percentage: string;
  };
  totalBudget: string;
  trend: Array<{ period: string; created: number; completed: number }>;
}

export interface TasksReportResponse {
  totalTasks: number;
  byStatus: Array<{ status: TaskStatus; count: number }>;
  statusCounts: Record<TaskStatus, number>;
  byPriority: Array<{ priority: PriorityLevel; count: number }>;
  completed: number;
  pending: number;
  overdue: number;
  completionRate: {
    rate: number;
    percentage: string;
  };
  trend: Array<{ period: string; created: number; completed: number }>;
}

export interface EmployeeOperationalItem {
  id: string;
  employeeCode: string;
  name: string;
  jobTitle: string;
  department: string | null;
  assignedTasksCount: number;
  completedTasksCount: number;
  pendingTasksCount: number;
  overdueTasksCount: number;
  activeProjectsCount: number;
}

export interface EmployeesReportResponse {
  totalEmployees: number;
  employees: EmployeeOperationalItem[];
}

export interface FinancialReportResponse {
  totalInvoiced: string;
  totalPaid: string;
  totalOutstanding: string;
  overdueAmount: string;
  invoiceCounts: {
    total: number;
    draft: number;
    sent: number;
    partial: number;
    paid: number;
    overdue: number;
    cancelled: number;
  };
  paymentCounts: number;
  byStatus: Array<{ status: InvoiceStatus; count: number; totalAmount: string }>;
  paymentsByMethod: Array<{ method: string; count: number; totalAmount: string }>;
  revenueTrend: Array<{ period: string; invoiced: string; received: string }>;
}
