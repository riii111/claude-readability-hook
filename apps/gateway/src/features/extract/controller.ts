import type { FastifyReply, FastifyRequest } from 'fastify';
import type { ExtractRequest } from '../../core/types.js';
import { extractContent } from './usecase.js';

export async function extractHandler(
  request: FastifyRequest<{ Body: ExtractRequest }>,
  reply: FastifyReply
): Promise<void> {
  const result = await extractContent(request.body.url);

  return result.match(
    (response) => reply.code(200).send(response),
    (error) => reply.code(error.statusCode).send({ error })
  );
}
