import { Response, Router } from 'express';
import prisma from '../../config/database';
import { authenticate, authorize } from '../../middleware/auth.middleware';
import { AuthenticatedRequest } from '../../types/auth.types';
import { asyncHandler, sendSuccess } from '../../utils/api-response';

export const permissionsRouter = Router();

permissionsRouter.use(authenticate);

/**
 * GET /api/permissions
 * Returns catalog of all system permissions, grouped by module, for permission matrix UI.
 */
permissionsRouter.get(
  '/',
  authorize('settings.view', 'settings.manage_permissions'),
  asyncHandler(async (_req: AuthenticatedRequest, res: Response) => {
    const permissions = await prisma.permission.findMany({
      orderBy: [{ module: 'asc' }, { key: 'asc' }],
    });

    const grouped: Record<string, typeof permissions> = {};
    for (const p of permissions) {
      if (!grouped[p.module]) {
        grouped[p.module] = [];
      }
      grouped[p.module].push(p);
    }

    sendSuccess(
      res,
      {
        total: permissions.length,
        modulesCount: Object.keys(grouped).length,
        permissions,
        grouped,
      },
      'Permissions catalog retrieved successfully'
    );
  })
);

export default permissionsRouter;
