import { NextFunction, Request, Response } from 'express';
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
 * Handles AppError, SyntaxError (bad JSON body), and unhandled errors.
 * Never leaks stack traces or sensitive internal details in production.
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
      stack: err.stack,
    });
  }

  // Handle JSON parse errors from express.json()
  if (err instanceof SyntaxError && 'status' in err && (err as { status: number }).status === 400) {
    sendError(res, 'Malformed JSON payload in request body', 400);
    return;
  }

  // Handle operational AppErrors
  if (err instanceof AppError) {
    sendError(res, err.message, err.statusCode, err.errors);
    return;
  }

  // Unhandled / Internal Server Error
  const message =
    env.NODE_ENV === 'production'
      ? 'Internal server error'
      : err.message || 'An unexpected error occurred';

  sendError(res, message, 500);
}
