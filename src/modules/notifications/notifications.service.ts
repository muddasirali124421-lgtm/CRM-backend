import { NotificationCategory, Prisma } from '@prisma/client';
import prisma from '../../config/database';
import { AppError } from '../../utils/api-response';
import { AuditService } from '../../services/audit.service';
import { AuthenticatedUser } from '../../types/auth.types';
import { notificationEvents, NOTIFICATION_EVENTS } from './notifications.events';
import {
  CreateNotificationDTO,
  NotificationFilterQuery,
  SafeNotificationActorSummary,
  SafeNotificationResponse,
  SafeNotificationPreferenceItem,
  UpdateNotificationPreferencesDTO,
  NotificationType,
  SendSystemNotificationDTO,
} from './notifications.types';

export class NotificationService {
  /**
   * Safe mapping for actor details
   */
  private static formatActor(actor: any): SafeNotificationActorSummary | null {
    if (!actor) return null;
    return {
      id: actor.id,
      email: actor.email,
      employeeCode: actor.employee?.employeeCode,
      firstName: actor.employee?.firstName,
      lastName: actor.employee?.lastName,
      jobTitle: actor.employee?.jobTitle,
      profileImage: actor.employee?.profileImage ?? null,
    };
  }

  /**
   * Safe mapping for Notification record
   */
  public static formatNotification(notif: any): SafeNotificationResponse {
    return {
      id: notif.id,
      userId: notif.userId,
      type: notif.type,
      title: notif.title,
      message: notif.message,
      entityType: notif.entityType ?? null,
      entityId: notif.entityId ?? null,
      actorId: notif.actorId ?? null,
      actor: this.formatActor(notif.actor),
      isRead: notif.isRead,
      metadata: (notif.metadata as Record<string, any>) ?? null,
      createdAt: notif.createdAt,
    };
  }

  /**
   * Map NotificationType to NotificationCategory for preference evaluation
   */
  public static mapTypeToCategory(type: NotificationType): NotificationCategory {
    switch (type) {
      case 'TASK_ASSIGNED':
      case 'TASK_REASSIGNED':
      case 'TASK_STATUS_CHANGED':
      case 'TASK_DUE_SOON':
      case 'TASK_OVERDUE':
        return NotificationCategory.TASKS;
      case 'PROJECT_ASSIGNED':
      case 'PROJECT_MANAGER_ASSIGNED':
        return NotificationCategory.PROJECTS;
      case 'CHAT_MENTION':
      case 'CHAT_MESSAGE':
        return NotificationCategory.CHAT;
      case 'INVOICE_CREATED':
      case 'INVOICE_OVERDUE':
      case 'PAYMENT_RECORDED':
        return NotificationCategory.PAYMENTS;
      case 'SYSTEM':
      default:
        return NotificationCategory.SYSTEM;
    }
  }

  /**
   * Helper: Resolve Employee ID to active User Account ID.
   * If the employee does not have an active login user account, returns null.
   */
  public static async getUserIdForEmployee(employeeId: string): Promise<string | null> {
    const user = await prisma.user.findFirst({
      where: {
        employeeId,
        accountStatus: 'ACTIVE',
      },
      select: { id: true },
    });
    return user ? user.id : null;
  }

  // ==========================================================================
  // NOTIFICATION CREATION & EMISSION
  // ==========================================================================

