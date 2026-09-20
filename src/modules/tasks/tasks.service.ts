import { PriorityLevel, Prisma, TaskStatus } from '@prisma/client';
import prisma from '../../config/database';
import { AuditService } from '../../services/audit.service';
import { AuthenticatedUser } from '../../types/auth.types';
import { AppError } from '../../utils/api-response';
import { NotificationService } from '../notifications/notifications.service';
import { NotificationCategory } from '@prisma/client';
import {
  AddAssigneeDTO,
  CreateChecklistItemDTO,
  CreateCommentDTO,
  CreateSubtaskDTO,
  CreateTaskDTO,
  KanbanColumnsResponse,
  ReorderChecklistDTO,
  SafeClientSummary,
  SafeEmployeeSummary,
  SafeProjectSummary,
  SafeTaskActivity,
  SafeTaskAssigneeSummary,
  SafeTaskAttachment,
  SafeTaskChecklistItem,
  SafeTaskComment,
  SafeTaskDetailsResponse,
  SafeTaskResponse,
  SafeTaskSubtask,
  SafeUserSummary,
  TaskFilterQuery,
  UpdateChecklistItemDTO,
  UpdateCommentDTO,
  UpdateTaskDTO,
} from './tasks.types';

export class TasksService {
  /**
   * Collision-safe unique task code generator (e.g. TASK-0001, TASK-0002)
   */
  public static async generateNextTaskCode(): Promise<string> {
    const tasks = await prisma.task.findMany({
      select: { taskCode: true },
    });

    let maxNum = 0;
    for (const task of tasks) {
      const match = task.taskCode.match(/TASK-(\d+)/i);
      if (match && match[1]) {
        const num = parseInt(match[1], 10);
        if (!isNaN(num) && num > maxNum) {
          maxNum = num;
        }
      }
    }

    return `TASK-${String(maxNum + 1).padStart(4, '0')}`;
  }

  /**
   * Compute dynamic overdue status:
   * dueDate < now AND status != COMPLETED
   */
  public static calculateIsOverdue(dueDate: Date | null, status: TaskStatus): boolean {
    if (!dueDate) return false;
    return new Date(dueDate).getTime() < Date.now() && status !== TaskStatus.COMPLETED;
  }

  /**
   * Safe mapping for Employee display
   */
  private static formatEmployee(emp: any): SafeEmployeeSummary {
    return {
      id: emp.id,
      employeeCode: emp.employeeCode,
      firstName: emp.firstName,
      lastName: emp.lastName,
      jobTitle: emp.jobTitle,
      profileImage: emp.profileImage ?? null,
      employmentStatus: emp.employmentStatus,
    };
  }

