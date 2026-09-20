import { NextFunction, Request, Response } from 'express';
import { AnyZodObject, ZodError, ZodTypeAny } from 'zod';
import { sendError } from '../utils/api-response';

export interface RequestValidationSchemas {
  body?: AnyZodObject | ZodTypeAny;
  query?: AnyZodObject | ZodTypeAny;
  params?: AnyZodObject | ZodTypeAny;
}

/**
 * Reusable Zod validation middleware for Express routes.
 * Validates request body, query parameters, and route parameters.
 */
export function validateRequest(schemas: RequestValidationSchemas) {
  return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      if (schemas.body) {
        req.body = await schemas.body.parseAsync(req.body);
      }
      if (schemas.query) {
        req.query = (await schemas.query.parseAsync(req.query)) as Request['query'];
      }
      if (schemas.params) {
        req.params = (await schemas.params.parseAsync(req.params)) as Request['params'];
      }
      next();
    } catch (error) {
      if (error instanceof ZodError) {
        const formattedErrors = error.errors.map((err) => ({
          field: err.path.join('.'),
          message: err.message,
        }));
        sendError(res, 'Validation failed', 400, formattedErrors);
        return;
      }
      next(error);
    }
  };
}
