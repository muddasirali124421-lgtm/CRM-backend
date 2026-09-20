import { Response } from 'express';
import { AuthenticatedRequest } from '../../types/auth.types';
import { sendSuccess } from '../../utils/api-response';
import { TasksService } from './tasks.service';

export class TasksController {
  public static async listTasks(req: AuthenticatedRequest, res: Response): Promise<void> {
    const result = await TasksService.listTasks(req.query as any);
    sendSuccess(res, result, 'Tasks retrieved successfully');
  }

  public static async getTaskById(req: AuthenticatedRequest, res: Response): Promise<void> {
    const task = await TasksService.getTaskById(req.params.id);
    sendSuccess(res, task, 'Task details retrieved successfully');
  }

  public static async createTask(req: AuthenticatedRequest, res: Response): Promise<void> {
    const task = await TasksService.createTask(req.body, req.user!);
    sendSuccess(res, task, 'Task created successfully', 201);
  }

  public static async updateTask(req: AuthenticatedRequest, res: Response): Promise<void> {
    const task = await TasksService.updateTask(req.params.id, req.body, req.user!);
    sendSuccess(res, task, 'Task updated successfully');
  }

  public static async updateTaskStatus(req: AuthenticatedRequest, res: Response): Promise<void> {
    const task = await TasksService.updateTaskStatus(req.params.id, req.body.status, req.user!);
    sendSuccess(res, task, 'Task status updated successfully');
  }

  public static async deleteTask(req: AuthenticatedRequest, res: Response): Promise<void> {
    const result = await TasksService.deleteTask(req.params.id, req.user!);
    sendSuccess(res, null, result.message);
  }

  // Assignees
  public static async getAssignees(req: AuthenticatedRequest, res: Response): Promise<void> {
    const assignees = await TasksService.getAssignees(req.params.id);
    sendSuccess(res, assignees, 'Task assignees retrieved successfully');
  }

  public static async addAssignee(req: AuthenticatedRequest, res: Response): Promise<void> {
    const assignee = await TasksService.addAssignee(req.params.id, req.body, req.user!);
    sendSuccess(res, assignee, 'Assignee added to task successfully', 201);
  }

  public static async removeAssignee(req: AuthenticatedRequest, res: Response): Promise<void> {
    const result = await TasksService.removeAssignee(req.params.id, req.params.employeeId, req.user!);
    sendSuccess(res, null, result.message);
  }

  // Checklist
  public static async getChecklist(req: AuthenticatedRequest, res: Response): Promise<void> {
    const items = await TasksService.getChecklist(req.params.id);
    sendSuccess(res, items, 'Checklist items retrieved successfully');
  }

  public static async addChecklistItem(req: AuthenticatedRequest, res: Response): Promise<void> {
    const item = await TasksService.addChecklistItem(req.params.id, req.body, req.user!);
    sendSuccess(res, item, 'Checklist item added successfully', 201);
  }

  public static async updateChecklistItem(req: AuthenticatedRequest, res: Response): Promise<void> {
    const item = await TasksService.updateChecklistItem(req.params.id, req.params.itemId, req.body, req.user!);
    sendSuccess(res, item, 'Checklist item updated successfully');
  }

  public static async deleteChecklistItem(req: AuthenticatedRequest, res: Response): Promise<void> {
    const result = await TasksService.deleteChecklistItem(req.params.id, req.params.itemId, req.user!);
    sendSuccess(res, null, result.message);
  }

  public static async reorderChecklist(req: AuthenticatedRequest, res: Response): Promise<void> {
    const items = await TasksService.reorderChecklist(req.params.id, req.body, req.user!);
    sendSuccess(res, items, 'Checklist reordered successfully');
  }

  // Subtasks
  public static async getSubtasks(req: AuthenticatedRequest, res: Response): Promise<void> {
    const subtasks = await TasksService.getSubtasks(req.params.id);
    sendSuccess(res, subtasks, 'Subtasks retrieved successfully');
  }

  public static async createSubtask(req: AuthenticatedRequest, res: Response): Promise<void> {
    const subtask = await TasksService.createSubtask(req.params.id, req.body, req.user!);
    sendSuccess(res, subtask, 'Subtask created successfully', 201);
  }

  // Comments & Replies
  public static async getComments(req: AuthenticatedRequest, res: Response): Promise<void> {
    const comments = await TasksService.getComments(req.params.id);
    sendSuccess(res, comments, 'Comments retrieved successfully');
  }

  public static async createComment(req: AuthenticatedRequest, res: Response): Promise<void> {
    const comment = await TasksService.createComment(req.params.id, req.body, req.user!);
    sendSuccess(res, comment, 'Comment posted successfully', 201);
  }

  public static async updateComment(req: AuthenticatedRequest, res: Response): Promise<void> {
    const comment = await TasksService.updateComment(req.params.id, req.params.commentId, req.body, req.user!);
    sendSuccess(res, comment, 'Comment updated successfully');
  }

  public static async deleteComment(req: AuthenticatedRequest, res: Response): Promise<void> {
    const result = await TasksService.deleteComment(req.params.id, req.params.commentId, req.user!);
    sendSuccess(res, null, result.message);
  }

  // Activity Timeline
  public static async getActivity(req: AuthenticatedRequest, res: Response): Promise<void> {
    const activities = await TasksService.getActivity(req.params.id);
    sendSuccess(res, activities, 'Task activity timeline retrieved successfully');
  }
}
