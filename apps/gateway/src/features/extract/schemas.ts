import { z } from 'zod';

export const extractRequestSchema = z.object({
  url: z
    .url()
    .refine(
      (url) => {
        const parsedUrl = new URL(url);
        return ['http:', 'https:'].includes(parsedUrl.protocol);
      },
      { message: 'Only HTTP and HTTPS protocols are allowed' }
    )
    .refine(
      (url) => {
        const BLOCKED_PORTS = new Set(['22', '23', '25', '3389']);
        const { port } = new URL(url);
        return !port || !BLOCKED_PORTS.has(port);
      },
      { message: 'Blocked port' }
    ),
});

export const extractResponseSchema = z.object({
  title: z.string(),
  text: z.string(),
  engine: z.enum([
    'trafilatura',
    'readability',
    'trafilatura+ssr',
    'stackoverflow-api',
    'reddit-json',
  ]),
  score: z.number(),
  cached: z.boolean(),
  success: z.literal(true),
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
      // テスト期待コードを追加
      'VALIDATION_ERROR',
      'SSRF_BLOCKED',
      'RATE_LIMIT_EXCEEDED',
      'INTERNAL_ERROR',
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
