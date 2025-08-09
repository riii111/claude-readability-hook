import { z } from 'zod';

export const RedditPostSchema = z.object({
  title: z.string(),
  selftext: z.string().optional(),
  selftext_html: z.string().optional(),
  url: z.string().optional(),
  author: z.string().optional(),
  subreddit: z.string().optional(),
});

export const RedditCommentSchema: z.ZodTypeAny = z.lazy(() =>
  z.object({
    body: z.string().optional(),
    body_html: z.string().optional(),
    author: z.string().optional(),
    score: z.number().optional(),
    replies: z.union([RedditListingSchema(RedditCommentSchema), z.literal('')]).optional(),
  })
);

export const RedditListingSchema = <T extends z.ZodTypeAny>(item: T) =>
  z.object({
    data: z.object({
      children: z.array(
        z.object({
          kind: z.string(),
          data: item,
        })
      ),
    }),
  });
