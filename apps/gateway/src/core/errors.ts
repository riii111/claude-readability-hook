export enum ErrorCode {
  BadRequest = 'BadRequest',
  Forbidden = 'Forbidden',
  NotFound = 'NotFound',
  TooManyRequests = 'TooManyRequests',
  InternalError = 'InternalError',
  ServiceUnavailable = 'ServiceUnavailable',
  VALIDATION_ERROR = 'VALIDATION_ERROR',
  SSRF_BLOCKED = 'SSRF_BLOCKED',
  RATE_LIMIT_EXCEEDED = 'RATE_LIMIT_EXCEEDED',
}

export interface GatewayError {
  code: ErrorCode;
  message: string;
  statusCode: number;
  details?: Record<string, unknown>;
}

export function createError(
  code: ErrorCode,
  message: string,
  details?: Record<string, unknown>
): GatewayError {
  const statusCodeMap: Record<ErrorCode, number> = {
    [ErrorCode.BadRequest]: 400,
    [ErrorCode.Forbidden]: 403,
    [ErrorCode.NotFound]: 404,
    [ErrorCode.TooManyRequests]: 429,
    [ErrorCode.InternalError]: 500,
    [ErrorCode.ServiceUnavailable]: 503,
    [ErrorCode.VALIDATION_ERROR]: 400,
    [ErrorCode.SSRF_BLOCKED]: 403,
    [ErrorCode.RATE_LIMIT_EXCEEDED]: 429,
  };

  const result: GatewayError = {
    code,
    message,
    statusCode: statusCodeMap[code],
  };

  if (details !== undefined) {
    result.details = details;
  }

  return result;
}
