import { Module } from '@nestjs/common';
import { AttemptsModule } from './attempts/attempts.module';
import { MeritService } from './attempts/merit.service';
import { BillingJobsModule } from './billing/billing.module';
import { AccountJobsService } from './me/account-jobs.service';
import { CoreModule } from './core.module';
import { ExamJobsService } from './exams/exam-jobs.service';
import { ExamsModule } from './exams/exams.module';
import { NotificationsCoreModule } from './notifications/notifications.module';

/** Recurring jobs (partition maintenance, reminders, merit publish, auto-submit). Run exactly one instance. */
@Module({
  imports: [CoreModule, ExamsModule, AttemptsModule, NotificationsCoreModule, BillingJobsModule],
  providers: [ExamJobsService, MeritService, AccountJobsService],
})
export class SchedulerModule {}
