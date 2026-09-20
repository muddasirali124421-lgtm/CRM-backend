import { PriorityLevel, Prisma, ProjectStatus } from '@prisma/client';
import prisma from '../../config/database';
import { AuditService } from '../../services/audit.service';
import { AuthenticatedUser } from '../../types/auth.types';
import { AppError } from '../../utils/api-response';
import { NotificationService } from '../notifications/notifications.service';
import { NotificationCategory } from '@prisma/client';
import {
  AddTeamMemberDTO,
  AssignManagerDTO,
  CreateProjectDTO,
  ProjectFilterQuery,
  ProjectTaskSummary,
  SafeClientSummary,
  SafeEmployeeSummary,
  SafeProjectResponse,
  SafeTeamMember,
  UpdateProjectDTO,
} from './projects.types';

export class ProjectsService {
  /**
   * Collision-safe unique project code generator (e.g. PRJ-0001, PRJ-0002)
   */
  public static async generateNextProjectCode(): Promise<string> {
    const projects = await prisma.project.findMany({
      select: { projectCode: true },
    });

    let maxNum = 0;
    for (const project of projects) {
      const match = project.projectCode.match(/PRJ-(\d+)/i);
      if (match && match[1]) {
        const num = parseInt(match[1], 10);
        if (!isNaN(num) && num > maxNum) {
          maxNum = num;
        }
      }
    }

    return `PRJ-${String(maxNum + 1).padStart(4, '0')}`;
  }

  /**
   * Safe mapping from raw Prisma Project record to SafeProjectResponse
   */
  private static formatProject(
    project: any,
    additionalData?: { taskSummary?: ProjectTaskSummary; invoicesCount?: number }
  ): SafeProjectResponse {
    let client: SafeClientSummary | null = null;
    if (project.client) {
      client = {
        id: project.client.id,
        clientCode: project.client.clientCode,
        name: project.client.name,
        company: project.client.company,
        email: project.client.email,
        phone: project.client.phone,
      };
    }

    let manager: SafeEmployeeSummary | null = null;
    if (project.manager) {
      manager = {
        id: project.manager.id,
        employeeCode: project.manager.employeeCode,
        firstName: project.manager.firstName,
        lastName: project.manager.lastName,
        jobTitle: project.manager.jobTitle,
        profileImage: project.manager.profileImage,
        employmentStatus: project.manager.employmentStatus,
      };
    }

    let members: SafeTeamMember[] | undefined = undefined;
    if (project.members && Array.isArray(project.members)) {
      members = project.members.map((m: any) => ({
        id: m.id,
        projectId: m.projectId,
        employeeId: m.employeeId,
        projectRole: m.projectRole,
        joinedAt: m.joinedAt,
        employee: {
          id: m.employee.id,
          employeeCode: m.employee.employeeCode,
          firstName: m.employee.firstName,
          lastName: m.employee.lastName,
          jobTitle: m.employee.jobTitle,
          profileImage: m.employee.profileImage,
          employmentStatus: m.employee.employmentStatus,
        },
      }));
    }

    return {
      id: project.id,
      projectCode: project.projectCode,
      name: project.name,
      description: project.description,
      clientId: project.clientId,
      managerId: project.managerId,
      status: project.status,
      priority: project.priority,
      startDate: project.startDate,
      dueDate: project.dueDate,
      completedAt: project.completedAt,
      budget: project.budget !== null && project.budget !== undefined ? Number(project.budget) : null,
      currency: project.currency,
      createdAt: project.createdAt,
      updatedAt: project.updatedAt,
      client,
      manager,
      members,
      taskSummary: additionalData?.taskSummary,
      invoicesCount: additionalData?.invoicesCount ?? project._count?.invoices ?? 0,
    };
  }

