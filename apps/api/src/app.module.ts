import { Module } from '@nestjs/common';
import { AuthModule } from './auth/auth.module';
import { CoreModule } from './core.module';
import { ExamsModule } from './exams/exams.module';
import { HealthModule } from './health/health.module';
import { HomeModule } from './home/home.module';
import { MeModule } from './me/me.module';
import { SettingsModule } from './settings/settings.module';

/** HTTP API. Feature modules (exams, practice, ...) are added here as they are built. */
@Module({
  imports: [
    CoreModule,
    HealthModule,
    AuthModule,
    MeModule,
    SettingsModule,
    ExamsModule,
    HomeModule,
  ],
})
export class AppModule {}
