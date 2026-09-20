import { Router } from 'express';
import authRouter from '../modules/auth/auth.routes';
import departmentsRouter from '../modules/departments/departments.routes';
import employeesRouter from '../modules/employees/employees.routes';
import rolesRouter from '../modules/roles/roles.routes';
import leadsRouter from '../modules/leads/leads.routes';
import clientsRouter from '../modules/clients/clients.routes';
import projectsRouter from '../modules/projects/projects.routes';
import tasksRouter from '../modules/tasks/tasks.routes';
import { invoicesRouter, paymentsRouter } from '../modules/payments/payments.routes';
import { filesRouter, fileFoldersRouter } from '../modules/files/files.routes';
import healthRouter from './health.router';

const apiRouter = Router();

// Mount Health Check endpoint (/api/health)
apiRouter.use('/', healthRouter);

// Mount Authentication routes (/api/auth)
apiRouter.use('/auth', authRouter);

// Mount Employee management routes (/api/employees)
apiRouter.use('/employees', employeesRouter);

// Mount Department routes (/api/departments)
apiRouter.use('/departments', departmentsRouter);

// Mount Role routes (/api/roles)
apiRouter.use('/roles', rolesRouter);

// Mount Lead management routes (/api/leads)
apiRouter.use('/leads', leadsRouter);

// Mount Client management routes (/api/clients)
apiRouter.use('/clients', clientsRouter);

// Mount Project management routes (/api/projects)
apiRouter.use('/projects', projectsRouter);

// Mount Task management routes (/api/tasks)
apiRouter.use('/tasks', tasksRouter);

// Mount Invoices routes (/api/invoices)
apiRouter.use('/invoices', invoicesRouter);

// Mount Payments routes (/api/payments)
apiRouter.use('/payments', paymentsRouter);

// Mount Files & Folders routes (/api/files, /api/file-folders)
apiRouter.use('/files', filesRouter);
apiRouter.use('/file-folders', fileFoldersRouter);

// Mount Internal Chat routes (/api/chat)
import { chatRouter } from '../modules/chat/chat.routes';
apiRouter.use('/chat', chatRouter);

// Mount Notifications & Preferences routes (/api/notifications, /api/notification-preferences)
import { notificationsRouter, notificationPreferencesRouter } from '../modules/notifications/notifications.routes';
apiRouter.use('/notifications', notificationsRouter);
apiRouter.use('/notification-preferences', notificationPreferencesRouter);

// Mount Dashboard routes (/api/dashboard)
import { dashboardRouter } from '../modules/dashboard/dashboard.routes';
apiRouter.use('/dashboard', dashboardRouter);

// Mount Reports & Analytics routes (/api/reports)
import { reportsRouter } from '../modules/reports/reports.routes';
apiRouter.use('/reports', reportsRouter);

// Mount Settings routes (/api/settings)
import { settingsRouter } from '../modules/settings/settings.routes';
apiRouter.use('/settings', settingsRouter);

// Mount Permissions catalog routes (/api/permissions)
import { permissionsRouter } from '../modules/permissions/permissions.routes';
apiRouter.use('/permissions', permissionsRouter);

// Mount Users management & permission overrides routes (/api/users)
import { usersRouter } from '../modules/users/users.routes';
apiRouter.use('/users', usersRouter);

export default apiRouter;
