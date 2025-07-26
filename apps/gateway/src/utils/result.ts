import { type Result, ResultAsync } from 'neverthrow';
import { type ErrorCode, type GatewayError, createError } from '../core/errors.js';

export const wrapErr =
  <E>(code: ErrorCode) =>
  (error: E): GatewayError =>
    createError(code, String(error));

export const andThenAsync =
  <T, E, U>(fn: (value: T) => ResultAsync<U, E>) =>
  (result: Result<T, E>) =>
    result.asyncAndThen(fn);

export const tapAsync =
  <T, E>(fn: (value: T) => Promise<void>) =>
  (result: ResultAsync<T, E>): ResultAsync<T, E> =>
    result.andTee(async (value) => {
      await fn(value);
    });

export const combineAsync = <T, E>(results: ResultAsync<T, E>[]): ResultAsync<T[], E> => {
  return ResultAsync.combine(results);
};
