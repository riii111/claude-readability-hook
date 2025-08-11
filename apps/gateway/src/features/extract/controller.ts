import type { FastifyReply, FastifyRequest } from 'fastify';
import { ErrorCode, type GatewayError } from '../../core/errors.js';
import type { ExtractRequest, ExtractResponse } from '../../core/types.js';
import { extractContent } from './usecase.js';

export async function extractHandler(
  request: FastifyRequest<{ Body: ExtractRequest }>,
  reply: FastifyReply
): Promise<void> {
  const result = await extractContent(request.body.url);

  return result.match(
    (response: ExtractResponse) => reply.code(200).send(response),
    (error: GatewayError) => {
      let mappedCode = error.code;
      switch (error.code) {
        case ErrorCode.BadRequest:
          mappedCode = ErrorCode.VALIDATION_ERROR;
          break;
        case ErrorCode.Forbidden:
          mappedCode = ErrorCode.SSRF_BLOCKED;
          break;
        case ErrorCode.TooManyRequests:
          mappedCode = ErrorCode.RATE_LIMIT_EXCEEDED;
          break;
        default:
          mappedCode = error.code;
      }

      return reply.code(error.statusCode).send({
        error: {
          code: mappedCode,
          message: error.message,
          statusCode: error.statusCode,
        },
      });
    }
  );
}
