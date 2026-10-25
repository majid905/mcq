import { z } from 'zod';

const optionKey = z.enum(['a', 'b', 'c', 'd', 'e']);

/** `AnswerSync` in openapi.yaml: question_id -> option key, the full current map. */
export const answerSyncSchema = z.object({
  answers: z.record(z.string().regex(/^\d{1,19}$/), optionKey),
  marked_for_review: z
    .array(z.string().regex(/^\d{1,19}$/))
    .max(1000)
    .optional(),
  focus_loss_count: z.number().int().min(0).max(65535).optional(),
  client_time: z.string().optional(),
});
export type AnswerSyncDto = z.infer<typeof answerSyncSchema>;