  /**
   * GET /api/projects
   * List projects with search, status, priority, client, manager, team member filters & pagination
   */
  public static async listProjects(query: ProjectFilterQuery) {
    const page = query.page ?? 1;
    const limit = query.limit ?? 20;
    const skip = (page - 1) * limit;

    const where: Prisma.ProjectWhereInput = {};

    // Multi-field search
    if (query.search) {
      where.OR = [
        { projectCode: { contains: query.search, mode: 'insensitive' } },
        { name: { contains: query.search, mode: 'insensitive' } },
        { client: { name: { contains: query.search, mode: 'insensitive' } } },
        { client: { company: { contains: query.search, mode: 'insensitive' } } },
      ];
    }

    if (query.status) {
      where.status = query.status;
    }

    if (query.priority) {
      where.priority = query.priority;
    }

    if (query.clientId) {
      where.clientId = query.clientId;
    }

    if (query.managerId) {
      where.managerId = query.managerId;
    }

    if (query.teamMemberId) {
      where.members = {
        some: { employeeId: query.teamMemberId },
      };
    }

    if (query.startDateFrom || query.startDateTo) {
      where.startDate = {};
      if (query.startDateFrom) where.startDate.gte = query.startDateFrom;
      if (query.startDateTo) where.startDate.lte = query.startDateTo;
    }

    if (query.dueDateFrom || query.dueDateTo) {
      where.dueDate = {};
      if (query.dueDateFrom) where.dueDate.gte = query.dueDateFrom;
      if (query.dueDateTo) where.dueDate.lte = query.dueDateTo;
    }

    const sortBy = query.sortBy ?? 'createdAt';
    const sortOrder = query.sortOrder ?? 'desc';

    const [total, projects] = await Promise.all([
      prisma.project.count({ where }),
      prisma.project.findMany({
        where,
        include: {
          client: true,
          manager: true,
          members: {
            include: { employee: true },
          },
          _count: {
            select: {
              tasks: true,
              invoices: true,
            },
          },
        },
        orderBy: { [sortBy]: sortOrder },
        skip,
        take: limit,
      }),
    ]);

    const totalPages = Math.ceil(total / limit) || 1;

    return {
      projects: projects.map((p) => this.formatProject(p)),
      pagination: {
        page,
        limit,
        total,
        totalPages,
      },
    };
  }

  /**
   * GET /api/projects/:id
   * Detailed project record with client, manager, members, and task status counts
   */
  public static async getProjectById(id: string): Promise<SafeProjectResponse> {
    const project = await prisma.project.findUnique({
      where: { id },
      include: {
        client: true,
        manager: true,
        members: {
          include: { employee: true },
          orderBy: { joinedAt: 'asc' },
        },
        _count: {
          select: {
            invoices: true,
          },
        },
      },
    });

    if (!project) {
      throw new AppError('Project not found', 404);
    }

    // Retrieve summary counts for tasks and invoices
    const [totalTasks, todoTasks, inProgressTasks, qaTasks, revisionTasks, completedTasks] =
      await Promise.all([
        prisma.task.count({ where: { projectId: id } }),
        prisma.task.count({ where: { projectId: id, status: 'TODO' } }),
        prisma.task.count({ where: { projectId: id, status: 'IN_PROGRESS' } }),
        prisma.task.count({ where: { projectId: id, status: 'QA' } }),
        prisma.task.count({ where: { projectId: id, status: 'REVISION' } }),
        prisma.task.count({ where: { projectId: id, status: 'COMPLETED' } }),
      ]);

    const taskSummary: ProjectTaskSummary = {
      total: totalTasks,
      todo: todoTasks,
      inProgress: inProgressTasks,
      qa: qaTasks,
      revision: revisionTasks,
      completed: completedTasks,
    };

    return this.formatProject(project, {
      taskSummary,
      invoicesCount: project._count.invoices,
    });
  }

  /**
   * POST /api/projects
   * Create a new project with server-generated PRJ-XXXX code
   */
  public static async createProject(
    data: CreateProjectDTO,
    actor: AuthenticatedUser
  ): Promise<SafeProjectResponse> {
    // 1. Verify client exists
    const client = await prisma.client.findUnique({
      where: { id: data.clientId },
    });

    if (!client) {
      throw new AppError('Client not found', 400);
    }

    // 2. Verify project manager if provided
    if (data.managerId) {
      const manager = await prisma.employee.findUnique({
        where: { id: data.managerId },
      });

      if (!manager) {
        throw new AppError('Project manager employee not found', 400);
      }

      if (manager.employmentStatus !== 'ACTIVE') {
        throw new AppError('Cannot assign an inactive or terminated employee as project manager', 400);
      }
    }

    // 3. Verify initial team members if provided
    if (data.memberIds && data.memberIds.length > 0) {
      const uniqueMemberIds = Array.from(new Set(data.memberIds));
      const activeEmployees = await prisma.employee.findMany({
        where: {
          id: { in: uniqueMemberIds },
          employmentStatus: 'ACTIVE',
        },
      });

      if (activeEmployees.length !== uniqueMemberIds.length) {
        throw new AppError('One or more team member employees were not found or are inactive', 400);
      }
    }

    // 4. Generate unique sequential project code
    const projectCode = await this.generateNextProjectCode();

    // 5. Create Project record
    const project = await prisma.project.create({
      data: {
        projectCode,
        name: data.name,
        clientId: data.clientId,
        description: data.description?.trim() || null,
        status: data.status || ProjectStatus.PLANNING,
        priority: data.priority || PriorityLevel.MEDIUM,
        startDate: data.startDate || null,
        dueDate: data.dueDate || null,
        budget: data.budget !== undefined ? data.budget : null,
        currency: data.currency || 'USD',
        managerId: data.managerId || null,
        members:
          data.memberIds && data.memberIds.length > 0
            ? {
                create: Array.from(new Set(data.memberIds)).map((empId) => ({
                  employeeId: empId,
                  projectRole: 'MEMBER',
                })),
              }
            : undefined,
      },
      include: {
        client: true,
        manager: true,
        members: {
          include: { employee: true },
        },
      },
    });

    // 6. Record Audit Log
    AuditService.log({
      userId: actor.userId,
      action: 'PROJECT_CREATED',
      entityType: 'PROJECT',
      entityId: project.id,
      metadata: {
        projectCode: project.projectCode,
        name: project.name,
        clientId: project.clientId,
        managerId: project.managerId,
      },
    });

    return this.formatProject(project);
  }

