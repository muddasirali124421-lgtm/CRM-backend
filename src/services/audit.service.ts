import prisma from '../config/database';

export interface AuditEventParams {
  userId?: string | null;
  action: string;
  entityType: string;
  entityId?: string | null;
  metadata?: Record<string, unknown> | null;
  ipAddress?: string | null;
  userAgent?: string | null;
}

export class AuditService {
  /**
   * Log an audit event asynchronously without throwing exceptions to caller.
   * Ensures security-sensitive data (passwords, tokens) is never included in metadata.
   */
  public static async log(params: AuditEventParams): Promise<void> {
    try {
      // Sanitize metadata to avoid accidental secret leakage
      const sanitizedMetadata = params.metadata ? { ...params.metadata } : {};
      delete sanitizedMetadata.password;
      delete sanitizedMetadata.passwordHash;
      delete sanitizedMetadata.token;
      delete sanitizedMetadata.refreshToken;
      delete sanitizedMetadata.accessToken;

      await prisma.auditLog.create({
        data: {
          userId: params.userId || null,
          action: params.action,
          entityType: params.entityType,
          entityId: params.entityId || null,
          metadata: Object.keys(sanitizedMetadata).length > 0 ? (sanitizedMetadata as object) : undefined,
          ipAddress: params.ipAddress || null,
          userAgent: params.userAgent || null,
        },
      });
    } catch (error) {
      // Non-blocking log failure
      console.error('[AuditLog Error]: Failed to record audit event:', error);
    }
  }
}
