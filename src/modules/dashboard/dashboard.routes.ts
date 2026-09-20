import { Router } from 'express';
import { authenticate } from '../../middleware/auth.middleware';
import { DashboardController } from './dashboard.controller';

export const dashboardRouter = Router();

// All dashboard routes require authentication
dashboardRouter.use(authenticate);

// 1. Operational overview metrics
dashboardRouter.get('/overview', DashboardController.getOverview);

// 2. Recent organizational activity stream
dashboardRouter.get('/activity', DashboardController.getActivity);

// 3. User personal work queue (assigned projects & tasks)
dashboardRouter.get('/my-work', DashboardController.getMyWork);

export default dashboardRouter;
