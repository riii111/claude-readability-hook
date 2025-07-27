export enum ErrorCode {
  BadRequest = 'BadRequest',
  Forbidden = 'Forbidden',
  NotFound = 'NotFound',
  InternalError = 'InternalError',
  ServiceUnavailable = 'ServiceUnavailable',
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
    [ErrorCode.InternalError]: 500,
    [ErrorCode.ServiceUnavailable]: 503,
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
