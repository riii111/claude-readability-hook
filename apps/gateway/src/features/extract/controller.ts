import type { FastifyRequest, FastifyReply } from 'fastify';
import { extractRequestSchema } from './schemas.js';
import { extractContent } from './usecase.js';
import type { ExtractRequest } from '../../core/types.js';

export async function extractHandler(
  request: FastifyRequest<{ Body: ExtractRequest }>,
  reply: FastifyReply
): Promise<void> {
  // Zodでリクエストボディをバリデーション
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

  const result = await extractContent(validation.data.url);

  result.match(
    (response) => {
      reply.code(200).send(response);
    },
    (error) => {
      reply.code(error.statusCode).send({ error });
    }
  );
}