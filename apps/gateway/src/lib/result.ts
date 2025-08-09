import { ResultAsync } from 'neverthrow';
import { type ErrorCode, type GatewayError, createError } from '../core/errors.js';

/**
 * Creates a ResultAsync from a Promise with consistent error handling
 */
export const resultFrom = <T>(
  promise: Promise<T>,
  code: ErrorCode,
  msgFn: (error: unknown) => string
): ResultAsync<T, GatewayError> =>
  ResultAsync.fromPromise(promise, (error) => createError(code, msgFn(error)));

/**
 * Maps unknown errors to GatewayError with specified error code
 */
export const mapUnknownErrorToGatewayError =
  (code: ErrorCode) =>
  (error: unknown): GatewayError =>
    createError(code, error instanceof Error ? error.message : String(error));
