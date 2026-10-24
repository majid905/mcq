import { Module } from '@nestjs/common';
import { AuthModule } from './auth/auth.module';
import { CoreModule } from './core.module';
import { HealthModule } from './health/health.module';

/** HTTP API. Feature modules (users, exams, ...) are added here as they are built. */
@Module({ imports: [CoreModule, HealthModule, AuthModule] })
export class AppModule {}
