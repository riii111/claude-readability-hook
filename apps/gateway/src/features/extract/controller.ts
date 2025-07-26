import type { FastifyReply, FastifyRequest } from 'fastify';
import type { ExtractRequest } from '../../core/types.js';
import { extractRequestSchema } from './schemas.js';
import { extractContent } from './usecase.js';

export async function extractHandler(
  request: FastifyRequest<{ Body: ExtractRequest }>,
  reply: FastifyReply
): Promise<void> {
  const validation = extractRequestSchema.safeParse(request.body);

  if (!validation.success) {
    return reply.code(400).send({
      error: {
        code: 'BadRequest',
        message: 'Invalid request body',
        details: validation.error.flatten(),
      },
    });
  }

  extractContent(validation.data.url).then((result) => {
    result.match(
      (response) => {
        reply.code(200).send(response);
      },
      (error) => {
        reply.code(error.statusCode).send({ error });
      }
    );
  });
}
