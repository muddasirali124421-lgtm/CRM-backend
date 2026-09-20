import { Router } from 'express';
import { authenticate, authorize } from '../../middleware/auth.middleware';
import { validateRequest } from '../../middleware/validate.middleware';
import { LeadsController } from './leads.controller';
import {
  assignLeadSchema,
  convertLeadSchema,
  createLeadSchema,
  leadQuerySchema,
  updateLeadSchema,
} from './leads.validation';

const leadsRouter = Router();

// Apply authentication across all lead endpoints
leadsRouter.use(authenticate);

// 1. List leads with search, filters, pagination, and sorting
leadsRouter.get(
  '/',
  authorize('leads.view'),
  validateRequest({ query: leadQuerySchema }),
  LeadsController.listLeads
);

// 2. Create lead with auto-generated leadCode
leadsRouter.post(
  '/',
  authorize('leads.create'),
  validateRequest({ body: createLeadSchema }),
  LeadsController.createLead
);

// 3. Lead details
leadsRouter.get(
  '/:id',
  authorize('leads.view'),
  LeadsController.getLeadById
);

// 4. Update lead
leadsRouter.patch(
  '/:id',
  authorize('leads.edit'),
  validateRequest({ body: updateLeadSchema }),
  LeadsController.updateLead
);

// 5. Assign lead to employee
leadsRouter.patch(
  '/:id/assign',
  authorize('leads.assign'),
  validateRequest({ body: assignLeadSchema }),
  LeadsController.assignLead
);

// 6. Convert lead to client (Requires both leads.edit and clients.create)
leadsRouter.post(
  '/:id/convert',
  authorize('leads.edit'),
  authorize('clients.create'),
  validateRequest({ body: convertLeadSchema }),
  LeadsController.convertLead
);

// 7. Delete lead (prohibits deleting converted leads)
leadsRouter.delete(
  '/:id',
  authorize('leads.delete'),
  LeadsController.deleteLead
);

export default leadsRouter;
