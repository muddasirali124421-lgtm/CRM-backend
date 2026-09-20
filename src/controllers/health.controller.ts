import { Request, Response } from 'express';
import prisma from '../config/database';

/**
 * Health check endpoint
 * GET /api/health
 * Public endpoint to verify API server status and database connectivity without authentication.
 * Never leaks database URLs, credentials, or internal secrets.
 */
export async function getHealth(_req: Request, res: Response): Promise<Response> {
  try {
    await prisma.$queryRaw`SELECT 1`;

    return res.status(200).json({
      success: true,
      message: 'OfficeCRM API is healthy',
      status: 'healthy',
      database: 'connected',
      timestamp: new Date().toISOString(),
    });
  } catch {
    return res.status(503).json({
      success: false,
      message: 'OfficeCRM API degraded: database unreachable',
      status: 'degraded',
      database: 'disconnected',
      timestamp: new Date().toISOString(),
    });
  }
}
