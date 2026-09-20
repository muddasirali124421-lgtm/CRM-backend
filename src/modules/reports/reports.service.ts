import {
  ClientStatus,
  InvoiceStatus,
  LeadStatus,
  Prisma,
  PriorityLevel,
  ProjectStatus,
  TaskStatus,
} from '@prisma/client';
import prisma from '../../config/database';
import { AuditService } from '../../services/audit.service';
import { AuthenticatedUser } from '../../types/auth.types';
import { generateCsv } from '../../utils/csv';
import {
  BaseReportQuery,
  ClientsReportResponse,
  EmployeeOperationalItem,
  EmployeesReportQuery,
  EmployeesReportResponse,
  ExportReportQuery,
  ExportReportType,
  FinancialReportQuery,
  FinancialReportResponse,
  LeadsReportResponse,
  ProjectsReportQuery,
  ProjectsReportResponse,
  ReportGrouping,
  TasksReportQuery,
  TasksReportResponse,
} from './reports.types';

export class ReportsService {
  /**
   * Resolves inclusive from/to Date boundaries and appropriate grouping.
   */
  public static parseDateRange(query: BaseReportQuery): {
    fromDate?: Date;
    toDate?: Date;
    groupBy: ReportGrouping;
  } {
    const now = new Date();
    let fromDate: Date | undefined;
    let toDate: Date | undefined;

    if (query.preset) {
      switch (query.preset) {
        case '7d': {
          fromDate = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
          fromDate.setHours(0, 0, 0, 0);
          toDate = new Date(now);
          break;
        }
        case '30d': {
          fromDate = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
          fromDate.setHours(0, 0, 0, 0);
          toDate = new Date(now);
          break;
        }
        case '90d': {
          fromDate = new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000);
          fromDate.setHours(0, 0, 0, 0);
          toDate = new Date(now);
          break;
        }
        case 'this_month': {
          fromDate = new Date(now.getFullYear(), now.getMonth(), 1, 0, 0, 0, 0);
          toDate = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59, 999);
          break;
        }
        case 'this_year': {
          fromDate = new Date(now.getFullYear(), 0, 1, 0, 0, 0, 0);
          toDate = new Date(now.getFullYear(), 11, 31, 23, 59, 59, 999);
          break;
        }
      }
    }

    if (query.from) {
      fromDate = new Date(query.from);
      if (!query.from.includes('T')) {
        fromDate.setHours(0, 0, 0, 0);
      }
    }

    if (query.to) {
      toDate = new Date(query.to);
      if (!query.to.includes('T')) {
        toDate.setHours(23, 59, 59, 999);
      }
    }

    // Determine grouping
    let groupBy: ReportGrouping = query.groupBy ?? 'month';
    if (!query.groupBy && fromDate && toDate) {
      const diffDays = Math.ceil((toDate.getTime() - fromDate.getTime()) / (1000 * 60 * 60 * 24));
      if (diffDays <= 14) {
        groupBy = 'day';
      } else if (diffDays <= 90) {
        groupBy = 'week';
      } else {
        groupBy = 'month';
      }
    }

    return { fromDate, toDate, groupBy };
  }

  /**
   * Formats a date into a clean period string based on grouping.
   */
  public static formatPeriod(date: Date, groupBy: ReportGrouping): string {
    const iso = date.toISOString();
    if (groupBy === 'day') {
      return iso.slice(0, 10); // YYYY-MM-DD
    }
    if (groupBy === 'week') {
      // Find beginning of week (Sunday)
      const d = new Date(date);
      d.setHours(0, 0, 0, 0);
      d.setDate(d.getDate() - d.getDay());
      return d.toISOString().slice(0, 10);
    }
    return iso.slice(0, 7); // YYYY-MM
  }

  // ==========================================================================
  // 1. LEADS REPORT
  // ==========================================================================
  public static async getLeadsReport(query: BaseReportQuery): Promise<LeadsReportResponse> {
    const { fromDate, toDate, groupBy } = this.parseDateRange(query);

    const where: Prisma.LeadWhereInput = {};
    if (fromDate || toDate) {
      where.createdAt = {
        ...(fromDate ? { gte: fromDate } : {}),
        ...(toDate ? { lte: toDate } : {}),
      };
    }

    const leads = await prisma.lead.findMany({
      where,
      select: {
        id: true,
        status: true,
        source: true,
        createdAt: true,
      },
      orderBy: { createdAt: 'asc' },
    });

    const statusCounts: Record<LeadStatus, number> = {
      NEW: 0,
      CONTACTED: 0,
      FOLLOW_UP: 0,
      QUALIFIED: 0,
      CONVERTED: 0,
      LOST: 0,
    };

    const sourceMap: Record<string, number> = {};
    const trendMap: Record<string, number> = {};

    for (const lead of leads) {
      if (statusCounts[lead.status] !== undefined) {
        statusCounts[lead.status]++;
      }

      const sourceName = lead.source?.trim() || 'Direct / Unknown';
      sourceMap[sourceName] = (sourceMap[sourceName] || 0) + 1;

      const period = this.formatPeriod(lead.createdAt, groupBy);
      trendMap[period] = (trendMap[period] || 0) + 1;
    }

    const totalLeads = leads.length;
    const convertedCount = statusCounts.CONVERTED;
    const eligibleTotal = totalLeads;
    const rate = eligibleTotal > 0 ? convertedCount / eligibleTotal : 0;

    const byStatus = (Object.keys(statusCounts) as LeadStatus[]).map((st) => ({
      status: st,
      count: statusCounts[st],
    }));

    const leadSources = Object.entries(sourceMap)
      .map(([source, count]) => ({ source, count }))
      .sort((a, b) => b.count - a.count);

    const trend = Object.entries(trendMap)
      .map(([period, count]) => ({ period, count }))
      .sort((a, b) => a.period.localeCompare(b.period));

    return {
      totalLeads,
      byStatus,
      statusCounts,
      conversionRate: {
        rate,
        percentage: `${(rate * 100).toFixed(2)}%`,
        formula: 'converted / total leads in period',
        eligibleTotal,
      },
      leadSources,
      trend,
    };
  }

  // ==========================================================================
  // 2. CLIENTS REPORT
  // ==========================================================================
  public static async getClientsReport(query: BaseReportQuery): Promise<ClientsReportResponse> {
    const { fromDate, toDate, groupBy } = this.parseDateRange(query);

    const [totalClients, activeClients, inactiveClients] = await Promise.all([
      prisma.client.count(),
      prisma.client.count({ where: { status: 'ACTIVE' } }),
      prisma.client.count({ where: { status: 'INACTIVE' } }),
    ]);

    const where: Prisma.ClientWhereInput = {};
    if (fromDate || toDate) {
      where.createdAt = {
        ...(fromDate ? { gte: fromDate } : {}),
        ...(toDate ? { lte: toDate } : {}),
      };
    }

    const clientsInPeriod = await prisma.client.findMany({
      where,
      select: {
        id: true,
        status: true,
        sourceLeadId: true,
        createdAt: true,
      },
      orderBy: { createdAt: 'asc' },
    });

    const statusCounts: Record<ClientStatus, number> = {
      ACTIVE: 0,
      INACTIVE: 0,
      LEAD: 0,
    };

    let convertedFromLead = 0;
    let direct = 0;
    const trendMap: Record<string, number> = {};

    for (const cl of clientsInPeriod) {
      if (statusCounts[cl.status] !== undefined) {
        statusCounts[cl.status]++;
      }

      if (cl.sourceLeadId) {
        convertedFromLead++;
      } else {
        direct++;
      }

      const period = this.formatPeriod(cl.createdAt, groupBy);
      trendMap[period] = (trendMap[period] || 0) + 1;
    }

    const byStatus = (Object.keys(statusCounts) as ClientStatus[]).map((st) => ({
      status: st,
      count: statusCounts[st],
    }));

    const trend = Object.entries(trendMap)
      .map(([period, count]) => ({ period, count }))
      .sort((a, b) => a.period.localeCompare(b.period));

    return {
      totalClients,
      newClientsInPeriod: clientsInPeriod.length,
      byStatus,
      activeClients,
      inactiveClients,
      sourceBreakdown: {
        convertedFromLead,
        direct,
      },
      trend,
    };
  }

  // ==========================================================================
  // 3. PROJECTS REPORT
  // ==========================================================================
  public static async getProjectsReport(query: ProjectsReportQuery): Promise<ProjectsReportResponse> {
    const { fromDate, toDate, groupBy } = this.parseDateRange(query);
    const now = new Date();

    const where: Prisma.ProjectWhereInput = {};
    if (query.clientId) where.clientId = query.clientId;
    if (fromDate || toDate) {
      where.createdAt = {
        ...(fromDate ? { gte: fromDate } : {}),
        ...(toDate ? { lte: toDate } : {}),
      };
    }

    const projects = await prisma.project.findMany({
      where,
      select: {
        id: true,
        status: true,
        budget: true,
        dueDate: true,
        completedAt: true,
        createdAt: true,
      },
      orderBy: { createdAt: 'asc' },
    });

    const statusCounts: Record<ProjectStatus, number> = {
      PLANNING: 0,
      IN_PROGRESS: 0,
      QA_REVIEW: 0,
      REVISION: 0,
      COMPLETED: 0,
      ON_HOLD: 0,
      CANCELLED: 0,
    };

    let totalBudget = new Prisma.Decimal(0);
    let overdue = 0;
    const trendMap: Record<string, { created: number; completed: number }> = {};

    for (const p of projects) {
      if (statusCounts[p.status] !== undefined) {
        statusCounts[p.status]++;
      }

      if (p.budget) {
        totalBudget = totalBudget.plus(p.budget);
      }

      if (
        p.dueDate &&
        p.dueDate < now &&
        p.status !== 'COMPLETED' &&
        p.status !== 'CANCELLED'
      ) {
        overdue++;
      }

      // Trend: created
      const createdPeriod = this.formatPeriod(p.createdAt, groupBy);
      if (!trendMap[createdPeriod]) trendMap[createdPeriod] = { created: 0, completed: 0 };
      trendMap[createdPeriod].created++;

      // Trend: completed
      if (p.completedAt) {
        const compPeriod = this.formatPeriod(p.completedAt, groupBy);
        if (!trendMap[compPeriod]) trendMap[compPeriod] = { created: 0, completed: 0 };
        trendMap[compPeriod].completed++;
      }
    }

    const totalProjects = projects.length;
    const active =
      statusCounts.PLANNING +
      statusCounts.IN_PROGRESS +
      statusCounts.QA_REVIEW +
      statusCounts.REVISION;
    const completed = statusCounts.COMPLETED;
    const onHold = statusCounts.ON_HOLD;
    const cancelled = statusCounts.CANCELLED;

    const rate = totalProjects > 0 ? completed / totalProjects : 0;

    const byStatus = (Object.keys(statusCounts) as ProjectStatus[]).map((st) => ({
      status: st,
      count: statusCounts[st],
    }));

    const trend = Object.entries(trendMap)
      .map(([period, data]) => ({ period, ...data }))
      .sort((a, b) => a.period.localeCompare(b.period));

    return {
      totalProjects,
      byStatus,
      statusCounts,
      active,
      completed,
      onHold,
      cancelled,
      overdue,
      completionRate: {
        rate,
        percentage: `${(rate * 100).toFixed(2)}%`,
      },
      totalBudget: totalBudget.toFixed(2),
      trend,
    };
  }

  // ==========================================================================
  // 4. TASKS REPORT
  // ==========================================================================
  public static async getTasksReport(query: TasksReportQuery): Promise<TasksReportResponse> {
    const { fromDate, toDate, groupBy } = this.parseDateRange(query);
    const now = new Date();

    const where: Prisma.TaskWhereInput = {};
    if (query.projectId) where.projectId = query.projectId;
    if (query.employeeId) where.assignees = { some: { employeeId: query.employeeId } };
    if (fromDate || toDate) {
      where.createdAt = {
        ...(fromDate ? { gte: fromDate } : {}),
        ...(toDate ? { lte: toDate } : {}),
      };
    }

    const tasks = await prisma.task.findMany({
      where,
      select: {
        id: true,
        status: true,
        priority: true,
        dueDate: true,
        completedAt: true,
        createdAt: true,
      },
      orderBy: { createdAt: 'asc' },
    });

    const statusCounts: Record<TaskStatus, number> = {
      TODO: 0,
      IN_PROGRESS: 0,
      QA: 0,
      REVISION: 0,
      COMPLETED: 0,
    };

    const priorityCounts: Record<PriorityLevel, number> = {
      LOW: 0,
      MEDIUM: 0,
      HIGH: 0,
      URGENT: 0,
    };

    let overdue = 0;
    const trendMap: Record<string, { created: number; completed: number }> = {};

    for (const t of tasks) {
      if (statusCounts[t.status] !== undefined) {
        statusCounts[t.status]++;
      }
      if (priorityCounts[t.priority] !== undefined) {
        priorityCounts[t.priority]++;
      }

      if (t.dueDate && t.dueDate < now && t.status !== 'COMPLETED') {
        overdue++;
      }

      const createdPeriod = this.formatPeriod(t.createdAt, groupBy);
      if (!trendMap[createdPeriod]) trendMap[createdPeriod] = { created: 0, completed: 0 };
      trendMap[createdPeriod].created++;

      if (t.completedAt) {
        const compPeriod = this.formatPeriod(t.completedAt, groupBy);
        if (!trendMap[compPeriod]) trendMap[compPeriod] = { created: 0, completed: 0 };
        trendMap[compPeriod].completed++;
      }
    }

    const totalTasks = tasks.length;
    const completed = statusCounts.COMPLETED;
    const pending = totalTasks - completed;
    const rate = totalTasks > 0 ? completed / totalTasks : 0;

    const byStatus = (Object.keys(statusCounts) as TaskStatus[]).map((st) => ({
      status: st,
      count: statusCounts[st],
    }));

    const byPriority = (Object.keys(priorityCounts) as PriorityLevel[]).map((pr) => ({
      priority: pr,
      count: priorityCounts[pr],
    }));

    const trend = Object.entries(trendMap)
      .map(([period, data]) => ({ period, ...data }))
      .sort((a, b) => a.period.localeCompare(b.period));

    return {
      totalTasks,
      byStatus,
      statusCounts,
      byPriority,
      completed,
      pending,
      overdue,
      completionRate: {
        rate,
        percentage: `${(rate * 100).toFixed(2)}%`,
      },
      trend,
    };
  }

  // ==========================================================================
  // 5. EMPLOYEES OPERATIONAL REPORT
  // ==========================================================================
  public static async getEmployeesReport(query: EmployeesReportQuery): Promise<EmployeesReportResponse> {
    const now = new Date();

    const employees = await prisma.employee.findMany({
      where: {
        employmentStatus: 'ACTIVE',
        ...(query.departmentId ? { departmentId: query.departmentId } : {}),
      },
      select: {
        id: true,
        employeeCode: true,
        firstName: true,
        lastName: true,
        jobTitle: true,
        department: {
          select: {
            name: true,
          },
        },
        assignedTasks: {
          select: {
            task: {
              select: {
                id: true,
                status: true,
                dueDate: true,
              },
            },
          },
        },
        managedProjects: {
          where: { status: { notIn: ['COMPLETED', 'CANCELLED'] } },
          select: { id: true },
        },
        projectMemberships: {
          where: { project: { status: { notIn: ['COMPLETED', 'CANCELLED'] } } },
          select: { projectId: true },
        },
      },
      orderBy: { employeeCode: 'asc' },
    });

    const mappedEmployees: EmployeeOperationalItem[] = employees.map((emp) => {
      let completedTasksCount = 0;
      let pendingTasksCount = 0;
      let overdueTasksCount = 0;

      for (const assignee of emp.assignedTasks) {
        const task = assignee.task;
        if (task.status === 'COMPLETED') {
          completedTasksCount++;
        } else {
          pendingTasksCount++;
          if (task.dueDate && task.dueDate < now) {
            overdueTasksCount++;
          }
        }
      }

      // Unique active projects
      const activeProjectIds = new Set<string>();
      emp.managedProjects.forEach((p) => activeProjectIds.add(p.id));
      emp.projectMemberships.forEach((pm) => activeProjectIds.add(pm.projectId));

      return {
        id: emp.id,
        employeeCode: emp.employeeCode,
        name: `${emp.firstName} ${emp.lastName}`.trim(),
        jobTitle: emp.jobTitle,
        department: emp.department?.name ?? null,
        assignedTasksCount: emp.assignedTasks.length,
        completedTasksCount,
        pendingTasksCount,
        overdueTasksCount,
        activeProjectsCount: activeProjectIds.size,
      };
    });

    return {
      totalEmployees: mappedEmployees.length,
      employees: mappedEmployees,
    };
  }

  // ==========================================================================
  // 6. FINANCIAL REPORT
  // ==========================================================================
  public static async getFinancialReport(query: FinancialReportQuery): Promise<FinancialReportResponse> {
    const { fromDate, toDate, groupBy } = this.parseDateRange(query);
    const now = new Date();

    const invoiceWhere: Prisma.InvoiceWhereInput = {};
    if (query.clientId) invoiceWhere.clientId = query.clientId;
    if (fromDate || toDate) {
      invoiceWhere.issueDate = {
        ...(fromDate ? { gte: fromDate } : {}),
        ...(toDate ? { lte: toDate } : {}),
      };
    }

    const invoices = await prisma.invoice.findMany({
      where: invoiceWhere,
      select: {
        id: true,
        invoiceNumber: true,
        status: true,
        total: true,
        amountPaid: true,
        balanceDue: true,
        issueDate: true,
        dueDate: true,
      },
      orderBy: { issueDate: 'asc' },
    });

    const paymentWhere: Prisma.PaymentWhereInput = {};
    if (query.clientId) paymentWhere.invoice = { clientId: query.clientId };
    if (fromDate || toDate) {
      paymentWhere.paymentDate = {
        ...(fromDate ? { gte: fromDate } : {}),
        ...(toDate ? { lte: toDate } : {}),
      };
    }

    const payments = await prisma.payment.findMany({
      where: paymentWhere,
      select: {
        id: true,
        amount: true,
        paymentMethod: true,
        paymentDate: true,
      },
      orderBy: { paymentDate: 'asc' },
    });

    let totalInvoiced = new Prisma.Decimal(0);
    let totalPaid = new Prisma.Decimal(0);
    let totalOutstanding = new Prisma.Decimal(0);
    let overdueAmount = new Prisma.Decimal(0);

    const invoiceCounts = {
      total: invoices.length,
      draft: 0,
      sent: 0,
      partial: 0,
      paid: 0,
      overdue: 0,
      cancelled: 0,
    };

    const statusTotals: Record<InvoiceStatus, { count: number; total: Prisma.Decimal }> = {
      DRAFT: { count: 0, total: new Prisma.Decimal(0) },
      SENT: { count: 0, total: new Prisma.Decimal(0) },
      PARTIAL: { count: 0, total: new Prisma.Decimal(0) },
      PAID: { count: 0, total: new Prisma.Decimal(0) },
      OVERDUE: { count: 0, total: new Prisma.Decimal(0) },
      CANCELLED: { count: 0, total: new Prisma.Decimal(0) },
    };

    const revenueTrendMap: Record<string, { invoiced: Prisma.Decimal; received: Prisma.Decimal }> = {};

    for (const inv of invoices) {
      const invTotal = new Prisma.Decimal(inv.total);
      const invPaid = new Prisma.Decimal(inv.amountPaid);
      const invBalance = new Prisma.Decimal(inv.balanceDue);

      if (inv.status !== 'CANCELLED') {
        totalInvoiced = totalInvoiced.plus(invTotal);
        totalPaid = totalPaid.plus(invPaid);
        totalOutstanding = totalOutstanding.plus(invBalance);

        if (inv.dueDate < now && invBalance.greaterThan(0) && inv.status !== 'PAID') {
          overdueAmount = overdueAmount.plus(invBalance);
        }
      }

      // Counts and status totals
      if (statusTotals[inv.status]) {
        statusTotals[inv.status].count++;
        statusTotals[inv.status].total = statusTotals[inv.status].total.plus(invTotal);
      }

      switch (inv.status) {
        case 'DRAFT':
          invoiceCounts.draft++;
          break;
        case 'SENT':
          invoiceCounts.sent++;
          break;
        case 'PARTIAL':
          invoiceCounts.partial++;
          break;
        case 'PAID':
          invoiceCounts.paid++;
          break;
        case 'OVERDUE':
          invoiceCounts.overdue++;
          break;
        case 'CANCELLED':
          invoiceCounts.cancelled++;
          break;
      }

      // Trend: invoiced
      if (inv.status !== 'CANCELLED') {
        const period = this.formatPeriod(inv.issueDate, groupBy);
        if (!revenueTrendMap[period]) {
          revenueTrendMap[period] = { invoiced: new Prisma.Decimal(0), received: new Prisma.Decimal(0) };
        }
        revenueTrendMap[period].invoiced = revenueTrendMap[period].invoiced.plus(invTotal);
      }
    }

    // Trend: received payments
    const paymentMethodsMap: Record<string, { count: number; total: Prisma.Decimal }> = {};

    for (const p of payments) {
      const pAmount = new Prisma.Decimal(p.amount);
      const method = p.paymentMethod || 'OTHER';

      if (!paymentMethodsMap[method]) {
        paymentMethodsMap[method] = { count: 0, total: new Prisma.Decimal(0) };
      }
      paymentMethodsMap[method].count++;
      paymentMethodsMap[method].total = paymentMethodsMap[method].total.plus(pAmount);

      const period = this.formatPeriod(p.paymentDate, groupBy);
      if (!revenueTrendMap[period]) {
        revenueTrendMap[period] = { invoiced: new Prisma.Decimal(0), received: new Prisma.Decimal(0) };
      }
      revenueTrendMap[period].received = revenueTrendMap[period].received.plus(pAmount);
    }

    const byStatus = (Object.keys(statusTotals) as InvoiceStatus[]).map((st) => ({
      status: st,
      count: statusTotals[st].count,
      totalAmount: statusTotals[st].total.toFixed(2),
    }));

    const paymentsByMethod = Object.entries(paymentMethodsMap).map(([method, data]) => ({
      method,
      count: data.count,
      totalAmount: data.total.toFixed(2),
    }));

    const revenueTrend = Object.entries(revenueTrendMap)
      .map(([period, data]) => ({
        period,
        invoiced: data.invoiced.toFixed(2),
        received: data.received.toFixed(2),
      }))
      .sort((a, b) => a.period.localeCompare(b.period));

    return {
      totalInvoiced: totalInvoiced.toFixed(2),
      totalPaid: totalPaid.toFixed(2),
      totalOutstanding: totalOutstanding.toFixed(2),
      overdueAmount: overdueAmount.toFixed(2),
      invoiceCounts,
      paymentCounts: payments.length,
      byStatus,
      paymentsByMethod,
      revenueTrend,
    };
  }

  // ==========================================================================
  // 7. CSV EXPORT
  // ==========================================================================
  public static async exportReportCSV(
    reportType: ExportReportType,
    query: ExportReportQuery,
    user: AuthenticatedUser,
    ipAddress?: string,
    userAgent?: string
  ): Promise<{ csvContent: string; filename: string }> {
    const todayStr = new Date().toISOString().slice(0, 10);
    const filename = `${reportType}-report-${todayStr}.csv`;
    let headers: string[] = [];
    let rows: unknown[][] = [];

    switch (reportType) {
      case 'leads': {
        const leads = await prisma.lead.findMany({
          where: query.from || query.to ? {
            createdAt: {
              ...(query.from ? { gte: new Date(query.from) } : {}),
              ...(query.to ? { lte: new Date(query.to) } : {}),
            },
          } : undefined,
          select: {
            leadCode: true,
            firstName: true,
            lastName: true,
            company: true,
            email: true,
            source: true,
            status: true,
            priority: true,
            estimatedValue: true,
            createdAt: true,
          },
          orderBy: { createdAt: 'desc' },
        });

        headers = ['Lead Code', 'Name', 'Company', 'Email', 'Source', 'Status', 'Priority', 'Estimated Value', 'Created At'];
        rows = leads.map((l) => [
          l.leadCode,
          `${l.firstName} ${l.lastName}`.trim(),
          l.company ?? '',
          l.email,
          l.source ?? '',
          l.status,
          l.priority,
          l.estimatedValue ? l.estimatedValue.toFixed(2) : '0.00',
          l.createdAt.toISOString().slice(0, 10),
        ]);
        break;
      }

      case 'clients': {
        const clients = await prisma.client.findMany({
          where: query.from || query.to ? {
            createdAt: {
              ...(query.from ? { gte: new Date(query.from) } : {}),
              ...(query.to ? { lte: new Date(query.to) } : {}),
            },
          } : undefined,
          select: {
            clientCode: true,
            name: true,
            company: true,
            email: true,
            phone: true,
            status: true,
            sourceLeadId: true,
            createdAt: true,
          },
          orderBy: { createdAt: 'desc' },
        });

        headers = ['Client Code', 'Name', 'Company', 'Email', 'Phone', 'Status', 'Source', 'Created At'];
        rows = clients.map((c) => [
          c.clientCode,
          c.name,
          c.company ?? '',
          c.email,
          c.phone ?? '',
          c.status,
          c.sourceLeadId ? 'Converted Lead' : 'Direct',
          c.createdAt.toISOString().slice(0, 10),
        ]);
        break;
      }

      case 'projects': {
        const projects = await prisma.project.findMany({
          where: {
            ...(query.clientId ? { clientId: query.clientId } : {}),
            ...(query.from || query.to ? {
              createdAt: {
                ...(query.from ? { gte: new Date(query.from) } : {}),
                ...(query.to ? { lte: new Date(query.to) } : {}),
              },
            } : {}),
          },
          select: {
            projectCode: true,
            name: true,
            client: { select: { name: true } },
            manager: { select: { firstName: true, lastName: true } },
            status: true,
            priority: true,
            budget: true,
            startDate: true,
            dueDate: true,
            completedAt: true,
          },
          orderBy: { createdAt: 'desc' },
        });

        headers = ['Project Code', 'Name', 'Client', 'Manager', 'Status', 'Priority', 'Budget', 'Start Date', 'Due Date', 'Completed At'];
        rows = projects.map((p) => [
          p.projectCode,
          p.name,
          p.client.name,
          p.manager ? `${p.manager.firstName} ${p.manager.lastName}`.trim() : 'Unassigned',
          p.status,
          p.priority,
          p.budget ? p.budget.toFixed(2) : '0.00',
          p.startDate ? p.startDate.toISOString().slice(0, 10) : '',
          p.dueDate ? p.dueDate.toISOString().slice(0, 10) : '',
          p.completedAt ? p.completedAt.toISOString().slice(0, 10) : '',
        ]);
        break;
      }

      case 'tasks': {
        const tasks = await prisma.task.findMany({
          where: {
            ...(query.projectId ? { projectId: query.projectId } : {}),
            ...(query.employeeId ? { assignees: { some: { employeeId: query.employeeId } } } : {}),
            ...(query.from || query.to ? {
              createdAt: {
                ...(query.from ? { gte: new Date(query.from) } : {}),
                ...(query.to ? { lte: new Date(query.to) } : {}),
              },
            } : {}),
          },
          select: {
            taskCode: true,
            title: true,
            project: { select: { name: true, projectCode: true } },
            status: true,
            priority: true,
            dueDate: true,
            completedAt: true,
          },
          orderBy: { createdAt: 'desc' },
        });

        headers = ['Task Code', 'Title', 'Project', 'Status', 'Priority', 'Due Date', 'Completed At'];
        rows = tasks.map((t) => [
          t.taskCode,
          t.title,
          `${t.project.projectCode} - ${t.project.name}`,
          t.status,
          t.priority,
          t.dueDate ? t.dueDate.toISOString().slice(0, 10) : '',
          t.completedAt ? t.completedAt.toISOString().slice(0, 10) : '',
        ]);
        break;
      }

      case 'employees': {
        const employeesData = await this.getEmployeesReport({ departmentId: query.departmentId });
        headers = ['Employee Code', 'Name', 'Job Title', 'Department', 'Assigned Tasks', 'Completed Tasks', 'Pending Tasks', 'Overdue Tasks', 'Active Projects'];
        rows = employeesData.employees.map((e) => [
          e.employeeCode,
          e.name,
          e.jobTitle,
          e.department ?? 'None',
          e.assignedTasksCount,
          e.completedTasksCount,
          e.pendingTasksCount,
          e.overdueTasksCount,
          e.activeProjectsCount,
        ]);
        break;
      }

      case 'financial': {
        const invoices = await prisma.invoice.findMany({
          where: {
            ...(query.clientId ? { clientId: query.clientId } : {}),
            ...(query.from || query.to ? {
              issueDate: {
                ...(query.from ? { gte: new Date(query.from) } : {}),
                ...(query.to ? { lte: new Date(query.to) } : {}),
              },
            } : {}),
          },
          select: {
            invoiceNumber: true,
            client: { select: { name: true } },
            status: true,
            issueDate: true,
            dueDate: true,
            total: true,
            amountPaid: true,
            balanceDue: true,
          },
          orderBy: { issueDate: 'desc' },
        });

        headers = ['Invoice Number', 'Client', 'Status', 'Issue Date', 'Due Date', 'Total', 'Amount Paid', 'Balance Due'];
        rows = invoices.map((inv) => [
          inv.invoiceNumber,
          inv.client.name,
          inv.status,
          inv.issueDate.toISOString().slice(0, 10),
          inv.dueDate.toISOString().slice(0, 10),
          inv.total.toFixed(2),
          inv.amountPaid.toFixed(2),
          inv.balanceDue.toFixed(2),
        ]);
        break;
      }
    }

    const csvContent = generateCsv(headers, rows);

    // Audit log: REPORT_EXPORTED
    await AuditService.log({
      userId: user.userId,
      action: 'REPORT_EXPORTED',
      entityType: 'REPORT',
      metadata: {
        reportType,
        recordCount: rows.length,
        filters: {
          from: query.from,
          to: query.to,
          preset: query.preset,
          clientId: query.clientId,
          projectId: query.projectId,
        },
      },
      ipAddress,
      userAgent,
    });

    return { csvContent, filename };
  }
}
