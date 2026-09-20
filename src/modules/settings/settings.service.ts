import prisma from '../../config/database';
import { AuditService } from '../../services/audit.service';
import { AuthenticatedUser } from '../../types/auth.types';
import { UpdateWorkspaceSettingDTO, WorkspaceSettingResponse } from './settings.types';

export class SettingsService {
  /**
   * Retrieves organization workspace settings.
   * Creates initial record if one does not already exist.
   */
  public static async getWorkspaceSettings(): Promise<WorkspaceSettingResponse> {
    let settings = await prisma.workspaceSetting.findFirst();

    if (!settings) {
      settings = await prisma.workspaceSetting.create({
        data: {
          companyName: 'OfficeCRM',
          timezone: 'UTC',
          defaultCurrency: 'USD',
          dateFormat: 'YYYY-MM-DD',
        },
      });
    }

    return settings;
  }

  /**
   * Updates organization workspace configuration with audit trail.
   */
  public static async updateWorkspaceSettings(
    data: UpdateWorkspaceSettingDTO,
    actor: AuthenticatedUser,
    ipAddress?: string,
    userAgent?: string
  ): Promise<WorkspaceSettingResponse> {
    const existing = await this.getWorkspaceSettings();

    // Mass assignment protection: whitelist explicit allowed settings fields
    const updated = await prisma.workspaceSetting.update({
      where: { id: existing.id },
      data: {
        ...(data.companyName !== undefined ? { companyName: data.companyName } : {}),
        ...(data.companyEmail !== undefined ? { companyEmail: data.companyEmail || null } : {}),
        ...(data.phone !== undefined ? { phone: data.phone || null } : {}),
        ...(data.website !== undefined ? { website: data.website || null } : {}),
        ...(data.address !== undefined ? { address: data.address || null } : {}),
        ...(data.country !== undefined ? { country: data.country || null } : {}),
        ...(data.timezone !== undefined ? { timezone: data.timezone } : {}),
        ...(data.defaultCurrency !== undefined ? { defaultCurrency: data.defaultCurrency } : {}),
        ...(data.dateFormat !== undefined ? { dateFormat: data.dateFormat } : {}),
        ...(data.logoUrl !== undefined ? { logoUrl: data.logoUrl || null } : {}),
      },
    });

    // Record audit event with updated field names
    await AuditService.log({
      userId: actor.userId,
      action: 'WORKSPACE_SETTINGS_UPDATED',
      entityType: 'WORKSPACE_SETTING',
      entityId: updated.id,
      metadata: {
        updatedFields: Object.keys(data),
      },
      ipAddress,
      userAgent,
    });

    return updated;
  }
}
