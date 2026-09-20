import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import { authenticate } from '../../middleware/auth.middleware';
import { validateRequest } from '../../middleware/validate.middleware';
import { AuthController } from './auth.controller';
import { loginSchema, refreshSchema } from './auth.validation';

const authRouter = Router();

// Rate limiter for login endpoint (20 attempts per 15-minute window in production)
const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 20,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    success: false,
    message: 'Too many login attempts. Please try again after 15 minutes.',
  },
});

// POST /api/auth/login
authRouter.post(
  '/login',
  loginLimiter,
  validateRequest({ body: loginSchema }),
  AuthController.login
);

// POST /api/auth/refresh
authRouter.post(
  '/refresh',
  validateRequest({ body: refreshSchema }),
  AuthController.refresh
);

// POST /api/auth/logout
authRouter.post('/logout', AuthController.logout);

// GET /api/auth/me (Protected by authenticate middleware)
authRouter.get('/me', authenticate, AuthController.getMe);

export default authRouter;
