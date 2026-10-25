import { Module } from '@nestjs/common';
import { AttemptsModule } from './attempts/attempts.module';
import { MeritService } from './attempts/merit.service';
import { CoreModule } from './core.module';
import { ExamJobsService } from './exams/exam-jobs.service';
import { ExamsModule } from './exams/exams.module';

/** Recurring jobs (partition maintenance, reminders, merit publish, auto-submit). Run exactly one instance. */
@Module({
  imports: [CoreModule, ExamsModule, AttemptsModule],
  providers: [ExamJobsService, MeritService],
})
export class SchedulerModule {}
