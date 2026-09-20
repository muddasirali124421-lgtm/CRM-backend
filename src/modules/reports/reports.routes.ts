import { Router } from 'express';
import { authenticate, authorize } from '../../middleware/auth.middleware';
import { validateRequest } from '../../middleware/validate.middleware';
import { ReportsController } from './reports.controller';
import {
  baseReportQuerySchema,
  employeesReportQuerySchema,
  exportReportParamsSchema,
  exportReportQuerySchema,
  financialReportQuerySchema,
  projectsReportQuerySchema,
  tasksReportQuerySchema,
} from './reports.validation';

export const reportsRouter = Router();

// Apply authentication across all report endpoints
reportsRouter.use(authenticate);

// 1. Leads Analytics Report
reportsRouter.get(
  '/leads',
  authorize('reports.view', 'reports.view_sales'),
  validateRequest({ query: baseReportQuerySchema }),
  ReportsController.getLeadsReport
);

// 2. Clients Analytics Report
reportsRouter.get(
  '/clients',
  authorize('reports.view', 'reports.view_sales'),
  validateRequest({ query: baseReportQuerySchema }),
  ReportsController.getClientsReport
);

// 3. Projects Analytics Report
reportsRouter.get(
  '/projects',
  authorize('reports.view', 'reports.view_projects'),
  validateRequest({ query: projectsReportQuerySchema }),
  ReportsController.getProjectsReport
);

// 4. Tasks Analytics Report
reportsRouter.get(
  '/tasks',
  authorize('reports.view', 'reports.view_projects'),
  validateRequest({ query: tasksReportQuerySchema }),
  ReportsController.getTasksReport
);

// 5. Employee Operational Performance Report
reportsRouter.get(
  '/employees',
  authorize('reports.view', 'reports.view_team'),
  validateRequest({ query: employeesReportQuerySchema }),
  ReportsController.getEmployeesReport
);

// 6. Financial Analytics Report (Requires reports.view + financial view permission)
reportsRouter.get(
  '/financial',
  authorize('reports.view'),
  authorize('reports.view_financial', 'payments.view', 'payments.view_financial'),
  validateRequest({ query: financialReportQuerySchema }),
  ReportsController.getFinancialReport
);

// 7. Server-Side CSV Export (Requires reports.export + report-level security check in controller)
reportsRouter.get(
  '/:reportType/export',
  authorize('reports.export'),
  validateRequest({ params: exportReportParamsSchema, query: exportReportQuerySchema }),
  ReportsController.exportReport
);

export default reportsRouter;
