import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { PasswordService } from '../auth/password.service';
import { RateLimitService } from '../common/rate-limit.service';
import { APP_CONFIG, type AppConfig } from '../config/env';
import { AuthModule } from '../auth/auth.module';
import { ExamsModule } from '../exams/exams.module';
import { AccountsAdminController } from './accounts/accounts-admin.controller';
import { AccountsAdminService } from './accounts/accounts-admin.service';
import { CatalogAdminController } from './catalog/catalog-admin.controller';
import { CatalogAdminService } from './catalog/catalog-admin.service';
import { OpsAdminController } from './ops/ops-admin.controller';
import { OpsAdminService } from './ops/ops-admin.service';
import { AdminAuthController } from './admin-auth.controller';
import { AdminAuthGuard } from './admin-auth.guard';
import { AdminAuthService } from './admin-auth.service';
import { AuditService } from './audit.service';

/** Shared admin plumbing: identity, RBAC guard, audit. Feature admin controllers import this module. */
@Module({
  imports: [
    AuthModule,
    ExamsModule,
    JwtModule.registerAsync({
      inject: [APP_CONFIG],
      useFactory: (config: AppConfig) => ({ secret: config.JWT_ACCESS_SECRET }),
    }),
  ],
  controllers: [
    AdminAuthController,
    CatalogAdminController,
    AccountsAdminController,
    OpsAdminController,
  ],
  providers: [
    AdminAuthService,
    AdminAuthGuard,
    AuditService,
    PasswordService,
    RateLimitService,
    CatalogAdminService,
    AccountsAdminService,
    OpsAdminService,
  ],
  exports: [AdminAuthService, AdminAuthGuard, AuditService, RateLimitService],
})
export class AdminModule {}
