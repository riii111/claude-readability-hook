import { z } from 'zod';

export const extractRequestSchema = z.object({
  url: z
    .string()
    .url('Invalid URL format')
    .refine(
      (url) => {
        const parsedUrl = new URL(url);
        return ['http:', 'https:'].includes(parsedUrl.protocol);
      },
      { message: 'Only HTTP and HTTPS protocols are allowed' }
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

export type ExtractRequestSchema = z.infer<typeof extractRequestSchema>;
export type ExtractResponseSchema = z.infer<typeof extractResponseSchema>;
