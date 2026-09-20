import { Router } from 'express';
import { authenticate, authorize } from '../../middleware/auth.middleware';
import { validateRequest } from '../../middleware/validate.middleware';
import { TasksController } from './tasks.controller';
import {
  addAssigneeSchema,
  createChecklistSchema,
  createCommentSchema,
  createSubtaskSchema,
  createTaskSchema,
  reorderChecklistSchema,
  taskQuerySchema,
  updateChecklistSchema,
  updateCommentSchema,
  updateTaskSchema,
  updateTaskStatusSchema,
} from './tasks.validation';

const tasksRouter = Router();

// Apply authentication across all task endpoints
tasksRouter.use(authenticate);

// 1. List tasks (supports query filtering, pagination, search, and kanban view)
tasksRouter.get(
  '/',
  authorize('tasks.view'),
  validateRequest({ query: taskQuerySchema }),
  TasksController.listTasks
);

// 2. Create task
tasksRouter.post(
  '/',
  authorize('tasks.create'),
  validateRequest({ body: createTaskSchema }),
  TasksController.createTask
);

// 3. Task details
tasksRouter.get(
  '/:id',
  authorize('tasks.view'),
  TasksController.getTaskById
);

// 4. Update task fields
tasksRouter.patch(
  '/:id',
  authorize('tasks.edit'),
  validateRequest({ body: updateTaskSchema }),
  TasksController.updateTask
);

// 5. Delete task
tasksRouter.delete(
  '/:id',
  authorize('tasks.delete'),
  TasksController.deleteTask
);

// 6. Dedicated Kanban drag/drop status update
tasksRouter.patch(
  '/:id/status',
  authorize('tasks.edit'),
  validateRequest({ body: updateTaskStatusSchema }),
  TasksController.updateTaskStatus
);

// ============================================================================
// ASSIGNEES
// ============================================================================

tasksRouter.get(
  '/:id/assignees',
  authorize('tasks.view'),
  TasksController.getAssignees
);

tasksRouter.post(
  '/:id/assignees',
  authorize('tasks.assign'),
  validateRequest({ body: addAssigneeSchema }),
  TasksController.addAssignee
);

tasksRouter.delete(
  '/:id/assignees/:employeeId',
  authorize('tasks.assign'),
  TasksController.removeAssignee
);

// ============================================================================
// CHECKLIST ITEMS
// ============================================================================

tasksRouter.get(
  '/:id/checklist',
  authorize('tasks.view'),
  TasksController.getChecklist
);

tasksRouter.post(
  '/:id/checklist',
  authorize('tasks.edit'),
  validateRequest({ body: createChecklistSchema }),
  TasksController.addChecklistItem
);

// Specific route must precede parameterized route
tasksRouter.patch(
  '/:id/checklist/reorder',
  authorize('tasks.edit'),
  validateRequest({ body: reorderChecklistSchema }),
  TasksController.reorderChecklist
);

tasksRouter.patch(
  '/:id/checklist/:itemId',
  authorize('tasks.edit'),
  validateRequest({ body: updateChecklistSchema }),
  TasksController.updateChecklistItem
);

tasksRouter.delete(
  '/:id/checklist/:itemId',
  authorize('tasks.edit'),
  TasksController.deleteChecklistItem
);

// ============================================================================
// SUBTASKS
// ============================================================================

tasksRouter.get(
  '/:id/subtasks',
  authorize('tasks.view'),
  TasksController.getSubtasks
);

tasksRouter.post(
  '/:id/subtasks',
  authorize('tasks.create'),
  validateRequest({ body: createSubtaskSchema }),
  TasksController.createSubtask
);

// ============================================================================
// COMMENTS & REPLIES
// ============================================================================

tasksRouter.get(
  '/:id/comments',
  authorize('tasks.view'),
  TasksController.getComments
);

tasksRouter.post(
  '/:id/comments',
  authorize('tasks.view'),
  validateRequest({ body: createCommentSchema }),
  TasksController.createComment
);

tasksRouter.patch(
  '/:id/comments/:commentId',
  authorize('tasks.view'),
  validateRequest({ body: updateCommentSchema }),
  TasksController.updateComment
);

tasksRouter.delete(
  '/:id/comments/:commentId',
  authorize('tasks.view'),
  TasksController.deleteComment
);

// ============================================================================
// ACTIVITY TIMELINE
// ============================================================================

tasksRouter.get(
  '/:id/activity',
  authorize('tasks.view'),
  TasksController.getActivity
);

export default tasksRouter;
