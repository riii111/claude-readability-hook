import { z } from 'zod';

export const extractRequestSchema = z.object({
  url: z.url().refine(
    (url) => {
      const parsedUrl = new URL(url);
      return ['http:', 'https:'].includes(parsedUrl.protocol);
    },
    { error: 'Only HTTP and HTTPS protocols are allowed' }
  ),
});

export const extractResponseSchema = z.object({
  title: z.string(),
  text: z.string(),
  engine: z.enum(['trafilatura', 'readability', 'trafilatura+ssr']),
  score: z.number(),
  cached: z.boolean(),
  renderTime: z.number().optional(),
});

export const extractorServiceResponseSchema = z.object({
  title: z.string(),
  text: z.string(),
  engine: z.enum(['trafilatura', 'readability']),
  score: z.number(),
  success: z.boolean(),
});

export const rendererServiceResponseSchema = z.object({
  html: z.string(),
  renderTime: z.number(),
  success: z.boolean(),
});

export const errorResponseSchema = z.object({
  error: z.object({
    code: z.enum([
      'BadRequest',
      'Forbidden',
      'NotFound',
      'InternalError',
      'ServiceUnavailable',
      'TooManyRequests',
    ]),
    message: z.string(),
    statusCode: z.number(),
    details: z.record(z.string(), z.unknown()).optional(),
  }),
});

export type ExtractRequestSchema = z.infer<typeof extractRequestSchema>;
export type ExtractResponseSchema = z.infer<typeof extractResponseSchema>;
export type ExtractorServiceResponseSchema = z.infer<typeof extractorServiceResponseSchema>;
export type RendererServiceResponseSchema = z.infer<typeof rendererServiceResponseSchema>;
export type ErrorResponseSchema = z.infer<typeof errorResponseSchema>;
