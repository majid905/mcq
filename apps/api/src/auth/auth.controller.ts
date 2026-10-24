import { Body, Controller, HttpCode, Post, Req } from '@nestjs/common';
import type { Request } from 'express';
import { ZodValidationPipe } from '../common/zod-validation.pipe';
import { AuthService } from './auth.service';
import {
  loginSchema,
  otpRequestSchema,
  otpVerifySchema,
  passwordResetSchema,
  refreshSchema,
  registerSchema,
  type LoginDto,
  type OtpRequestDto,
  type OtpVerifyDto,
  type PasswordResetDto,
  type RefreshDto,
  type RegisterDto,
} from './auth.schemas';
import { CurrentUser, type AuthUser } from './current-user.decorator';
import { Public } from './public.decorator';

/**
 * Bearer tokens for every platform. The Next.js BFF keeps the tokens in httpOnly cookies
 * (docs/04-API.md section 2); the API itself never sets cookies.
 */
@Controller('auth')
export class AuthController {
  constructor(private readonly auth: AuthService) {}

  @Public()
  @Post('otp/request')
  @HttpCode(200)
  requestOtp(
    @Body(new ZodValidationPipe(otpRequestSchema)) dto: OtpRequestDto,
    @Req() req: Request,
  ) {
    return this.auth.requestOtp(dto.phone, dto.purpose, req.ip ?? 'unknown');
  }

  @Public()
  @Post('otp/verify')
  @HttpCode(200)
  verifyOtp(@Body(new ZodValidationPipe(otpVerifySchema)) dto: OtpVerifyDto) {
    return this.auth.verifyOtp(dto.phone, dto.code, dto.purpose);
  }

  @Public()
  @Post('register')
  @HttpCode(201)
  register(@Body(new ZodValidationPipe(registerSchema)) dto: RegisterDto) {
    return this.auth.register(dto.verification_token, dto.name, dto.password, dto.device);
  }

  @Public()
  @Post('login')
  @HttpCode(200)
  login(@Body(new ZodValidationPipe(loginSchema)) dto: LoginDto, @Req() req: Request) {
    return this.auth.login(dto.phone, dto.password, dto.device, req.ip ?? 'unknown');
  }

  @Public()
  @Post('refresh')
  @HttpCode(200)
  refresh(@Body(new ZodValidationPipe(refreshSchema)) dto: RefreshDto) {
    return this.auth.refresh(dto.refresh_token);
  }

  @Post('logout')
  @HttpCode(204)
  async logout(@CurrentUser() user: AuthUser): Promise<void> {
    await this.auth.logout(user.deviceRowId);
  }

  @Public()
  @Post('password/reset')
  @HttpCode(204)
  async resetPassword(
    @Body(new ZodValidationPipe(passwordResetSchema)) dto: PasswordResetDto,
  ): Promise<void> {
    await this.auth.resetPassword(dto.verification_token, dto.password);
  }
}
