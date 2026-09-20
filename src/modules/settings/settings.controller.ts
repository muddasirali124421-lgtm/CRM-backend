import { Response } from 'express';
import { AuthenticatedRequest } from '../../types/auth.types';
import { sendSuccess } from '../../utils/api-response';
import { SettingsService } from './settings.service';

export class SettingsController {
  /**
   * GET /api/settings/workspace
   * Retrieve organization workspace configuration
   */
  public static async getWorkspaceSettings(_req: AuthenticatedRequest, res: Response): Promise<void> {
    const settings = await SettingsService.getWorkspaceSettings();
    sendSuccess(res, settings, 'Workspace settings retrieved successfully');
  }

  /**
   * PATCH /api/settings/workspace
   * Update organization workspace configuration
   */
  public static async updateWorkspaceSettings(req: AuthenticatedRequest, res: Response): Promise<void> {
    const settings = await SettingsService.updateWorkspaceSettings(
      req.body,
      req.user!,
      req.ip,
      req.headers['user-agent']
    );
    sendSuccess(res, settings, 'Workspace settings updated successfully');
  }
}
