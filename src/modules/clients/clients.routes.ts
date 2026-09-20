import { Router } from 'express';
import { authenticate, authorize } from '../../middleware/auth.middleware';
import { validateRequest } from '../../middleware/validate.middleware';
import { ClientsController } from './clients.controller';
import {
  assignClientSchema,
  clientQuerySchema,
  createClientSchema,
  updateClientSchema,
} from './clients.validation';

const clientsRouter = Router();

// Require authentication across all client endpoints
clientsRouter.use(authenticate);

// 1. List clients with search, filters, pagination, or compact mode
clientsRouter.get(
  '/',
  authorize('clients.view'),
  validateRequest({ query: clientQuerySchema }),
  ClientsController.listClients
);

// 2. Create client directly (without lead)
clientsRouter.post(
  '/',
  authorize('clients.create'),
  validateRequest({ body: createClientSchema }),
  ClientsController.createClient
);

// 3. Client details
clientsRouter.get(
  '/:id',
  authorize('clients.view'),
  ClientsController.getClientById
);

// 4. Update client
clientsRouter.patch(
  '/:id',
  authorize('clients.edit'),
  validateRequest({ body: updateClientSchema }),
  ClientsController.updateClient
);

// 5. Assign client to employee
clientsRouter.patch(
  '/:id/assign',
  authorize('clients.assign'),
  validateRequest({ body: assignClientSchema }),
  ClientsController.assignClient
);

// 6. Delete or archive client
clientsRouter.delete(
  '/:id',
  authorize('clients.delete'),
  ClientsController.deleteClient
);

export default clientsRouter;
