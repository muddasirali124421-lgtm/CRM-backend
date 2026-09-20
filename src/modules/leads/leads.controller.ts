import { Response } from 'express';
import { AuthenticatedRequest } from '../../types/auth.types';
import { sendSuccess } from '../../utils/api-response';
import { LeadsService } from './leads.service';

export class LeadsController {
  public static async listLeads(req: AuthenticatedRequest, res: Response): Promise<void> {
    const result = await LeadsService.listLeads(req.query as any);
    sendSuccess(res, result, 'Leads retrieved successfully');
  }

  public static async getLeadById(req: AuthenticatedRequest, res: Response): Promise<void> {
    const lead = await LeadsService.getLeadById(req.params.id);
    sendSuccess(res, lead, 'Lead details retrieved successfully');
  }

  public static async createLead(req: AuthenticatedRequest, res: Response): Promise<void> {
    const lead = await LeadsService.createLead(req.body, req.user!);
    sendSuccess(res, lead, 'Lead created successfully', 201);
  }

  public static async updateLead(req: AuthenticatedRequest, res: Response): Promise<void> {
    const lead = await LeadsService.updateLead(req.params.id, req.body, req.user!);
    sendSuccess(res, lead, 'Lead updated successfully');
  }

  public static async assignLead(req: AuthenticatedRequest, res: Response): Promise<void> {
    const lead = await LeadsService.assignLead(req.params.id, req.body, req.user!);
    sendSuccess(res, lead, 'Lead assigned successfully');
  }

  public static async deleteLead(req: AuthenticatedRequest, res: Response): Promise<void> {
    const result = await LeadsService.deleteLead(req.params.id, req.user!);
    sendSuccess(res, null, result.message);
  }

  public static async convertLead(req: AuthenticatedRequest, res: Response): Promise<void> {
    const result = await LeadsService.convertLead(req.params.id, req.body, req.user!);
    sendSuccess(res, result, result.message, 201);
  }
}
