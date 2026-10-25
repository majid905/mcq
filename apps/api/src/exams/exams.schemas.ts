import { z } from 'zod';

const id = z.string().regex(/^\d{1,19}$/, 'must be a numeric id');

export const examListQuerySchema = z.object({
  status: z.enum(['upcoming', 'running', 'finished']),
  type: z.enum(['live', 'model', 'previous_year']).optional(),
  category_id: id.optional(),
  cursor: z.string().max(64).optional(),
  limit: z.coerce.number().int().min(1).max(100).default(20),
});
export type ExamListQuery = z.infer<typeof examListQuerySchema>;

export const startBodySchema = z
  .object({ mode: z.enum(['ranked', 'practice']).default('ranked') })
  .default({ mode: 'ranked' });
export type StartBody = z.infer<typeof startBodySchema>;
