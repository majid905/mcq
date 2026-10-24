import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { JwtModule } from '@nestjs/jwt';
import { RateLimitService } from '../common/rate-limit.service';
import { APP_CONFIG, type AppConfig } from '../config/env';
import { MeService } from '../me/me.service';
import { SettingsService } from '../settings/settings.service';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { DevicesService } from './devices.service';
import { AppGateGuard } from '../gate/app-gate.guard';
import { JwtAuthGuard } from './jwt-auth.guard';
import { OtpService } from './otp.service';
import { PasswordService } from './password.service';
import { ConsoleSmsProvider } from './sms/console-sms.provider';
import { HttpSmsProvider } from './sms/http-sms.provider';
import { SMS_PROVIDER } from './sms/sms.provider';
import { TokenService } from './token.service';

@Module({
  imports: [
    JwtModule.registerAsync({
      inject: [APP_CONFIG],
      useFactory: (config: AppConfig) => ({ secret: config.JWT_ACCESS_SECRET }),
    }),
  ],
  controllers: [AuthController],
  providers: [
    AuthService,
    OtpService,
    TokenService,
    PasswordService,
    DevicesService,
    MeService,
    SettingsService,
    RateLimitService,
    {
      provide: SMS_PROVIDER,
      inject: [APP_CONFIG],
      useFactory: (config: AppConfig) =>
        config.SMS_DRIVER === 'http' && config.SMS_HTTP_URL
          ? new HttpSmsProvider({
              url: config.SMS_HTTP_URL,
              ...(config.SMS_HTTP_API_KEY ? { apiKey: config.SMS_HTTP_API_KEY } : {}),
              ...(config.SMS_SENDER_ID ? { senderId: config.SMS_SENDER_ID } : {}),
            })
          : new ConsoleSmsProvider(),
    },
    // Guard order matters: maintenance/version gate first, then authentication.
    { provide: APP_GUARD, useClass: AppGateGuard },
    // Every route is protected unless it is marked @Public().
    { provide: APP_GUARD, useClass: JwtAuthGuard },
  ],
  exports: [
    AuthService,
    TokenService,
    DevicesService,
    MeService,
    SettingsService,
    RateLimitService,
  ],
})
export class AuthModule {}