  /**
   * Safe mapping for Client display
   */
  private static formatClient(client: any): SafeClientSummary | null {
    if (!client) return null;
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
  private static formatProject(project: any): SafeProjectSummary {
    return {
      id: project.id,
      projectCode: project.projectCode,
      name: project.name,
      status: project.status,
      priority: project.priority,
    };
  }

  /**
   * Safe mapping for User display (creator/actor/author)
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
   * Safe mapping for Assignees
   */
  private static formatAssignee(assignee: any): SafeTaskAssigneeSummary {
    return {
      id: assignee.id,
      taskId: assignee.taskId,
      employeeId: assignee.employeeId,
      assignedAt: assignee.assignedAt,
      employee: this.formatEmployee(assignee.employee),
    };
  }

  /**
   * Safe mapping for a single Task record
   */
  private static formatTask(task: any): SafeTaskResponse {
    const isOverdue = this.calculateIsOverdue(task.dueDate, task.status);

    const checklistTotal = task.checklists?.length ?? 0;
    const checklistCompleted = task.checklists?.filter((c: any) => c.isCompleted).length ?? 0;

    return {
      id: task.id,
      taskCode: task.taskCode,
      title: task.title,
      description: task.description ?? null,
      projectId: task.projectId,
      project: this.formatProject(task.project),
      clientId: task.clientId ?? null,
      client: this.formatClient(task.client),
      createdById: task.createdById ?? null,
      createdBy: this.formatUser(task.createdBy),
      status: task.status,
      priority: task.priority,
      startDate: task.startDate,
      dueDate: task.dueDate,
      completedAt: task.completedAt,
      isOverdue,
      parentTaskId: task.parentTaskId ?? null,
      createdAt: task.createdAt,
      updatedAt: task.updatedAt,
      assignees: (task.assignees ?? []).map((a: any) => this.formatAssignee(a)),
      checklistSummary:
        checklistTotal > 0 || task.checklists
          ? {
              total: checklistTotal,
              completed: checklistCompleted,
            }
          : undefined,
      commentsCount: task._count?.comments ?? (task.comments ? task.comments.length : undefined),
      subtasksCount: task._count?.subtasks ?? (task.subtasks ? task.subtasks.length : undefined),
    };
  }

  /**
   * List Tasks with filtering, searching, sorting, pagination, and Kanban view support
   */
  public static async listTasks(
    query: TaskFilterQuery
  ): Promise<{ items: SafeTaskResponse[]; pagination: any } | KanbanColumnsResponse> {
    const {
      page = 1,
      limit = 20,
      search,
      status,
      priority,
      projectId,
      clientId,
      assigneeId,
      createdById,
      dueDateFrom,
      dueDateTo,
      overdue,
      sortBy = 'createdAt',
      sortOrder = 'desc',
      view = 'list',
    } = query;

    const where: Prisma.TaskWhereInput = {};

    // Search filter across taskCode, title, project name, and client company/name
    if (search) {
      where.OR = [
        { taskCode: { contains: search, mode: 'insensitive' } },
        { title: { contains: search, mode: 'insensitive' } },
        { project: { name: { contains: search, mode: 'insensitive' } } },
        { client: { company: { contains: search, mode: 'insensitive' } } },
        { client: { name: { contains: search, mode: 'insensitive' } } },
      ];
    }

    if (status) where.status = status;
    if (priority) where.priority = priority;
    if (projectId) where.projectId = projectId;
    if (clientId) where.clientId = clientId;
    if (createdById) where.createdById = createdById;

    if (assigneeId) {
      where.assignees = {
        some: { employeeId: assigneeId },
      };
    }

    // Due date range filtering
    if (dueDateFrom || dueDateTo) {
      where.dueDate = {};
      if (dueDateFrom) where.dueDate.gte = dueDateFrom;
      if (dueDateTo) where.dueDate.lte = dueDateTo;
    }

    // Overdue filter: dueDate < now && status != COMPLETED
    if (overdue === true) {
      where.dueDate = { lt: new Date() };
      where.status = { not: TaskStatus.COMPLETED };
    } else if (overdue === false) {
      where.OR = [
        { dueDate: null },
        { dueDate: { gte: new Date() } },
        { status: TaskStatus.COMPLETED },
      ];
    }

    const taskInclude = {
      project: true,
      client: true,
      createdBy: {
        include: {
          employee: true,
        },
      },
      assignees: {
        include: {
          employee: true,
        },
      },
      checklists: true,
      _count: {
        select: {
          comments: true,
          subtasks: true,
        },
      },
    };

    // Kanban View: Return tasks grouped by status columns
    if (view === 'kanban') {
      const allTasks = await prisma.task.findMany({
        where,
        include: taskInclude,
        orderBy: { [sortBy]: sortOrder },
      });

      const formatted = allTasks.map((t) => this.formatTask(t));

      const columns: Record<TaskStatus, SafeTaskResponse[]> = {
        [TaskStatus.TODO]: [],
        [TaskStatus.IN_PROGRESS]: [],
        [TaskStatus.QA]: [],
        [TaskStatus.REVISION]: [],
        [TaskStatus.COMPLETED]: [],
      };

      for (const t of formatted) {
        if (columns[t.status]) {
          columns[t.status].push(t);
        }
      }

      return {
        view: 'kanban',
        columns,
        total: formatted.length,
      };
    }

    // Standard List View with pagination
    const [total, rawTasks] = await Promise.all([
      prisma.task.count({ where }),
      prisma.task.findMany({
        where,
        include: taskInclude,
        skip: (page - 1) * limit,
        take: limit,
        orderBy: { [sortBy]: sortOrder },
      }),
    ]);

    const items = rawTasks.map((t) => this.formatTask(t));
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
   * Get complete Task Details payload for modal/details view
   */
  public static async getTaskById(id: string): Promise<SafeTaskDetailsResponse> {
    const task = await prisma.task.findUnique({
      where: { id },
      include: {
        project: true,
        client: true,
        createdBy: {
          include: {
            employee: true,
          },
        },
        assignees: {
          include: {
            employee: true,
          },
        },
        checklists: {
          orderBy: [{ position: 'asc' }, { createdAt: 'asc' }],
        },
        subtasks: {
          include: {
            assignees: {
              include: {
                employee: true,
              },
            },
          },
          orderBy: { createdAt: 'asc' },
        },
        comments: {
          where: { parentId: null },
          include: {
            author: {
              include: {
                employee: true,
              },
            },
            replies: {
              include: {
                author: {
                  include: {
                    employee: true,
                  },
                },
              },
              orderBy: { createdAt: 'asc' },
            },
          },
          orderBy: { createdAt: 'asc' },
        },
        activities: {
          include: {
            actor: {
              include: {
                employee: true,
              },
            },
          },
          orderBy: { createdAt: 'desc' },
        },
      },
    });

    if (!task) {
      throw new AppError('Task not found', 404);
    }

    // Fetch related File Assets metadata (polymorphic relation)
    const fileAssets = await prisma.fileAsset.findMany({
      where: {
        relatedType: 'TASK',
        relatedId: id,
      },
      orderBy: { createdAt: 'desc' },
    });

    const attachments: SafeTaskAttachment[] = fileAssets.map((f) => ({
      id: f.id,
      name: f.name,
      originalName: f.originalName,
      mimeType: f.mimeType,
      size: Number(f.size),
      storageProvider: f.storageProvider,
      accessLevel: f.accessLevel,
      createdAt: f.createdAt,
    }));

    const checklist: SafeTaskChecklistItem[] = task.checklists.map((c) => ({
      id: c.id,
      taskId: c.taskId,
      title: c.title,
      isCompleted: c.isCompleted,
      position: c.position,
      createdAt: c.createdAt,
      updatedAt: c.updatedAt,
    }));

    const subtasks: SafeTaskSubtask[] = task.subtasks.map((st) => ({
      id: st.id,
      taskCode: st.taskCode,
      title: st.title,
      status: st.status,
      priority: st.priority,
      startDate: st.startDate,
      dueDate: st.dueDate,
      completedAt: st.completedAt,
      isOverdue: this.calculateIsOverdue(st.dueDate, st.status),
      createdAt: st.createdAt,
      assignees: (st.assignees ?? []).map((a: any) => this.formatAssignee(a)),
    }));

    const comments: SafeTaskComment[] = task.comments.map((cm) => ({
      id: cm.id,
      taskId: cm.taskId,
      authorId: cm.authorId,
      parentId: cm.parentId,
      content: cm.content,
      createdAt: cm.createdAt,
      updatedAt: cm.updatedAt,
      author: this.formatUser(cm.author)!,
      replies: (cm.replies ?? []).map((rp: any) => ({
        id: rp.id,
        taskId: rp.taskId,
        authorId: rp.authorId,
        parentId: rp.parentId,
        content: rp.content,
        createdAt: rp.createdAt,
        updatedAt: rp.updatedAt,
        author: this.formatUser(rp.author)!,
      })),
    }));

    const activities: SafeTaskActivity[] = task.activities.map((act) => ({
      id: act.id,
      taskId: act.taskId,
      actorId: act.actorId,
      action: act.action,
      metadata: act.metadata,
      createdAt: act.createdAt,
      actor: this.formatUser(act.actor),
    }));

    const baseFormatted = this.formatTask(task);

    return {
      ...baseFormatted,
      checklist,
      subtasks,
      comments,
      activities,
      attachments,
    };
  }

  /**
   * Create a new Task with assignees, collision-safe code, and activity log
   */
  public static async createTask(data: CreateTaskDTO, user: AuthenticatedUser): Promise<SafeTaskResponse> {
    // 1. Verify Project exists and is active
    const project = await prisma.project.findUnique({
      where: { id: data.projectId },
      include: {
        members: {
          include: {
            employee: true,
          },
        },
      },
    });

    if (!project) {
      throw new AppError('Project not found', 404);
    }

    if (project.status === 'CANCELLED') {
      throw new AppError('Cannot create tasks in a cancelled project', 400);
    }

    // 2. Validate and derive Client
    let resolvedClientId = project.clientId;
    if (data.clientId) {
      if (project.clientId && data.clientId !== project.clientId) {
        throw new AppError('Provided clientId conflicts with project client', 400);
      }
      resolvedClientId = data.clientId;
    }

    // 3. Validate Assignees: must exist, be ACTIVE, and be Project Members
    const validAssigneeIds: string[] = [];
    if (data.assigneeIds && data.assigneeIds.length > 0) {
      const uniqueIds = Array.from(new Set(data.assigneeIds));
      for (const empId of uniqueIds) {
        const emp = await prisma.employee.findUnique({ where: { id: empId } });
        if (!emp) {
          throw new AppError(`Employee ${empId} not found`, 404);
        }
        if (emp.employmentStatus !== 'ACTIVE') {
          throw new AppError(
            `Employee ${emp.firstName} ${emp.lastName} is not ACTIVE (${emp.employmentStatus})`,
            400
          );
        }

        const isMember =
          project.managerId === empId || project.members.some((m) => m.employeeId === empId);
        if (!isMember) {
          throw new AppError(
            `Employee ${emp.firstName} ${emp.lastName} (${emp.employeeCode}) is not a member of project ${project.name}. Assignees must be members of the project team.`,
            400
          );
        }
        validAssigneeIds.push(empId);
      }
    }

    // 4. Generate unique task code
    const taskCode = await this.generateNextTaskCode();

    const isCompleted = data.status === TaskStatus.COMPLETED;
    const completedAt = isCompleted ? new Date() : null;

    // 5. Execute creation within a Prisma transaction
    const createdTask = await prisma.$transaction(async (tx) => {
      const task = await tx.task.create({
        data: {
          taskCode,
          title: data.title,
          description: data.description ?? null,
          projectId: data.projectId,
          clientId: resolvedClientId,
          createdById: user.userId,
          status: data.status ?? TaskStatus.TODO,
          priority: data.priority ?? PriorityLevel.MEDIUM,
          startDate: data.startDate ?? null,
          dueDate: data.dueDate ?? null,
          completedAt,
        },
      });

      // Create assignees
      if (validAssigneeIds.length > 0) {
        await tx.taskAssignee.createMany({
          data: validAssigneeIds.map((empId) => ({
            taskId: task.id,
            employeeId: empId,
          })),
        });
      }

      // Record TaskActivity
      await tx.taskActivity.create({
        data: {
          taskId: task.id,
          actorId: user.userId,
          action: 'TASK_CREATED',
          metadata: {
            taskCode,
            title: task.title,
            projectId: task.projectId,
            priority: task.priority,
            status: task.status,
            assigneeCount: validAssigneeIds.length,
          },
        },
      });

      return task;
    });

    // 6. Record general AuditLog entry
    await AuditService.log({
      userId: user.userId,
      action: 'TASK_CREATED',
      entityType: 'TASK',
      entityId: createdTask.id,
      metadata: {
        taskCode: createdTask.taskCode,
        title: createdTask.title,
        projectId: createdTask.projectId,
      },
    });

    // Notify newly assigned employees (failure-isolated)
    for (const empId of validAssigneeIds) {
      NotificationService.getUserIdForEmployee(empId).then((recipientUserId) => {
        if (recipientUserId) {
          NotificationService.createNotification({
            userId: recipientUserId,
            type: 'TASK_ASSIGNED',
            title: `Assigned to Task: ${createdTask.taskCode}`,
            message: `You were assigned to task "${createdTask.title}" by ${user.email}.`,
            entityType: 'TASK',
            entityId: createdTask.id,
            actorId: user.userId,
            category: NotificationCategory.TASKS,
            metadata: {
              taskCode: createdTask.taskCode,
              projectId: createdTask.projectId,
            },
          }).catch(() => {});
        }
      }).catch(() => {});
    }

    // 7. Return formatted task
    const fullTask = await prisma.task.findUnique({
      where: { id: createdTask.id },
      include: {
        project: true,
        client: true,
        createdBy: { include: { employee: true } },
        assignees: { include: { employee: true } },
        checklists: true,
      },
    });

    return this.formatTask(fullTask);
  }

  /**
   * Update task fields (title, description, priority, dates)
   */
  public static async updateTask(
    id: string,
    data: UpdateTaskDTO,
    user: AuthenticatedUser
  ): Promise<SafeTaskResponse> {
    const existing = await prisma.task.findUnique({ where: { id } });
    if (!existing) {
      throw new AppError('Task not found', 404);
    }

    const updates: Prisma.TaskUpdateInput = {};
    const activitiesToCreate: { action: string; metadata: any }[] = [];

    if (data.title !== undefined) updates.title = data.title;
    if (data.description !== undefined) updates.description = data.description;

    if (data.priority !== undefined && data.priority !== existing.priority) {
      updates.priority = data.priority;
      activitiesToCreate.push({
        action: 'TASK_PRIORITY_CHANGED',
        metadata: { oldPriority: existing.priority, newPriority: data.priority },
      });
    }

    if (data.startDate !== undefined) updates.startDate = data.startDate;
    if (data.dueDate !== undefined) {
      const oldDue = existing.dueDate ? existing.dueDate.toISOString() : null;
      const newDue = data.dueDate ? data.dueDate.toISOString() : null;
      if (oldDue !== newDue) {
        updates.dueDate = data.dueDate;
        activitiesToCreate.push({
          action: 'TASK_DUE_DATE_CHANGED',
          metadata: { oldDueDate: oldDue, newDueDate: newDue },
        });
      }
    }

    if (activitiesToCreate.length === 0) {
      activitiesToCreate.push({
        action: 'TASK_UPDATED',
        metadata: { updatedFields: Object.keys(updates) },
      });
    }

    await prisma.$transaction(async (tx) => {
      await tx.task.update({
        where: { id },
        data: updates,
      });

      for (const act of activitiesToCreate) {
        await tx.taskActivity.create({
          data: {
            taskId: id,
            actorId: user.userId,
            action: act.action,
            metadata: act.metadata,
          },
        });
      }
    });

    const updated = await prisma.task.findUnique({
      where: { id },
      include: {
        project: true,
        client: true,
        createdBy: { include: { employee: true } },
        assignees: { include: { employee: true } },
        checklists: true,
      },
    });

    return this.formatTask(updated);
  }

  /**
   * Dedicated Kanban drag/drop status update endpoint
   * Enforces approval permission when transitioning from QA to COMPLETED
   * Idempotent: returns immediately if status is already requested value
   */
  public static async updateTaskStatus(
    id: string,
    newStatus: TaskStatus,
    user: AuthenticatedUser
  ): Promise<SafeTaskResponse> {
    const existing = await prisma.task.findUnique({ where: { id } });
    if (!existing) {
      throw new AppError('Task not found', 404);
    }

    // Idempotency: no changes or redundant activity logs if status matches
    if (existing.status === newStatus) {
      const current = await prisma.task.findUnique({
        where: { id },
        include: {
          project: true,
          client: true,
          createdBy: { include: { employee: true } },
          assignees: { include: { employee: true } },
          checklists: true,
        },
      });
      return this.formatTask(current);
    }

    // QA -> COMPLETED approval enforcement
    if (existing.status === TaskStatus.QA && newStatus === TaskStatus.COMPLETED) {
      if (!user.isSuperAdmin && !user.permissions.has('tasks.approve')) {
        throw new AppError('Moving a task from QA to COMPLETED requires tasks.approve permission', 403);
      }
    }

    // Determine completedAt behavior
    let completedAt = existing.completedAt;
    let action = 'TASK_STATUS_CHANGED';

    if (newStatus === TaskStatus.COMPLETED) {
      completedAt = new Date();
      action = 'TASK_COMPLETED';
    } else if (existing.status === TaskStatus.COMPLETED) {
      completedAt = null;
      action = 'TASK_REOPENED';
    }

    await prisma.$transaction(async (tx) => {
      await tx.task.update({
        where: { id },
        data: {
          status: newStatus,
          completedAt,
        },
      });

      await tx.taskActivity.create({
        data: {
          taskId: id,
          actorId: user.userId,
          action,
          metadata: {
            oldStatus: existing.status,
            newStatus,
            completedAt: completedAt ? completedAt.toISOString() : null,
          },
        },
      });
    });

    // Record general AuditLog entry for significant status change
    await AuditService.log({
      userId: user.userId,
      action: action,
      entityType: 'TASK',
      entityId: id,
      metadata: {
        taskCode: existing.taskCode,
        oldStatus: existing.status,
        newStatus,
      },
    });

    const updated = await prisma.task.findUnique({
      where: { id },
      include: {
        project: true,
        client: true,
        createdBy: { include: { employee: true } },
        assignees: { include: { employee: true } },
        checklists: true,
      },
    });

    // Notify task assignees & manager of status transition (failure-isolated)
    if (updated) {
      const recipientEmpIds = new Set<string>();
      for (const a of updated.assignees) recipientEmpIds.add(a.employeeId);
      if (updated.project?.managerId) recipientEmpIds.add(updated.project.managerId);

      for (const empId of Array.from(recipientEmpIds)) {
        NotificationService.getUserIdForEmployee(empId).then((recipientUserId) => {
          if (recipientUserId && recipientUserId !== user.userId) {
            NotificationService.createNotification({
              userId: recipientUserId,
              type: 'TASK_STATUS_CHANGED',
              title: `Task Status Updated: ${updated.taskCode}`,
              message: `Task "${updated.title}" was moved to ${newStatus} by ${user.email}.`,
              entityType: 'TASK',
              entityId: updated.id,
              actorId: user.userId,
              category: NotificationCategory.TASKS,
              metadata: {
                taskCode: updated.taskCode,
                oldStatus: existing.status,
                newStatus,
              },
            }).catch(() => {});
          }
        }).catch(() => {});
      }
    }

    return this.formatTask(updated);
  }

  /**
   * Delete Task and record AuditLog
   */
  public static async deleteTask(id: string, user: AuthenticatedUser): Promise<{ id: string; message: string }> {
    const existing = await prisma.task.findUnique({ where: { id } });
    if (!existing) {
      throw new AppError('Task not found', 404);
    }

    await prisma.task.delete({ where: { id } });

    await AuditService.log({
      userId: user.userId,
      action: 'TASK_DELETED',
      entityType: 'TASK',
      entityId: id,
      metadata: {
        taskCode: existing.taskCode,
        title: existing.title,
        projectId: existing.projectId,
      },
    });

    return { id, message: `Task ${existing.taskCode} deleted successfully` };
  }

  // ==========================================================================
  // ASSIGNEES
  // ==========================================================================

  public static async getAssignees(taskId: string): Promise<SafeTaskAssigneeSummary[]> {
    const task = await prisma.task.findUnique({
      where: { id: taskId },
      include: {
        assignees: {
          include: {
            employee: true,
          },
        },
      },
    });

    if (!task) {
      throw new AppError('Task not found', 404);
    }

    return task.assignees.map((a) => this.formatAssignee(a));
  }

  public static async addAssignee(
    taskId: string,
    data: AddAssigneeDTO,
    user: AuthenticatedUser
  ): Promise<SafeTaskAssigneeSummary> {
    const task = await prisma.task.findUnique({
      where: { id: taskId },
      include: { project: true },
    });
    if (!task) {
      throw new AppError('Task not found', 404);
    }

    // Verify employee exists and is active
    const employee = await prisma.employee.findUnique({
      where: { id: data.employeeId },
    });
    if (!employee) {
      throw new AppError('Employee not found', 404);
    }
    if (employee.employmentStatus !== 'ACTIVE') {
      throw new AppError(
        `Employee ${employee.firstName} ${employee.lastName} is not ACTIVE (${employee.employmentStatus})`,
        400
      );
    }

    // Verify employee is a member of the project team (or project manager)
    const isMember =
      task.project.managerId === data.employeeId ||
      !!(await prisma.projectMember.findUnique({
        where: {
          projectId_employeeId: {
            projectId: task.projectId,
            employeeId: data.employeeId,
          },
        },
      }));
    if (!isMember) {
      throw new AppError(
        `Employee ${employee.firstName} ${employee.lastName} (${employee.employeeCode}) is not a member of project ${task.project.name}. Assignees must be members of the project team.`,
        400
      );
    }

    // Prevent duplicate assignment
    const existingAssignee = await prisma.taskAssignee.findUnique({
      where: {
        taskId_employeeId: {
          taskId,
          employeeId: data.employeeId,
        },
      },
    });
    if (existingAssignee) {
      throw new AppError('Employee is already assigned to this task', 409);
    }

    const created = await prisma.$transaction(async (tx) => {
      const assignee = await tx.taskAssignee.create({
        data: {
          taskId,
          employeeId: data.employeeId,
        },
        include: {
          employee: true,
        },
      });

      await tx.taskActivity.create({
        data: {
          taskId,
          actorId: user.userId,
          action: 'TASK_ASSIGNEE_ADDED',
          metadata: {
            employeeId: employee.id,
            employeeName: `${employee.firstName} ${employee.lastName}`,
            employeeCode: employee.employeeCode,
          },
        },
      });

      return assignee;
    });

    // Notify assigned employee (failure-isolated)
    NotificationService.getUserIdForEmployee(employee.id).then((recipientUserId) => {
      if (recipientUserId) {
        NotificationService.createNotification({
          userId: recipientUserId,
          type: 'TASK_ASSIGNED',
          title: `Assigned to Task: ${task.taskCode}`,
          message: `You were assigned to task "${task.title}" by ${user.email}.`,
          entityType: 'TASK',
          entityId: task.id,
          actorId: user.userId,
          category: NotificationCategory.TASKS,
          metadata: {
            taskCode: task.taskCode,
            projectId: task.projectId,
          },
        }).catch(() => {});
      }
    }).catch(() => {});

    return this.formatAssignee(created);
  }

  public static async removeAssignee(
    taskId: string,
    employeeId: string,
    user: AuthenticatedUser
  ): Promise<{ message: string }> {
    const task = await prisma.task.findUnique({ where: { id: taskId } });
    if (!task) {
      throw new AppError('Task not found', 404);
    }

    const assignee = await prisma.taskAssignee.findUnique({
      where: {
        taskId_employeeId: {
          taskId,
          employeeId,
        },
      },
      include: {
        employee: true,
      },
    });

    if (!assignee) {
      throw new AppError('Assignee not found on this task', 404);
    }

    await prisma.$transaction(async (tx) => {
      await tx.taskAssignee.delete({
        where: {
          taskId_employeeId: {
            taskId,
            employeeId,
          },
        },
      });

      await tx.taskActivity.create({
        data: {
          taskId,
          actorId: user.userId,
          action: 'TASK_ASSIGNEE_REMOVED',
          metadata: {
            employeeId: assignee.employee.id,
            employeeName: `${assignee.employee.firstName} ${assignee.employee.lastName}`,
            employeeCode: assignee.employee.employeeCode,
          },
        },
      });
    });

    return { message: 'Assignee removed successfully' };
  }

  // ==========================================================================
  // CHECKLIST
  // ==========================================================================

  public static async getChecklist(taskId: string): Promise<SafeTaskChecklistItem[]> {
    const task = await prisma.task.findUnique({ where: { id: taskId } });
    if (!task) {
      throw new AppError('Task not found', 404);
    }

    const items = await prisma.taskChecklistItem.findMany({
      where: { taskId },
      orderBy: [{ position: 'asc' }, { createdAt: 'asc' }],
    });

    return items;
  }

  public static async addChecklistItem(
    taskId: string,
    data: CreateChecklistItemDTO,
    user: AuthenticatedUser
  ): Promise<SafeTaskChecklistItem> {
    const task = await prisma.task.findUnique({ where: { id: taskId } });
    if (!task) {
      throw new AppError('Task not found', 404);
    }

    let position = data.position;
    if (position === undefined) {
      const highest = await prisma.taskChecklistItem.findFirst({
        where: { taskId },
        orderBy: { position: 'desc' },
      });
      position = highest ? highest.position + 1 : 0;
    }

    const item = await prisma.$transaction(async (tx) => {
      const created = await tx.taskChecklistItem.create({
        data: {
          taskId,
          title: data.title,
          isCompleted: data.isCompleted ?? false,
          position,
        },
      });

      await tx.taskActivity.create({
        data: {
          taskId,
          actorId: user.userId,
          action: 'TASK_CHECKLIST_ADDED',
          metadata: {
            checklistItemId: created.id,
            title: created.title,
          },
        },
      });

      return created;
    });

    return item;
  }

  public static async updateChecklistItem(
    taskId: string,
    itemId: string,
    data: UpdateChecklistItemDTO,
    user: AuthenticatedUser
  ): Promise<SafeTaskChecklistItem> {
    const item = await prisma.taskChecklistItem.findUnique({ where: { id: itemId } });
    if (!item || item.taskId !== taskId) {
      throw new AppError('Checklist item not found on this task', 404);
    }

    const isNewlyCompleted = data.isCompleted === true && !item.isCompleted;

    const updated = await prisma.$transaction(async (tx) => {
      const res = await tx.taskChecklistItem.update({
        where: { id: itemId },
        data: {
          title: data.title,
          isCompleted: data.isCompleted,
          position: data.position,
        },
      });

      if (isNewlyCompleted) {
        await tx.taskActivity.create({
          data: {
            taskId,
            actorId: user.userId,
            action: 'TASK_CHECKLIST_COMPLETED',
            metadata: {
              checklistItemId: itemId,
              title: res.title,
            },
          },
        });
      }

      return res;
    });

    return updated;
  }

  public static async deleteChecklistItem(
    taskId: string,
    itemId: string,
    _user: AuthenticatedUser
  ): Promise<{ message: string }> {
    const item = await prisma.taskChecklistItem.findUnique({ where: { id: itemId } });
    if (!item || item.taskId !== taskId) {
      throw new AppError('Checklist item not found on this task', 404);
    }

    await prisma.taskChecklistItem.delete({ where: { id: itemId } });
    return { message: 'Checklist item deleted successfully' };
  }

  public static async reorderChecklist(
    taskId: string,
    data: ReorderChecklistDTO,
    _user: AuthenticatedUser
  ): Promise<SafeTaskChecklistItem[]> {
    const task = await prisma.task.findUnique({ where: { id: taskId } });
    if (!task) {
      throw new AppError('Task not found', 404);
    }

    await prisma.$transaction(async (tx) => {
      for (let i = 0; i < data.itemIds.length; i++) {
        await tx.taskChecklistItem.updateMany({
          where: { id: data.itemIds[i], taskId },
          data: { position: i },
        });
      }
    });

    return prisma.taskChecklistItem.findMany({
      where: { taskId },
      orderBy: [{ position: 'asc' }, { createdAt: 'asc' }],
    });
  }

  // ==========================================================================
  // SUBTASKS
  // ==========================================================================

  public static async getSubtasks(taskId: string): Promise<SafeTaskSubtask[]> {
    const parent = await prisma.task.findUnique({ where: { id: taskId } });
    if (!parent) {
      throw new AppError('Parent task not found', 404);
    }

    const subtasks = await prisma.task.findMany({
      where: { parentTaskId: taskId },
      include: {
        assignees: {
          include: {
            employee: true,
          },
        },
      },
      orderBy: { createdAt: 'asc' },
    });

    return subtasks.map((st) => ({
      id: st.id,
      taskCode: st.taskCode,
      title: st.title,
      status: st.status,
      priority: st.priority,
      startDate: st.startDate,
      dueDate: st.dueDate,
      completedAt: st.completedAt,
      isOverdue: this.calculateIsOverdue(st.dueDate, st.status),
      createdAt: st.createdAt,
      assignees: st.assignees.map((a) => this.formatAssignee(a)),
    }));
  }

  public static async createSubtask(
    parentTaskId: string,
    data: CreateSubtaskDTO,
    user: AuthenticatedUser
  ): Promise<SafeTaskSubtask> {
    const parent = await prisma.task.findUnique({
      where: { id: parentTaskId },
      include: {
        project: {
          include: {
            members: true,
          },
        },
      },
    });

    if (!parent) {
      throw new AppError('Parent task not found', 404);
    }

    // Validate assignees against project members
    const validAssigneeIds: string[] = [];
    if (data.assigneeIds && data.assigneeIds.length > 0) {
      const uniqueIds = Array.from(new Set(data.assigneeIds));
      for (const empId of uniqueIds) {
        const emp = await prisma.employee.findUnique({ where: { id: empId } });
        if (!emp || emp.employmentStatus !== 'ACTIVE') {
          throw new AppError(`Employee ${empId} is not ACTIVE`, 400);
        }
        const isMember =
          parent.project.managerId === empId ||
          parent.project.members.some((m) => m.employeeId === empId);
        if (!isMember) {
          throw new AppError(
            `Employee ${emp.firstName} ${emp.lastName} is not a member of project ${parent.project.name}`,
            400
          );
        }
        validAssigneeIds.push(empId);
      }
    }

    const taskCode = await this.generateNextTaskCode();

    const created = await prisma.$transaction(async (tx) => {
      const subtask = await tx.task.create({
        data: {
          taskCode,
          title: data.title,
          description: data.description ?? null,
          projectId: parent.projectId,
          clientId: parent.clientId,
          createdById: user.userId,
          parentTaskId: parent.id,
          priority: data.priority ?? PriorityLevel.MEDIUM,
          startDate: data.startDate ?? null,
          dueDate: data.dueDate ?? null,
          status: TaskStatus.TODO,
        },
        include: {
          assignees: {
            include: {
              employee: true,
            },
          },
        },
      });

      if (validAssigneeIds.length > 0) {
        await tx.taskAssignee.createMany({
          data: validAssigneeIds.map((empId) => ({
            taskId: subtask.id,
            employeeId: empId,
          })),
        });
      }

      await tx.taskActivity.create({
        data: {
          taskId: parent.id,
          actorId: user.userId,
          action: 'TASK_UPDATED',
          metadata: {
            subtaskId: subtask.id,
            subtaskCode: subtask.taskCode,
            title: subtask.title,
          },
        },
      });

      return subtask;
    });

    const full = await prisma.task.findUnique({
      where: { id: created.id },
      include: {
        assignees: {
          include: {
            employee: true,
          },
        },
      },
    });

    return {
      id: full!.id,
      taskCode: full!.taskCode,
      title: full!.title,
      status: full!.status,
      priority: full!.priority,
      startDate: full!.startDate,
      dueDate: full!.dueDate,
      completedAt: full!.completedAt,
      isOverdue: this.calculateIsOverdue(full!.dueDate, full!.status),
      createdAt: full!.createdAt,
      assignees: full!.assignees.map((a) => this.formatAssignee(a)),
    };
  }

  // ==========================================================================
  // COMMENTS & THREADED REPLIES
  // ==========================================================================

  public static async getComments(taskId: string): Promise<SafeTaskComment[]> {
    const task = await prisma.task.findUnique({ where: { id: taskId } });
    if (!task) {
      throw new AppError('Task not found', 404);
    }

    const comments = await prisma.taskComment.findMany({
      where: { taskId, parentId: null },
      include: {
        author: {
          include: {
            employee: true,
          },
        },
        replies: {
          include: {
            author: {
              include: {
                employee: true,
              },
            },
          },
          orderBy: { createdAt: 'asc' },
        },
      },
      orderBy: { createdAt: 'asc' },
    });

    return comments.map((cm) => ({
      id: cm.id,
      taskId: cm.taskId,
      authorId: cm.authorId,
      parentId: cm.parentId,
      content: cm.content,
      createdAt: cm.createdAt,
      updatedAt: cm.updatedAt,
      author: this.formatUser(cm.author)!,
      replies: cm.replies.map((rp) => ({
        id: rp.id,
        taskId: rp.taskId,
        authorId: rp.authorId,
        parentId: rp.parentId,
        content: rp.content,
        createdAt: rp.createdAt,
        updatedAt: rp.updatedAt,
        author: this.formatUser(rp.author)!,
      })),
    }));
  }

  public static async createComment(
    taskId: string,
    data: CreateCommentDTO,
    user: AuthenticatedUser
  ): Promise<SafeTaskComment> {
    const task = await prisma.task.findUnique({ where: { id: taskId } });
    if (!task) {
      throw new AppError('Task not found', 404);
    }

    let parentId = data.parentId ?? null;
    if (parentId) {
      const parentComment = await prisma.taskComment.findUnique({ where: { id: parentId } });
      if (!parentComment || parentComment.taskId !== taskId) {
        throw new AppError('Parent comment not found on this task', 400);
      }
      // If the parent comment itself is a reply, attach to its parent to keep thread 1-level deep
      if (parentComment.parentId) {
        parentId = parentComment.parentId;
      }
    }

    const comment = await prisma.$transaction(async (tx) => {
      const created = await tx.taskComment.create({
        data: {
          taskId,
          authorId: user.userId,
          parentId,
          content: data.content,
        },
        include: {
          author: {
            include: {
              employee: true,
            },
          },
        },
      });

      await tx.taskActivity.create({
        data: {
          taskId,
          actorId: user.userId,
          action: 'TASK_COMMENT_ADDED',
          metadata: {
            commentId: created.id,
            isReply: !!parentId,
          },
        },
      });

      return created;
    });

    return {
      id: comment.id,
      taskId: comment.taskId,
      authorId: comment.authorId,
      parentId: comment.parentId,
      content: comment.content,
      createdAt: comment.createdAt,
      updatedAt: comment.updatedAt,
      author: this.formatUser(comment.author)!,
      replies: [],
    };
  }

  public static async updateComment(
    taskId: string,
    commentId: string,
    data: UpdateCommentDTO,
    user: AuthenticatedUser
  ): Promise<SafeTaskComment> {
    const comment = await prisma.taskComment.findUnique({
      where: { id: commentId },
      include: { author: { include: { employee: true } } },
    });

    if (!comment || comment.taskId !== taskId) {
      throw new AppError('Comment not found on this task', 404);
    }

    // Security: only the author or Super Admin can edit comments
    if (!user.isSuperAdmin && comment.authorId !== user.userId) {
      throw new AppError('You can only edit your own comments', 403);
    }

    const updated = await prisma.taskComment.update({
      where: { id: commentId },
      data: { content: data.content },
      include: { author: { include: { employee: true } } },
    });

    return {
      id: updated.id,
      taskId: updated.taskId,
      authorId: updated.authorId,
      parentId: updated.parentId,
      content: updated.content,
      createdAt: updated.createdAt,
      updatedAt: updated.updatedAt,
      author: this.formatUser(updated.author)!,
    };
  }

  public static async deleteComment(
    taskId: string,
    commentId: string,
    user: AuthenticatedUser
  ): Promise<{ message: string }> {
    const comment = await prisma.taskComment.findUnique({ where: { id: commentId } });
    if (!comment || comment.taskId !== taskId) {
      throw new AppError('Comment not found on this task', 404);
    }

    // Security: author, Super Admin, or elevated user with tasks.delete can remove comments
    const canDelete =
      user.isSuperAdmin || comment.authorId === user.userId || user.permissions.has('tasks.delete');

    if (!canDelete) {
      throw new AppError('You can only delete your own comments', 403);
    }

    await prisma.taskComment.delete({ where: { id: commentId } });

    return { message: 'Comment deleted successfully' };
  }

  // ==========================================================================
  // TASK ACTIVITY TIMELINE
  // ==========================================================================

  public static async getActivity(taskId: string): Promise<SafeTaskActivity[]> {
    const task = await prisma.task.findUnique({ where: { id: taskId } });
    if (!task) {
      throw new AppError('Task not found', 404);
    }

    const activities = await prisma.taskActivity.findMany({
      where: { taskId },
      include: {
        actor: {
          include: {
            employee: true,
          },
        },
      },
      orderBy: { createdAt: 'desc' },
    });

    return activities.map((act) => ({
      id: act.id,
      taskId: act.taskId,
      actorId: act.actorId,
      action: act.action,
      metadata: act.metadata,
      createdAt: act.createdAt,
      actor: this.formatUser(act.actor),
    }));
  }
}
