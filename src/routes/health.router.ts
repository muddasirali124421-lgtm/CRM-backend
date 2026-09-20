import { Router } from 'express';
import { getHealth } from '../controllers/health.controller';

const router = Router();

// GET /api/health
router.get('/health', getHealth);

export default router;
