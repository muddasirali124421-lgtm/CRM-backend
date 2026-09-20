import { Response } from 'express';
import { AuthenticatedRequest } from '../../types/auth.types';
import { sendSuccess } from '../../utils/api-response';
import { ProjectsService } from './projects.service';

export class ProjectsController {
  public static async listProjects(req: AuthenticatedRequest, res: Response): Promise<void> {
    const result = await ProjectsService.listProjects(req.query as any);
    sendSuccess(res, result, 'Projects retrieved successfully');
  }

  public static async getProjectById(req: AuthenticatedRequest, res: Response): Promise<void> {
    const project = await ProjectsService.getProjectById(req.params.id);
    sendSuccess(res, project, 'Project details retrieved successfully');
  }

  public static async createProject(req: AuthenticatedRequest, res: Response): Promise<void> {
    const project = await ProjectsService.createProject(req.body, req.user!);
    sendSuccess(res, project, 'Project created successfully', 201);
  }

  public static async updateProject(req: AuthenticatedRequest, res: Response): Promise<void> {
    const project = await ProjectsService.updateProject(req.params.id, req.body, req.user!);
    sendSuccess(res, project, 'Project updated successfully');
  }

  public static async assignManager(req: AuthenticatedRequest, res: Response): Promise<void> {
    const project = await ProjectsService.assignManager(req.params.id, req.body, req.user!);
    sendSuccess(res, project, 'Project manager assigned successfully');
  }

  public static async getTeamMembers(req: AuthenticatedRequest, res: Response): Promise<void> {
    const members = await ProjectsService.getTeamMembers(req.params.id);
    sendSuccess(res, members, 'Project team members retrieved successfully');
  }

  public static async addTeamMember(req: AuthenticatedRequest, res: Response): Promise<void> {
    const member = await ProjectsService.addTeamMember(req.params.id, req.body, req.user!);
    sendSuccess(res, member, 'Team member added successfully', 201);
  }

  public static async removeTeamMember(req: AuthenticatedRequest, res: Response): Promise<void> {
    const result = await ProjectsService.removeTeamMember(req.params.id, req.params.employeeId, req.user!);
    sendSuccess(res, null, result.message);
  }

  public static async deleteProject(req: AuthenticatedRequest, res: Response): Promise<void> {
    const result = await ProjectsService.deleteProject(req.params.id, req.user!);
    sendSuccess(res, result.archived ? { archived: true, project: result.project } : null, result.message);
  }
}
