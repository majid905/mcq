import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { expectContract } from './harness';

export const OTP = '123456'; // dev OTP: console SMS driver
export const PASSWORD = 'Secret#123';

export type Platform = 'android' | 'ios' | 'web';

export const device = (id: string, platform: Platform = 'web') => ({
  device_id: id,
  platform,
  model: 'jest',
  app_version: '1.0.0',
});

export const randomPhone = () => `0171${String(Math.floor(Math.random() * 1e7)).padStart(7, '0')}`;

export const bearer = (token: string) => ({ Authorization: `Bearer ${token}` });

export interface Session {
  access_token: string;
  refresh_token: string;
  user: { id: string; phone: string };
}

/** Full register flow through the public API (OTP request, verify, register). */
export async function registerUser(
  app: INestApplication,
  phone: string,
  dev = device(`dev-${phone}`),
  name = 'রাকিব হাসান',
): Promise<Session> {
  const http = () => request(app.getHttpServer());
  expectContract(
    await http().post('/v1/auth/otp/request').send({ phone, purpose: 'register' }).expect(200),
  );
  const verify = await http()
    .post('/v1/auth/otp/verify')
    .send({ phone, code: OTP, purpose: 'register' })
    .expect(200);
  const res = await http()
    .post('/v1/auth/register')
    .send({
      verification_token: verify.body.data.verification_token,
      name,
      password: PASSWORD,
      device: dev,
    })
    .expect(201);
  return res.body.data as Session;
}
