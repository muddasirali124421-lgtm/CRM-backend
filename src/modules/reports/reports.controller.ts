import { Response } from 'express';
import { AuthenticatedRequest } from '../../types/auth.types';
import { sendError, sendSuccess } from '../../utils/api-response';
import { ReportsService } from './reports.service';
import { ExportReportType } from './reports.types';

export class ReportsController {
  /**
   * GET /api/reports/leads
   */
  public static async getLeadsReport(req: AuthenticatedRequest, res: Response): Promise<void> {
    const report = await ReportsService.getLeadsReport(req.query as any);
    sendSuccess(res, report, 'Leads report retrieved successfully');
  }

  /**
   * GET /api/reports/clients
   */
  public static async getClientsReport(req: AuthenticatedRequest, res: Response): Promise<void> {
    const report = await ReportsService.getClientsReport(req.query as any);
    sendSuccess(res, report, 'Clients report retrieved successfully');
  }

  /**
   * GET /api/reports/projects
   */
  public static async getProjectsReport(req: AuthenticatedRequest, res: Response): Promise<void> {
    const report = await ReportsService.getProjectsReport(req.query as any);
    sendSuccess(res, report, 'Projects report retrieved successfully');
  }

  /**
   * GET /api/reports/tasks
   */
  public static async getTasksReport(req: AuthenticatedRequest, res: Response): Promise<void> {
    const report = await ReportsService.getTasksReport(req.query as any);
    sendSuccess(res, report, 'Tasks report retrieved successfully');
  }

  /**
   * GET /api/reports/employees
   */
  public static async getEmployeesReport(req: AuthenticatedRequest, res: Response): Promise<void> {
    const report = await ReportsService.getEmployeesReport(req.query as any);
    sendSuccess(res, report, 'Employees report retrieved successfully');
  }

  /**
   * GET /api/reports/financial
   */
  public static async getFinancialReport(req: AuthenticatedRequest, res: Response): Promise<void> {
    const report = await ReportsService.getFinancialReport(req.query as any);
    sendSuccess(res, report, 'Financial report retrieved successfully');
  }

  /**
   * GET /api/reports/:reportType/export?format=csv
   */
  public static async exportReport(req: AuthenticatedRequest, res: Response): Promise<void> {
    const reportType = req.params.reportType as ExportReportType;

    // Strict security check: financial export requires financial capability
    if (reportType === 'financial') {
      const user = req.user!;
      const canViewFinancial =
        user.isSuperAdmin ||
        user.permissions.has('payments.view') ||
        user.permissions.has('reports.view_financial') ||
        user.permissions.has('payments.view_financial');

      if (!canViewFinancial) {
        sendError(res, 'Forbidden: you do not have permission to export financial data', 403);
        return;
      }
    }

    const { csvContent, filename } = await ReportsService.exportReportCSV(
      reportType,
      req.query as any,
      req.user!,
      req.ip,
      req.headers['user-agent']
    );

    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.status(200).send(csvContent);
  }
}
