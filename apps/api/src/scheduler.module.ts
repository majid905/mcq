import { Module } from '@nestjs/common';
import { CoreModule } from './core.module';

/** Recurring jobs (partition maintenance, reminders, merit publish, auto-submit). Run exactly one instance. */
@Module({ imports: [CoreModule] })
export class SchedulerModule {}
