import { Router } from 'express';
import authRouter from '../modules/auth/auth.routes';
import healthRouter from './health.router';

const apiRouter = Router();

// Mount Health Check endpoint (/api/health)
apiRouter.use('/', healthRouter);

// Mount Authentication routes (/api/auth)
apiRouter.use('/auth', authRouter);
// apiRouter.use('/employees', employeeRouter);
// apiRouter.use('/users', userRouter);
// apiRouter.use('/roles', roleRouter);
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
