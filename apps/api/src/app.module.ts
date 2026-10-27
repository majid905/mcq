import { Module } from '@nestjs/common';
import { AdminModule } from './admin/admin.module';
import { AnalyticsModule } from './analytics/analytics.module';
import { BillingModule } from './billing/billing.module';
import { AttemptsModule } from './attempts/attempts.module';
import { AuthModule } from './auth/auth.module';
import { CoreModule } from './core.module';
import { ExamsModule } from './exams/exams.module';
import { HealthModule } from './health/health.module';
import { HomeModule } from './home/home.module';
import { MeModule } from './me/me.module';
import { NotificationsModule } from './notifications/notifications.module';
import { PracticeModule } from './practice/practice.module';
import { QuestionsModule } from './questions/questions.module';
import { SearchModule } from './search/search.module';
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
    AttemptsModule,
    QuestionsModule,
    PracticeModule,
    AnalyticsModule,
    SearchModule,
    NotificationsModule,
    HomeModule,
    AdminModule,
    BillingModule,
  ],
})
export class AppModule {}
