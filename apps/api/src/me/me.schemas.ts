import { z } from 'zod';

// Mirrors MeUpdate in packages/api-contract/openapi.yaml.
export const meUpdateSchema = z.object({
  name: z.string().trim().min(2).max(100).optional(),
  avatar_url: z.url().max(500).optional(),
  district_id: z.number().int().min(1).max(64).optional(),
  target_node_ids: z
    .array(z.string().regex(/^[0-9]+$/))
    .max(10)
    .optional(),
  locale: z.enum(['bn', 'en']).optional(),
  theme: z.enum(['system', 'light', 'dark']).optional(),
});
export type MeUpdateDto = z.infer<typeof meUpdateSchema>;

export const pushTokenSchema = z.object({ token: z.string().min(1).max(255) });
export type PushTokenDto = z.infer<typeof pushTokenSchema>;
