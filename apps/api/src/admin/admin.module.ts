import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { PasswordService } from '../auth/password.service';
import { RateLimitService } from '../common/rate-limit.service';
import { APP_CONFIG, type AppConfig } from '../config/env';
import { AdminAuthController } from './admin-auth.controller';
import { AdminAuthGuard } from './admin-auth.guard';
import { AdminAuthService } from './admin-auth.service';
import { AuditService } from './audit.service';

/** Shared admin plumbing: identity, RBAC guard, audit. Feature admin controllers import this module. */
@Module({
  imports: [
    JwtModule.registerAsync({
      inject: [APP_CONFIG],
      useFactory: (config: AppConfig) => ({ secret: config.JWT_ACCESS_SECRET }),
    }),
  ],
  controllers: [AdminAuthController],
  providers: [AdminAuthService, AdminAuthGuard, AuditService, PasswordService, RateLimitService],
  exports: [AdminAuthService, AdminAuthGuard, AuditService, RateLimitService],
})
export class AdminModule {}