  /**
   * PATCH /api/projects/:id
   * Update project business fields
   */
  public static async updateProject(
    id: string,
    data: UpdateProjectDTO,
    actor: AuthenticatedUser
  ): Promise<SafeProjectResponse> {
    const project = await prisma.project.findUnique({
      where: { id },
    });

    if (!project) {
      throw new AppError('Project not found', 404);
    }

    // Verify client if changed
    if (data.clientId && data.clientId !== project.clientId) {
      const client = await prisma.client.findUnique({
        where: { id: data.clientId },
      });
      if (!client) {
        throw new AppError('Target client not found', 400);
      }
    }

    // Verify manager if changed
    if (data.managerId !== undefined && data.managerId !== null && data.managerId !== project.managerId) {
      const manager = await prisma.employee.findUnique({
        where: { id: data.managerId },
      });
      if (!manager) {
        throw new AppError('Project manager employee not found', 400);
      }
      if (manager.employmentStatus !== 'ACTIVE') {
        throw new AppError('Cannot assign an inactive or terminated employee as project manager', 400);
      }
    }

    // Date consistency validation
    const effectiveStartDate = data.startDate !== undefined ? data.startDate : project.startDate;
    const effectiveDueDate = data.dueDate !== undefined ? data.dueDate : project.dueDate;
    if (effectiveStartDate && effectiveDueDate && effectiveDueDate < effectiveStartDate) {
      throw new AppError('Due date cannot be earlier than start date', 400);
    }

    const updateData: Prisma.ProjectUpdateInput = {};

    if (data.name !== undefined) updateData.name = data.name;
    if (data.description !== undefined) updateData.description = data.description ? data.description.trim() : null;
    if (data.status !== undefined) updateData.status = data.status;
    if (data.priority !== undefined) updateData.priority = data.priority;
    if (data.startDate !== undefined) updateData.startDate = data.startDate;
    if (data.dueDate !== undefined) updateData.dueDate = data.dueDate;
    if (data.budget !== undefined) updateData.budget = data.budget;
    if (data.currency !== undefined) updateData.currency = data.currency;

    if (data.clientId !== undefined) {
      updateData.client = { connect: { id: data.clientId } };
    }

    if (data.managerId !== undefined) {
      updateData.manager = data.managerId ? { connect: { id: data.managerId } } : { disconnect: true };
    }

    // Handle completedAt timestamp transition
    if (data.status === ProjectStatus.COMPLETED && project.status !== ProjectStatus.COMPLETED) {
      updateData.completedAt = data.completedAt !== undefined ? data.completedAt : new Date();
    } else if (data.status && data.status !== ProjectStatus.COMPLETED && project.status === ProjectStatus.COMPLETED) {
      updateData.completedAt = null;
    } else if (data.completedAt !== undefined) {
      updateData.completedAt = data.completedAt;
    }

    const updatedProject = await prisma.project.update({
      where: { id },
      data: updateData,
      include: {
        client: true,
        manager: true,
        members: {
          include: { employee: true },
        },
      },
    });

    if (data.status && data.status !== project.status) {
      AuditService.log({
        userId: actor.userId,
        action: 'PROJECT_STATUS_CHANGED',
        entityType: 'PROJECT',
        entityId: id,
        metadata: {
          projectCode: project.projectCode,
          previousStatus: project.status,
          newStatus: data.status,
        },
      });
    }

    AuditService.log({
      userId: actor.userId,
      action: 'PROJECT_UPDATED',
      entityType: 'PROJECT',
      entityId: id,
      metadata: {
        projectCode: project.projectCode,
        updatedFields: Object.keys(data),
      },
    });

    return this.formatProject(updatedProject);
  }

