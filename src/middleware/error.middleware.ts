import { NextFunction, Request, Response } from 'express';
import { Prisma } from '@prisma/client';
import { env } from '../config/env';
import { AppError, sendError } from '../utils/api-response';

/**
 * 404 Route Not Found Middleware
 */
export function notFoundHandler(req: Request, res: Response): void {
  sendError(res, `Route not found: ${req.method} ${req.originalUrl}`, 404);
}

/**
 * Central Error Handling Middleware
 * Handles AppError, Prisma database errors, SyntaxError, and unhandled exceptions.
 * Never leaks stack traces, passwords, or raw database query internals in responses.
 */
export function errorHandler(
  err: Error | AppError,
  _req: Request,
  res: Response,
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  _next: NextFunction
): void {
  // Safe logging in development without sensitive data leakage
  if (env.NODE_ENV === 'development') {
    console.error('[Error Details]:', {
      name: err.name,
      message: err.message,
    });
  }

  // 1. Handle JSON parse errors from express.json()
  if (err instanceof SyntaxError && 'status' in err && (err as { status: number }).status === 400) {
    sendError(res, 'Malformed JSON payload in request body', 400);
    return;
  }

  // 2. Handle operational AppErrors
  if (err instanceof AppError) {
    sendError(res, err.message, err.statusCode, err.errors);
    return;
  }

  // 3. Handle Prisma known request errors safely
  if (err instanceof Prisma.PrismaClientKnownRequestError) {
    switch (err.code) {
      case 'P2002': {
        const target = Array.isArray(err.meta?.target) ? (err.meta.target as string[]).join(', ') : 'field';
        sendError(res, `A record with this ${target} already exists.`, 409);
        return;
      }
      case 'P2025': {
        sendError(res, 'The requested record was not found or has already been deleted.', 404);
        return;
      }
      case 'P2003': {
        sendError(res, 'Foreign key constraint failed: referenced entity does not exist.', 400);
        return;
      }
      default: {
        sendError(res, 'A database constraint error occurred.', 400);
        return;
      }
    }
  }

  // 4. Unhandled / Internal Server Error
  const message =
    env.NODE_ENV === 'production'
      ? 'Internal server error'
      : err.message || 'An unexpected error occurred';

  sendError(res, message, 500);
}
