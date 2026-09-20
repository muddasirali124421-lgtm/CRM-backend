/**
 * Dashboard API Types & Response DTOs
 */

export interface DashboardOverviewResponse {
  employees: {
    totalActive: number;
  };
  leads: {
    total: number;
    new: number;
    qualified: number;
  };
  clients: {
    total: number;
    active: number;
  };
  projects: {
    total: number;
    active: number;
    completed: number;
  };
  tasks: {
    total: number;
    pending: number;
    overdue: number;
    completed: number;
  };
  financial: {
    totalInvoiced: string;
    totalReceived: string;
    totalOutstanding: string;
  } | null;
}

export interface DashboardActivityActor {
  id: string;
  name: string;
  email: string;
}

export interface DashboardActivityItem {
  id: string;
  action: string;
  entityType: string;
  entityId: string | null;
  metadata: unknown;
  createdAt: Date;
  actor: DashboardActivityActor | null;
}

export interface DashboardMyWorkTaskItem {
  id: string;
  taskCode: string;
  title: string;
  status: string;
  priority: string;
  dueDate: Date | null;
  project: {
    id: string;
    name: string;
    projectCode: string;
  };
}

export interface DashboardMyWorkProjectItem {
  id: string;
  projectCode: string;
  name: string;
  status: string;
  priority: string;
  dueDate: Date | null;
  client: {
    id: string;
    name: string;
    company: string | null;
  };
}

export interface DashboardMyWorkResponse {
  summary: {
    assignedProjectsCount: number;
    assignedTasksCount: number;
    dueTodayCount: number;
    overdueCount: number;
    inProgressCount: number;
    awaitingQaCount: number;
  };
  assignedProjects: DashboardMyWorkProjectItem[];
  assignedTasks: DashboardMyWorkTaskItem[];
}
