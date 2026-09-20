import { Response } from 'express';
import { AuthenticatedRequest } from '../../types/auth.types';
import { sendSuccess } from '../../utils/api-response';
import { EmployeesService } from './employees.service';

export class EmployeesController {
  public static async listEmployees(req: AuthenticatedRequest, res: Response): Promise<void> {
    const result = await EmployeesService.listEmployees(req.query as any);
    sendSuccess(res, result, 'Employees retrieved successfully');
  }

  public static async getEmployeeById(req: AuthenticatedRequest, res: Response): Promise<void> {
    const employee = await EmployeesService.getEmployeeById(req.params.id);
    sendSuccess(res, employee, 'Employee profile retrieved successfully');
  }

  public static async createEmployee(req: AuthenticatedRequest, res: Response): Promise<void> {
    const created = await EmployeesService.createEmployee(req.body, req.user!);
    sendSuccess(res, created, 'Employee created successfully', 201);
  }

  public static async updateEmployee(req: AuthenticatedRequest, res: Response): Promise<void> {
    const updated = await EmployeesService.updateEmployee(req.params.id, req.body, req.user!);
    sendSuccess(res, updated, 'Employee updated successfully');
  }

  public static async deleteEmployee(req: AuthenticatedRequest, res: Response): Promise<void> {
    const result = await EmployeesService.deleteOrDeactivateEmployee(req.params.id, req.user!);
    sendSuccess(res, result, result.message);
  }

  public static async createEmployeeAccount(req: AuthenticatedRequest, res: Response): Promise<void> {
    const result = await EmployeesService.createEmployeeAccount(req.params.id, req.body, req.user!);
    sendSuccess(res, result.user, result.message, 201);
  }

  public static async updateEmployeeAccount(req: AuthenticatedRequest, res: Response): Promise<void> {
    const result = await EmployeesService.updateEmployeeAccount(req.params.id, req.body, req.user!);
    sendSuccess(res, result.user, result.message);
  }

  public static async resetEmployeePassword(req: AuthenticatedRequest, res: Response): Promise<void> {
    const result = await EmployeesService.resetEmployeePassword(req.params.id, req.body, req.user!);
    sendSuccess(res, null, result.message);
  }

  public static async getEmployeePermissions(req: AuthenticatedRequest, res: Response): Promise<void> {
    const result = await EmployeesService.getEmployeePermissions(req.params.id);
    sendSuccess(res, result, 'Employee permissions retrieved successfully');
  }

  public static async updateEmployeePermissions(req: AuthenticatedRequest, res: Response): Promise<void> {
    const result = await EmployeesService.updateEmployeePermissions(req.params.id, req.body.overrides, req.user!);
    sendSuccess(res, result, 'Employee permission overrides updated successfully');
  }
}
