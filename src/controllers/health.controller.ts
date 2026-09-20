import { Request, Response } from 'express';

/**
 * Health check endpoint
 * GET /api/health
 * Public endpoint to verify API server status without authentication.
 */
export function getHealth(_req: Request, res: Response): Response {
  return res.status(200).json({
    success: true,
    message: 'OfficeCRM API is running',
  });
}