  /**
   * Create a single notification with preference enforcement, DB persistence, and real-time emit
   */
  public static async createNotification(
    data: CreateNotificationDTO
  ): Promise<SafeNotificationResponse | null> {
    // 1. Verify recipient user exists and is active
    const recipient = await prisma.user.findUnique({
      where: { id: data.userId },
      select: { id: true, accountStatus: true },
    });

    if (!recipient || recipient.accountStatus !== 'ACTIVE') {
      return null;
    }

    // 2. Prevent actor from notifying themselves (e.g. self-assignment, self-comments)
    if (data.actorId && data.actorId === data.userId && data.type !== 'SYSTEM') {
      return null;
    }

    // 3. Centralized preference check: SYSTEM notifications always bypass optional preferences
    const category = data.category || this.mapTypeToCategory(data.type);
    if (category !== NotificationCategory.SYSTEM) {
      const preference = await prisma.notificationPreference.findUnique({
        where: {
          userId_category: {
            userId: data.userId,
            category,
          },
        },
      });

      if (preference && preference.inAppEnabled === false) {
        // In-app notifications disabled by user for this category
        return null;
      }
    }

    // 4. Persist in PostgreSQL
    const created = await prisma.notification.create({
      data: {
        userId: data.userId,
        type: data.type,
        title: data.title,
        message: data.message,
        entityType: data.entityType || null,
        entityId: data.entityId || null,
        actorId: data.actorId || null,
        metadata: data.metadata ? (data.metadata as Prisma.InputJsonValue) : Prisma.JsonNull,
      },
      include: {
        actor: {
          include: {
            employee: true,
          },
        },
      },
    });

    const formatted = this.formatNotification(created);

    // 5. Calculate recipient's new unread count
    const unreadCount = await prisma.notification.count({
      where: { userId: data.userId, isRead: false },
    });

    // 6. Real-time emit to recipient user room via event bus (failure-isolated)
    try {
      notificationEvents.emit(NOTIFICATION_EVENTS.NOTIFICATION_NEW, {
        userId: data.userId,
        notification: formatted,
      });

      notificationEvents.emit(NOTIFICATION_EVENTS.UNREAD_COUNT_UPDATED, {
        userId: data.userId,
        unreadCount,
      });
    } catch {
      // Event emitter failures do not corrupt database persistence
    }

    return formatted;
  }

  /**
   * Batch create notifications for multiple recipients
   */
  public static async createManyNotifications(
    notifications: CreateNotificationDTO[]
  ): Promise<SafeNotificationResponse[]> {
    const results: SafeNotificationResponse[] = [];
    for (const item of notifications) {
      const notif = await this.createNotification(item);
      if (notif) results.push(notif);
    }
    return results;
  }

  // ==========================================================================
  // QUERY & UNREAD COUNT
  // ==========================================================================

