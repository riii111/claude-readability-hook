import { z } from 'zod';

export const StackOverflowItemSchema = z.object({
  title: z.string().optional(),
  body: z.string().optional(),
  body_markdown: z.string().optional(),
  link: z.string().optional(),
  score: z.number().optional(),
  owner: z
    .object({
      display_name: z.string().optional(),
      user_id: z.number().optional(),
    })
    .optional(),
});

export const StackOverflowResponseSchema = <T extends z.ZodTypeAny>(item: T) =>
  z.object({
    items: z.array(item),
    has_more: z.boolean(),
  });
