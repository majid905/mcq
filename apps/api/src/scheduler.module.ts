import { Module } from '@nestjs/common';
import { CoreModule } from './core.module';
import { ExamJobsService } from './exams/exam-jobs.service';
import { ExamsModule } from './exams/exams.module';

/** Recurring jobs (partition maintenance, reminders, merit publish, auto-submit). Run exactly one instance. */
@Module({ imports: [CoreModule, ExamsModule], providers: [ExamJobsService] })
export class SchedulerModule {}
