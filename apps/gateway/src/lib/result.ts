import { ResultAsync } from 'neverthrow';
import { type ErrorCode, type GatewayError, createError } from '../core/errors.js';

/**
 * Creates a ResultAsync from a Promise with consistent error handling
 */
export const fromPromiseE = <T>(
  promise: Promise<T>,
  code: ErrorCode,
  msgFn: (error: unknown) => string
): ResultAsync<T, GatewayError> =>
  ResultAsync.fromPromise(promise, (error) => createError(code, msgFn(error)));

/**
 * Creates an error wrapper function for mapErr operations
 */
export const wrap =
  (code: ErrorCode) =>
  (error: unknown): GatewayError =>
    createError(code, String(error));

/**
 * Specialized wrapper for service unavailable errors
 */
export const wrapServiceError =
  (prefix: string) =>
  (error: unknown): GatewayError =>
    createError('ServiceUnavailable', `${prefix}: ${String(error)}`);

/**
 * Specialized wrapper for internal errors
 */
export const wrapInternalError =
  (prefix: string) =>
  (error: unknown): GatewayError =>
    createError('InternalError', `${prefix}: ${String(error)}`);
