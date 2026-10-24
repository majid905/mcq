import { z } from 'zod';

// Mirrors the request bodies in packages/api-contract/openapi.yaml (Auth section).
export const phoneSchema = z
  .string()
  .regex(/^01[3-9][0-9]{8}$/, 'invalid Bangladeshi mobile number');
const purposeSchema = z.enum(['register', 'reset_password']);

export const deviceSchema = z.object({
  device_id: z.string().min(1).max(128),
  platform: z.enum(['android', 'ios', 'web']),
  model: z.string().max(100).optional(),
  app_version: z.string().max(20).optional(),
});

export const otpRequestSchema = z.object({ phone: phoneSchema, purpose: purposeSchema });
export const otpVerifySchema = z.object({
  phone: phoneSchema,
  code: z.string().regex(/^[0-9]{6}$/, 'must be 6 digits'),
  purpose: purposeSchema,
});
export const registerSchema = z.object({
  verification_token: z.string().min(1),
  name: z.string().trim().min(2).max(100),
  password: z.string().min(8).max(64),
  device: deviceSchema,
});
export const loginSchema = z.object({
  phone: phoneSchema,
  password: z.string().min(1).max(64),
  device: deviceSchema,
});
export const refreshSchema = z.object({ refresh_token: z.string().min(1) });
export const passwordResetSchema = z.object({
  verification_token: z.string().min(1),
  password: z.string().min(8).max(64),
});

export type OtpRequestDto = z.infer<typeof otpRequestSchema>;
export type OtpVerifyDto = z.infer<typeof otpVerifySchema>;
export type RegisterDto = z.infer<typeof registerSchema>;
export type LoginDto = z.infer<typeof loginSchema>;
export type RefreshDto = z.infer<typeof refreshSchema>;
export type PasswordResetDto = z.infer<typeof passwordResetSchema>;
