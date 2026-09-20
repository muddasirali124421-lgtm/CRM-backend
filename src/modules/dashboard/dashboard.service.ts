import { Prisma } from '@prisma/client';
import prisma from '../../config/database';
import { AuthenticatedUser } from '../../types/auth.types';
import {
  DashboardActivityItem,
  DashboardMyWorkProjectItem,
  DashboardMyWorkResponse,
  DashboardMyWorkTaskItem,
  DashboardOverviewResponse,
} from './dashboard.types';

export class DashboardService {
  /**
   * Retrieves high-level operational metrics across all core modules.
   * Leverages concurrent PostgreSQL aggregations for high performance.
   * Masks financial totals if caller lacks financial permissions.
   */
  public static async getOverview(user: AuthenticatedUser): Promise<DashboardOverviewResponse> {
    const now = new Date();

    // Check financial permission capability
    const canViewFinancial =
      user.isSuperAdmin ||
      user.permissions.has('payments.view') ||
      user.permissions.has('reports.view_financial') ||
      user.permissions.has('payments.view_financial');

    // Run database aggregations concurrently
    const [
      activeEmployeesCount,
      totalLeadsCount,
      newLeadsCount,
      qualifiedLeadsCount,
      totalClientsCount,
      activeClientsCount,
      totalProjectsCount,
      activeProjectsCount,
      completedProjectsCount,
      totalTasksCount,
      pendingTasksCount,
      overdueTasksCount,
      completedTasksCount,
      financialAgg,
    ] = await Promise.all([
      // Employees
      prisma.employee.count({
        where: { employmentStatus: 'ACTIVE' },
      }),

      // Leads
      prisma.lead.count(),
      prisma.lead.count({ where: { status: 'NEW' } }),
      prisma.lead.count({ where: { status: 'QUALIFIED' } }),

      // Clients
      prisma.client.count(),
      prisma.client.count({ where: { status: 'ACTIVE' } }),

      // Projects
      prisma.project.count(),
      prisma.project.count({
        where: { status: { in: ['PLANNING', 'IN_PROGRESS', 'QA_REVIEW', 'REVISION'] } },
      }),
      prisma.project.count({ where: { status: 'COMPLETED' } }),

      // Tasks
      prisma.task.count(),
      prisma.task.count({
        where: { status: { in: ['TODO', 'IN_PROGRESS', 'QA', 'REVISION'] } },
      }),
      prisma.task.count({
        where: {
          status: { not: 'COMPLETED' },
          dueDate: { lt: now },
        },
      }),
      prisma.task.count({ where: { status: 'COMPLETED' } }),

      // Financial (only query if authorized)
      canViewFinancial
        ? prisma.invoice.aggregate({
            where: { status: { not: 'CANCELLED' } },
            _sum: {
              total: true,
              amountPaid: true,
              balanceDue: true,
            },
          })
        : Promise.resolve(null),
    ]);

    let financial: DashboardOverviewResponse['financial'] = null;

    if (canViewFinancial && financialAgg) {
      const invoiced = financialAgg._sum.total ?? new Prisma.Decimal(0);
      const received = financialAgg._sum.amountPaid ?? new Prisma.Decimal(0);
      const outstanding = financialAgg._sum.balanceDue ?? new Prisma.Decimal(0);

      financial = {
        totalInvoiced: invoiced.toFixed(2),
        totalReceived: received.toFixed(2),
        totalOutstanding: outstanding.toFixed(2),
      };
    }

    return {
      employees: {
        totalActive: activeEmployeesCount,
      },
      leads: {
        total: totalLeadsCount,
        new: newLeadsCount,
        qualified: qualifiedLeadsCount,
      },
      clients: {
        total: totalClientsCount,
        active: activeClientsCount,
      },
      projects: {
        total: totalProjectsCount,
        active: activeProjectsCount,
        completed: completedProjectsCount,
      },
      tasks: {
        total: totalTasksCount,
        pending: pendingTasksCount,
        overdue: overdueTasksCount,
        completed: completedTasksCount,
      },
      financial,
    };
  }

