/**
 * Standardized API Response Types
 */

export interface ApiResponseSuccess<T = unknown> {
  success: true;
  message?: string;
  data?: T;
}

export interface ApiResponseError {
  success: false;
  message: string;
  errors?: unknown;
}

export type ApiResponse<T = unknown> = ApiResponseSuccess<T> | ApiResponseError;
