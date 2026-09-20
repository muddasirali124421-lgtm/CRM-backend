import { Router } from 'express';
import authRouter from '../modules/auth/auth.routes';
import departmentsRouter from '../modules/departments/departments.routes';
import employeesRouter from '../modules/employees/employees.routes';
import rolesRouter from '../modules/roles/roles.routes';
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
// apiRouter.use('/leads', leadRouter);
// apiRouter.use('/clients', clientRouter);
// apiRouter.use('/projects', projectRouter);
// apiRouter.use('/tasks', taskRouter);
// apiRouter.use('/payments', paymentRouter);
// apiRouter.use('/reports', reportRouter);
// apiRouter.use('/files', fileRouter);
// apiRouter.use('/notifications', notificationRouter);
// apiRouter.use('/settings', settingRouter);

export default apiRouter;
