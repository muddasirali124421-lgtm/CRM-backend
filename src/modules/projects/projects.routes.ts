import { Router } from 'express';
import { authenticate, authorize } from '../../middleware/auth.middleware';
import { validateRequest } from '../../middleware/validate.middleware';
import { ProjectsController } from './projects.controller';
import {
  addTeamMemberSchema,
  assignManagerSchema,
  createProjectSchema,
  projectQuerySchema,
  updateProjectSchema,
} from './projects.validation';

const projectsRouter = Router();

// Apply authentication across all project endpoints
projectsRouter.use(authenticate);

// 1. List projects with search, filters, pagination, and sorting
projectsRouter.get(
  '/',
  authorize('projects.view'),
  validateRequest({ query: projectQuerySchema }),
  ProjectsController.listProjects
);

// 2. Create project
projectsRouter.post(
  '/',
  authorize('projects.create'),
  validateRequest({ body: createProjectSchema }),
  ProjectsController.createProject
);

// 3. Project details
projectsRouter.get(
  '/:id',
  authorize('projects.view'),
  ProjectsController.getProjectById
);

// 4. Update project business fields
projectsRouter.patch(
  '/:id',
  authorize('projects.edit'),
  validateRequest({ body: updateProjectSchema }),
  ProjectsController.updateProject
);

// 5. Assign Project Manager
projectsRouter.patch(
  '/:id/manager',
  authorize('projects.assign'),
  validateRequest({ body: assignManagerSchema }),
  ProjectsController.assignManager
);

// 6. Get Project Team Members
projectsRouter.get(
  '/:id/team',
  authorize('projects.view'),
  ProjectsController.getTeamMembers
);

// 7. Add Project Team Member
projectsRouter.post(
  '/:id/team',
  authorize('projects.assign'),
  validateRequest({ body: addTeamMemberSchema }),
  ProjectsController.addTeamMember
);

// 8. Remove Project Team Member
projectsRouter.delete(
  '/:id/team/:employeeId',
  authorize('projects.assign'),
  ProjectsController.removeTeamMember
);

// 9. Delete or archive project
projectsRouter.delete(
  '/:id',
  authorize('projects.delete'),
  ProjectsController.deleteProject
);

export default projectsRouter;