  /**
   * PATCH /api/projects/:id/manager
   * Assign or reassign Project Manager
   */
  public static async assignManager(
    id: string,
    data: AssignManagerDTO,
    actor: AuthenticatedUser
  ): Promise<SafeProjectResponse> {
    const project = await prisma.project.findUnique({
      where: { id },
    });

    if (!project) {
      throw new AppError('Project not found', 404);
    }

    if (data.employeeId) {
      const manager = await prisma.employee.findUnique({
        where: { id: data.employeeId },
      });

      if (!manager) {
        throw new AppError('Project manager employee not found', 400);
      }

      if (manager.employmentStatus !== 'ACTIVE') {
        throw new AppError('Cannot assign an inactive or terminated employee as project manager', 400);
      }
    }

    const updatedProject = await prisma.project.update({
      where: { id },
      data: {
        manager: data.employeeId ? { connect: { id: data.employeeId } } : { disconnect: true },
      },
      include: {
        client: true,
        manager: true,
        members: {
          include: { employee: true },
        },
      },
    });

    AuditService.log({
      userId: actor.userId,
      action: 'PROJECT_MANAGER_ASSIGNED',
      entityType: 'PROJECT',
      entityId: id,
      metadata: {
        projectCode: project.projectCode,
        previousManagerId: project.managerId,
        newManagerId: data.employeeId,
      },
    });

    // Notify new project manager (failure-isolated)
    if (data.employeeId && data.employeeId !== project.managerId) {
      NotificationService.getUserIdForEmployee(data.employeeId).then((recipientUserId) => {
        if (recipientUserId && recipientUserId !== actor.userId) {
          NotificationService.createNotification({
            userId: recipientUserId,
            type: 'PROJECT_MANAGER_ASSIGNED',
            title: `Assigned as Project Manager: ${project.projectCode}`,
            message: `You were assigned as Project Manager for "${project.name}" by ${actor.email}.`,
            entityType: 'PROJECT',
            entityId: id,
            actorId: actor.userId,
            category: NotificationCategory.PROJECTS,
            metadata: {
              projectCode: project.projectCode,
            },
          }).catch(() => {});
        }
      }).catch(() => {});
    }

    return this.formatProject(updatedProject);
  }

  /**
   * GET /api/projects/:id/team
   * List team members assigned to project
   */
  public static async getTeamMembers(projectId: string): Promise<SafeTeamMember[]> {
    const project = await prisma.project.findUnique({
      where: { id: projectId },
    });

    if (!project) {
      throw new AppError('Project not found', 404);
    }

    const members = await prisma.projectMember.findMany({
      where: { projectId },
      include: { employee: true },
      orderBy: { joinedAt: 'asc' },
    });

    return members.map((m) => ({
      id: m.id,
      projectId: m.projectId,
      employeeId: m.employeeId,
      projectRole: m.projectRole,
      joinedAt: m.joinedAt,
      employee: {
        id: m.employee.id,
        employeeCode: m.employee.employeeCode,
        firstName: m.employee.firstName,
        lastName: m.employee.lastName,
        jobTitle: m.employee.jobTitle,
        profileImage: m.employee.profileImage,
        employmentStatus: m.employee.employmentStatus,
      },
    }));
  }

