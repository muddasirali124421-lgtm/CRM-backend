import { Response } from 'express';
import { AuthenticatedRequest } from '../../types/auth.types';
import { sendSuccess } from '../../utils/api-response';
import { ClientsService } from './clients.service';

export class ClientsController {
  public static async listClients(req: AuthenticatedRequest, res: Response): Promise<void> {
    const result = await ClientsService.listClients(req.query as any);
    sendSuccess(res, result, 'Clients retrieved successfully');
  }

  public static async getClientById(req: AuthenticatedRequest, res: Response): Promise<void> {
    const client = await ClientsService.getClientById(req.params.id);
    sendSuccess(res, client, 'Client details retrieved successfully');
  }

  public static async createClient(req: AuthenticatedRequest, res: Response): Promise<void> {
    const client = await ClientsService.createClient(req.body, req.user!);
    sendSuccess(res, client, 'Client created successfully', 201);
  }

  public static async updateClient(req: AuthenticatedRequest, res: Response): Promise<void> {
    const client = await ClientsService.updateClient(req.params.id, req.body, req.user!);
    sendSuccess(res, client, 'Client updated successfully');
  }

  public static async assignClient(req: AuthenticatedRequest, res: Response): Promise<void> {
    const client = await ClientsService.assignClient(req.params.id, req.body, req.user!);
    sendSuccess(res, client, 'Client assigned successfully');
  }

  public static async deleteClient(req: AuthenticatedRequest, res: Response): Promise<void> {
    const result = await ClientsService.deleteClient(req.params.id, req.user!);
    sendSuccess(res, result.archived ? { archived: true, client: result.client } : null, result.message);
  }
}
