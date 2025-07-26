export type ErrorCode = 
  | 'BadRequest'
  | 'Forbidden'
  | 'NotFound'
  | 'InternalError'
  | 'ServiceUnavailable';

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
    BadRequest: 400,
    Forbidden: 403,
    NotFound: 404,
    InternalError: 500,
    ServiceUnavailable: 503,
  };

  return {
    code,
    message,
    statusCode: statusCodeMap[code],
    details,
  };
}