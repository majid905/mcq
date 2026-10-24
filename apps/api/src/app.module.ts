import { Module } from '@nestjs/common';
import { CoreModule } from './core.module';
import { HealthModule } from './health/health.module';

/** HTTP API. Feature modules (auth, users, exams, ...) are added here as they are built. */
@Module({ imports: [CoreModule, HealthModule] })
export class AppModule {}
