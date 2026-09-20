import { Router } from 'express';
import { authenticate, authorize } from '../../middleware/auth.middleware';
import { validateRequest } from '../../middleware/validate.middleware';
import { EmployeesController } from './employees.controller';
import {
  createEmployeeAccountSchema,
  createEmployeeSchema,
  employeeQuerySchema,
  resetPasswordSchema,
  updateEmployeeAccountSchema,
  updateEmployeeSchema,
  updatePermissionsSchema,
} from './employees.validation';

const employeesRouter = Router();

// Apply authentication middleware across all employee endpoints
employeesRouter.use(authenticate);

// 1. Employee Directory & Profiles
employeesRouter.get(
  '/',
  authorize('employees.view'),
  validateRequest({ query: employeeQuerySchema }),
  EmployeesController.listEmployees
);

employeesRouter.post(
  '/',
  authorize('employees.create'),
  validateRequest({ body: createEmployeeSchema }),
  EmployeesController.createEmployee
);

employeesRouter.get(
  '/:id',
  authorize('employees.view'),
  EmployeesController.getEmployeeById
);

employeesRouter.patch(
  '/:id',
  authorize('employees.edit'),
  validateRequest({ body: updateEmployeeSchema }),
  EmployeesController.updateEmployee
);

employeesRouter.delete(
  '/:id',
  authorize('employees.delete'),
  EmployeesController.deleteEmployee
);

// 2. User Account Management for Employees
employeesRouter.post(
  '/:id/account',
  authorize('settings.manage_users'),
  validateRequest({ body: createEmployeeAccountSchema }),
  EmployeesController.createEmployeeAccount
);

employeesRouter.patch(
  '/:id/account',
  authorize('settings.manage_users'),
  validateRequest({ body: updateEmployeeAccountSchema }),
  EmployeesController.updateEmployeeAccount
);

employeesRouter.post(
  '/:id/account/reset-password',
  authorize('settings.manage_users'),
  validateRequest({ body: resetPasswordSchema }),
  EmployeesController.resetEmployeePassword
);

// 3. User Permission Overrides for Employees
employeesRouter.get(
  '/:id/permissions',
  authorize('settings.manage_permissions'),
  EmployeesController.getEmployeePermissions
);

employeesRouter.put(
  '/:id/permissions',
  authorize('settings.manage_permissions'),
  validateRequest({ body: updatePermissionsSchema }),
  EmployeesController.updateEmployeePermissions
);

export default employeesRouter;
