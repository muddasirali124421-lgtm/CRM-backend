import { Router } from 'express';
import { authenticate, authorize } from '../../middleware/auth.middleware';
import { validateRequest } from '../../middleware/validate.middleware';
import { asyncHandler } from '../../utils/api-response';
import { SettingsController } from './settings.controller';
import { updateWorkspaceSettingSchema } from './settings.validation';

export const settingsRouter = Router();

// Apply authentication across all settings routes
settingsRouter.use(authenticate);

// 1. Get workspace profile & configuration
settingsRouter.get(
  '/workspace',
  authorize('settings.view'),
  asyncHandler(SettingsController.getWorkspaceSettings)
);

// 2. Update workspace profile & configuration
settingsRouter.patch(
  '/workspace',
  authorize('settings.edit_general'),
  validateRequest({ body: updateWorkspaceSettingSchema }),
  asyncHandler(SettingsController.updateWorkspaceSettings)
);

export default settingsRouter;