  /**
   * POST /api/projects/:id/team
   * Add a team member to project
   */
  public static async addTeamMember(
    projectId: string,
    data: AddTeamMemberDTO,
    actor: AuthenticatedUser
  ): Promise<SafeTeamMember> {
    const project = await prisma.project.findUnique({
      where: { id: projectId },
    });

    if (!project) {
      throw new AppError('Project not found', 404);
    }

    const employee = await prisma.employee.findUnique({
      where: { id: data.employeeId },
    });

    if (!employee) {
      throw new AppError('Employee not found', 400);
    }

    if (employee.employmentStatus !== 'ACTIVE') {
      throw new AppError('Cannot assign an inactive or terminated employee to project team', 400);
    }

    // Prevent duplicate team membership
    const existing = await prisma.projectMember.findUnique({
      where: {
        projectId_employeeId: {
          projectId,
          employeeId: data.employeeId,
        },
      },
    });

    if (existing) {
      throw new AppError('Employee is already a member of this project', 409);
    }

    const member = await prisma.projectMember.create({
      data: {
        projectId,
        employeeId: data.employeeId,
        projectRole: data.projectRole || 'MEMBER',
      },
      include: { employee: true },
    });

    AuditService.log({
      userId: actor.userId,
      action: 'PROJECT_TEAM_MEMBER_ADDED',
      entityType: 'PROJECT',
      entityId: projectId,
      metadata: {
        projectCode: project.projectCode,
        employeeId: data.employeeId,
        projectRole: member.projectRole,
      },
    });

    // Notify newly assigned project team member (failure-isolated)
    NotificationService.getUserIdForEmployee(data.employeeId).then((recipientUserId) => {
      if (recipientUserId && recipientUserId !== actor.userId) {
        NotificationService.createNotification({
          userId: recipientUserId,
          type: 'PROJECT_ASSIGNED',
          title: `Assigned to Project: ${project.projectCode}`,
          message: `You were added to project "${project.name}" (${member.projectRole}) by ${actor.email}.`,
          entityType: 'PROJECT',
          entityId: projectId,
          actorId: actor.userId,
          category: NotificationCategory.PROJECTS,
          metadata: {
            projectCode: project.projectCode,
            projectRole: member.projectRole,
          },
        }).catch(() => {});
      }
    }).catch(() => {});

    return {
      id: member.id,
      projectId: member.projectId,
      employeeId: member.employeeId,
      projectRole: member.projectRole,
      joinedAt: member.joinedAt,
      employee: {
        id: member.employee.id,
        employeeCode: member.employee.employeeCode,
        firstName: member.employee.firstName,
        lastName: member.employee.lastName,
        jobTitle: member.employee.jobTitle,
        profileImage: member.employee.profileImage,
        employmentStatus: member.employee.employmentStatus,
      },
    };
  }

  /**
   * DELETE /api/projects/:id/team/:employeeId
   * Remove a team member from project (never deletes the Employee record)
   */
  public static async removeTeamMember(
    projectId: string,
    employeeId: string,
    actor: AuthenticatedUser
  ) {
    const project = await prisma.project.findUnique({
      where: { id: projectId },
    });

    if (!project) {
      throw new AppError('Project not found', 404);
    }

    const member = await prisma.projectMember.findUnique({
      where: {
        projectId_employeeId: {
          projectId,
          employeeId,
        },
      },
    });

    if (!member) {
      throw new AppError('Team member not found on this project', 404);
    }

    await prisma.projectMember.delete({
      where: {
        projectId_employeeId: {
          projectId,
          employeeId,
        },
      },
    });

    AuditService.log({
      userId: actor.userId,
      action: 'PROJECT_TEAM_MEMBER_REMOVED',
      entityType: 'PROJECT',
      entityId: projectId,
      metadata: {
        projectCode: project.projectCode,
        employeeId,
      },
    });

    return {
      success: true,
      message: 'Team member removed from project',
    };
  }

  /**
   * DELETE /api/projects/:id
   * Safe archive / deletion behavior:
   * - If project has tasks or invoices:
   *   Archives project by setting status = CANCELLED without cascade-deleting historical records.
   * - If project is clean (no tasks, no invoices):
   *   Hard-deletes project and its projectMember associations (never deletes Client or Employee!).
   */
  public static async deleteProject(id: string, actor: AuthenticatedUser) {
    const project = await prisma.project.findUnique({
      where: { id },
      include: {
        _count: {
          select: {
            tasks: true,
            invoices: true,
          },
        },
      },
    });

    if (!project) {
      throw new AppError('Project not found', 404);
    }

    const hasHistoricalRecords = project._count.tasks > 0 || project._count.invoices > 0;

    if (hasHistoricalRecords) {
      const updatedProject = await prisma.project.update({
        where: { id },
        data: { status: ProjectStatus.CANCELLED },
        include: {
          client: true,
          manager: true,
          members: {
            include: { employee: true },
          },
        },
      });

      AuditService.log({
        userId: actor.userId,
        action: 'PROJECT_ARCHIVED',
        entityType: 'PROJECT',
        entityId: id,
        metadata: {
          projectCode: project.projectCode,
          reason: 'Project has historical tasks or invoices; archived with status CANCELLED',
        },
      });

      return {
        archived: true,
        project: this.formatProject(updatedProject),
        message: `Project ${project.projectCode} has historical records and was archived (status set to CANCELLED).`,
      };
    }

    // Clean project with no tasks or invoices can be safely deleted
    await prisma.project.delete({ where: { id } });

    AuditService.log({
      userId: actor.userId,
      action: 'PROJECT_DELETED',
      entityType: 'PROJECT',
      entityId: id,
      metadata: { projectCode: project.projectCode },
    });

    return {
      deleted: true,
      message: `Project ${project.projectCode} deleted successfully.`,
    };
  }
}
