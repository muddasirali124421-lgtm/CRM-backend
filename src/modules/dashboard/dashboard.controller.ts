import { Response } from 'express';
import { AuthenticatedRequest } from '../../types/auth.types';
import { sendSuccess } from '../../utils/api-response';
import { DashboardService } from './dashboard.service';

export class DashboardController {
  /**
   * GET /api/dashboard/overview
   * Returns organizational summary metrics across all operational entities.
   */
  public static async getOverview(req: AuthenticatedRequest, res: Response): Promise<void> {
    const overview = await DashboardService.getOverview(req.user!);
    sendSuccess(res, overview, 'Dashboard overview retrieved successfully');
  }

  /**
   * GET /api/dashboard/activity
   * Returns recent audit logs formatted as a user-friendly timeline.
   */
  public static async getActivity(req: AuthenticatedRequest, res: Response): Promise<void> {
    const limit = req.query.limit ? parseInt(String(req.query.limit), 10) : 15;
    const activities = await DashboardService.getRecentActivity(limit);
    sendSuccess(res, activities, 'Recent activities retrieved successfully');
  }

  /**
   * GET /api/dashboard/my-work
   * Returns active projects and tasks assigned specifically to the authenticated staff member.
   */
  public static async getMyWork(req: AuthenticatedRequest, res: Response): Promise<void> {
    const myWork = await DashboardService.getMyWork(req.user!);
    sendSuccess(res, myWork, 'My work retrieved successfully');
  }
}