  /**
   * Retrieves recent CRM activity from the audit log with safe actor details.
   */
  public static async getRecentActivity(limit = 15): Promise<DashboardActivityItem[]> {
    const safeLimit = Math.min(Math.max(1, limit), 50);

    const logs = await prisma.auditLog.findMany({
      take: safeLimit,
      orderBy: { createdAt: 'desc' },
      include: {
        user: {
          select: {
            id: true,
            email: true,
            employee: {
              select: {
                firstName: true,
                lastName: true,
              },
            },
          },
        },
      },
    });

    return logs.map((log) => ({
      id: log.id,
      action: log.action,
      entityType: log.entityType,
      entityId: log.entityId,
      metadata: log.metadata,
      createdAt: log.createdAt,
      actor: log.user
        ? {
            id: log.user.id,
            name: log.user.employee
              ? `${log.user.employee.firstName} ${log.user.employee.lastName}`.trim()
              : log.user.email,
            email: log.user.email,
          }
        : null,
    }));
  }

  /**
   * Retrieves personal work queue for the authenticated staff user.
   * Safely resolves employee profile from user context and prevents viewing other users' queues.
   */
  public static async getMyWork(user: AuthenticatedUser): Promise<DashboardMyWorkResponse> {
    // Resolve employeeId from request or database
    let employeeId = user.employeeId;

    if (!employeeId) {
      const dbUser = await prisma.user.findUnique({
        where: { id: user.userId },
        select: { employeeId: true },
      });
      employeeId = dbUser?.employeeId ?? undefined;
    }

    // If user has no employee profile, return safe empty response
    if (!employeeId) {
      return {
        summary: {
          assignedProjectsCount: 0,
          assignedTasksCount: 0,
          dueTodayCount: 0,
          overdueCount: 0,
          inProgressCount: 0,
          awaitingQaCount: 0,
        },
        assignedProjects: [],
        assignedTasks: [],
      };
    }

    const now = new Date();
    const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0, 0);
    const endOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59, 999);

    // Fetch assigned projects (managed or member, active)
    const projects = await prisma.project.findMany({
      where: {
        status: { notIn: ['COMPLETED', 'CANCELLED'] },
        OR: [
          { managerId: employeeId },
          { members: { some: { employeeId } } },
        ],
      },
      select: {
        id: true,
        projectCode: true,
        name: true,
        status: true,
        priority: true,
        dueDate: true,
        client: {
          select: {
            id: true,
            name: true,
            company: true,
          },
        },
      },
      orderBy: [{ dueDate: 'asc' }, { priority: 'desc' }],
    });

    // Fetch assigned tasks (where status is not COMPLETED)
    const tasks = await prisma.task.findMany({
      where: {
        status: { not: 'COMPLETED' },
        assignees: { some: { employeeId } },
      },
      select: {
        id: true,
        taskCode: true,
        title: true,
        status: true,
        priority: true,
        dueDate: true,
        project: {
          select: {
            id: true,
            name: true,
            projectCode: true,
          },
        },
      },
      orderBy: [{ dueDate: 'asc' }, { priority: 'desc' }],
    });

    // Compute summary counts
    let dueTodayCount = 0;
    let overdueCount = 0;
    let inProgressCount = 0;
    let awaitingQaCount = 0;

    for (const t of tasks) {
      if (t.status === 'IN_PROGRESS') inProgressCount++;
      if (t.status === 'QA' || t.status === 'REVISION') awaitingQaCount++;

      if (t.dueDate) {
        const dueTime = t.dueDate.getTime();
        if (dueTime >= startOfToday.getTime() && dueTime <= endOfToday.getTime()) {
          dueTodayCount++;
        } else if (dueTime < startOfToday.getTime()) {
          overdueCount++;
        }
      }
    }

    const mappedProjects: DashboardMyWorkProjectItem[] = projects.map((p) => ({
      id: p.id,
      projectCode: p.projectCode,
      name: p.name,
      status: p.status,
      priority: p.priority,
      dueDate: p.dueDate,
      client: {
        id: p.client.id,
        name: p.client.name,
        company: p.client.company,
      },
    }));

    const mappedTasks: DashboardMyWorkTaskItem[] = tasks.map((t) => ({
      id: t.id,
      taskCode: t.taskCode,
      title: t.title,
      status: t.status,
      priority: t.priority,
      dueDate: t.dueDate,
      project: {
        id: t.project.id,
        name: t.project.name,
        projectCode: t.project.projectCode,
      },
    }));

    return {
      summary: {
        assignedProjectsCount: projects.length,
        assignedTasksCount: tasks.length,
        dueTodayCount,
        overdueCount,
        inProgressCount,
        awaitingQaCount,
      },
      assignedProjects: mappedProjects,
      assignedTasks: mappedTasks,
    };
  }
}
