import { Router, Response } from 'express';
import prisma from '../../config/database';
import { authenticate } from '../../middleware/auth.middleware';
import { AuthenticatedRequest } from '../../types/auth.types';
import { sendSuccess } from '../../utils/api-response';

const departmentsRouter = Router();

departmentsRouter.use(authenticate);

/**
 * GET /api/departments
 * Fetch list of departments for dropdowns and employee assignment
 */
departmentsRouter.get('/', async (_req: AuthenticatedRequest, res: Response) => {
  const departments = await prisma.department.findMany({
    select: {
      id: true,
      name: true,
      description: true,
    },
    orderBy: {
      name: 'asc',
    },
  });

  sendSuccess(res, departments, 'Departments retrieved successfully');
});

export default departmentsRouter;