  /**
   * List notifications for authenticated user
   */
  public static async listNotifications(
    query: NotificationFilterQuery,
    user: AuthenticatedUser
  ): Promise<{ items: SafeNotificationResponse[]; pagination: any }> {
    const { page = 1, limit = 20, isRead, type, entityType, dateFrom, dateTo } = query;

    // Enforce strict ownership: User only sees their own notifications
    const where: Prisma.NotificationWhereInput = {
      userId: user.userId,
    };

    if (isRead !== undefined) where.isRead = isRead;
    if (type) where.type = type;
    if (entityType) where.entityType = entityType;

    if (dateFrom || dateTo) {
      where.createdAt = {};
      if (dateFrom) where.createdAt.gte = dateFrom;
      if (dateTo) where.createdAt.lte = dateTo;
    }

    const [total, items] = await Promise.all([
      prisma.notification.count({ where }),
      prisma.notification.findMany({
        where,
        skip: (page - 1) * limit,
        take: limit,
        orderBy: { createdAt: 'desc' },
        include: {
          actor: {
            include: {
              employee: true,
            },
          },
        },
      }),
    ]);

    const totalPages = Math.ceil(total / limit) || 1;

    return {
      items: items.map((n) => this.formatNotification(n)),
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
   * Get unread notifications count for authenticated user
   */
  public static async getUnreadCount(user: AuthenticatedUser): Promise<number> {
    return prisma.notification.count({
      where: {
        userId: user.userId,
        isRead: false,
      },
    });
  }

  // ==========================================================================
  // READ STATE UPDATES & DISMISSAL
  // ==========================================================================

  /**
   * Mark a single notification as read (idempotent, ownership-restricted)
   */
  public static async markAsRead(
    id: string,
    user: AuthenticatedUser
  ): Promise<SafeNotificationResponse> {
    const existing = await prisma.notification.findUnique({
      where: { id },
      include: { actor: { include: { employee: true } } },
    });

    if (!existing) {
      throw new AppError('Notification not found', 404);
    }

    // Ownership check: users can only mark their own notifications
    if (existing.userId !== user.userId) {
      throw new AppError('You do not have permission to modify this notification', 403);
    }

    if (!existing.isRead) {
      const updated = await prisma.notification.update({
        where: { id },
        data: { isRead: true },
        include: { actor: { include: { employee: true } } },
      });

      const unreadCount = await prisma.notification.count({
        where: { userId: user.userId, isRead: false },
      });

      notificationEvents.emit(NOTIFICATION_EVENTS.UNREAD_COUNT_UPDATED, {
        userId: user.userId,
        unreadCount,
      });

      return this.formatNotification(updated);
    }

    return this.formatNotification(existing);
  }

  /**
   * Mark all unread notifications as read for authenticated user
   */
  public static async markAllAsRead(user: AuthenticatedUser): Promise<{ updatedCount: number }> {
    const result = await prisma.notification.updateMany({
      where: {
        userId: user.userId,
        isRead: false,
      },
      data: { isRead: true },
    });

    notificationEvents.emit(NOTIFICATION_EVENTS.UNREAD_COUNT_UPDATED, {
      userId: user.userId,
      unreadCount: 0,
    });

    return { updatedCount: result.count };
  }

  /**
   * Delete / dismiss notification
   */
  public static async deleteNotification(
    id: string,
    user: AuthenticatedUser
  ): Promise<{ id: string; message: string }> {
    const existing = await prisma.notification.findUnique({ where: { id } });
    if (!existing) {
      throw new AppError('Notification not found', 404);
    }

    if (existing.userId !== user.userId) {
      throw new AppError('You do not have permission to delete this notification', 403);
    }

    await prisma.notification.delete({ where: { id } });

    const unreadCount = await prisma.notification.count({
      where: { userId: user.userId, isRead: false },
    });

    notificationEvents.emit(NOTIFICATION_EVENTS.UNREAD_COUNT_UPDATED, {
      userId: user.userId,
      unreadCount,
    });

    return { id, message: 'Notification deleted successfully' };
  }

  // ==========================================================================
  // NOTIFICATION PREFERENCES
  // ==========================================================================

  /**
   * Get authenticated user's notification preferences for all categories
   */
  public static async getPreferences(
    user: AuthenticatedUser
  ): Promise<SafeNotificationPreferenceItem[]> {
    const allCategories = Object.values(NotificationCategory);

    const existingPrefs = await prisma.notificationPreference.findMany({
      where: { userId: user.userId },
    });

    const prefMap = new Map<NotificationCategory, { inAppEnabled: boolean; emailEnabled: boolean }>();
    for (const p of existingPrefs) {
      prefMap.set(p.category, {
        inAppEnabled: p.inAppEnabled,
        emailEnabled: p.emailEnabled,
      });
    }

    return allCategories.map((category) => {
      const p = prefMap.get(category);
      return {
        category,
        inAppEnabled: p ? p.inAppEnabled : true,
        emailEnabled: p ? p.emailEnabled : true,
      };
    });
  }

  /**
   * Update notification preferences
   */
  public static async updatePreferences(
    data: UpdateNotificationPreferencesDTO,
    user: AuthenticatedUser
  ): Promise<SafeNotificationPreferenceItem[]> {
    for (const item of data.preferences) {
      await prisma.notificationPreference.upsert({
        where: {
          userId_category: {
            userId: user.userId,
            category: item.category,
          },
        },
        update: {
          inAppEnabled: item.inAppEnabled !== undefined ? item.inAppEnabled : undefined,
          emailEnabled: item.emailEnabled !== undefined ? item.emailEnabled : undefined,
        },
        create: {
          userId: user.userId,
          category: item.category,
          inAppEnabled: item.inAppEnabled ?? true,
          emailEnabled: item.emailEnabled ?? true,
        },
      });
    }

    return this.getPreferences(user);
  }

  // ==========================================================================
  // SYSTEM / ADMINISTRATIVE NOTIFICATIONS
  // ==========================================================================

  public static async sendSystemNotification(
    data: SendSystemNotificationDTO,
    actor: AuthenticatedUser
  ): Promise<{ deliveredCount: number }> {
    let targetUserIds = data.recipientUserIds;

    // If none provided, send to all active users
    if (!targetUserIds || targetUserIds.length === 0) {
      const users = await prisma.user.findMany({
        where: { accountStatus: 'ACTIVE' },
        select: { id: true },
      });
      targetUserIds = users.map((u) => u.id);
    }

    let deliveredCount = 0;
    for (const uId of targetUserIds) {
      const notif = await this.createNotification({
        userId: uId,
        type: 'SYSTEM',
        title: data.title,
        message: data.message,
        entityType: 'SYSTEM',
        actorId: actor.userId,
        category: NotificationCategory.SYSTEM,
        metadata: data.metadata,
      });
      if (notif) deliveredCount++;
    }

    await AuditService.log({
      userId: actor.userId,
      action: 'SYSTEM_NOTIFICATION_SENT',
      entityType: 'NOTIFICATION',
      entityId: actor.userId,
      metadata: {
        title: data.title,
        recipientCount: deliveredCount,
      },
    });

    return { deliveredCount };
  }

  // ==========================================================================
  // REUSABLE DUE / OVERDUE TASK JOB RUNNER (IDEMPOTENT & DEDUPLICATED)
  // ==========================================================================

  /**
   * Idempotently generates TASK_DUE_SOON and TASK_OVERDUE notifications.
   * Can be triggered by background workers, cron, or test scripts without setInterval leaks.
   */
  public static async processDueAndOverdueTasks(): Promise<{
    dueSoonCount: number;
    overdueCount: number;
  }> {
    const now = new Date();
    const next24Hours = new Date(now.getTime() + 24 * 60 * 60 * 1000);

    let dueSoonCount = 0;
    let overdueCount = 0;

    // 1. Tasks Due Soon (due within next 24 hours, not completed)
    const dueSoonTasks = await prisma.task.findMany({
      where: {
        status: { not: 'COMPLETED' },
        dueDate: {
          gte: now,
          lte: next24Hours,
        },
      },
      include: {
        assignees: { include: { employee: true } },
      },
    });

    for (const task of dueSoonTasks) {
      for (const assignee of task.assignees) {
        const userId = await this.getUserIdForEmployee(assignee.employeeId);
        if (!userId) continue;

        // Deduplication check: check if a TASK_DUE_SOON notification for this task was already sent in the last 24h
        const existing = await prisma.notification.findFirst({
          where: {
            userId,
            type: 'TASK_DUE_SOON',
            entityType: 'TASK',
            entityId: task.id,
            createdAt: { gte: new Date(now.getTime() - 24 * 60 * 60 * 1000) },
          },
        });

        if (!existing) {
          await this.createNotification({
            userId,
            type: 'TASK_DUE_SOON',
            title: `Task Due Soon: ${task.taskCode}`,
            message: `Task "${task.title}" is due on ${task.dueDate?.toISOString().slice(0, 10)}.`,
            entityType: 'TASK',
            entityId: task.id,
            category: NotificationCategory.TASKS,
          });
          dueSoonCount++;
        }
      }
    }

    // 2. Overdue Tasks (dueDate in the past, not completed)
    const overdueTasks = await prisma.task.findMany({
      where: {
        status: { not: 'COMPLETED' },
        dueDate: { lt: now },
      },
      include: {
        assignees: { include: { employee: true } },
      },
    });

    for (const task of overdueTasks) {
      for (const assignee of task.assignees) {
        const userId = await this.getUserIdForEmployee(assignee.employeeId);
        if (!userId) continue;

        // Deduplication check: only send TASK_OVERDUE once per 24 hours per task
        const existing = await prisma.notification.findFirst({
          where: {
            userId,
            type: 'TASK_OVERDUE',
            entityType: 'TASK',
            entityId: task.id,
            createdAt: { gte: new Date(now.getTime() - 24 * 60 * 60 * 1000) },
          },
        });

        if (!existing) {
          await this.createNotification({
            userId,
            type: 'TASK_OVERDUE',
            title: `Task Overdue: ${task.taskCode}`,
            message: `Task "${task.title}" is overdue since ${task.dueDate?.toISOString().slice(0, 10)}.`,
            entityType: 'TASK',
            entityId: task.id,
            category: NotificationCategory.TASKS,
          });
          overdueCount++;
        }
      }
    }

    return { dueSoonCount, overdueCount };
  }
}
