import { Module } from '@nestjs/common';
import { CoreModule } from './core.module';

/** BullMQ processors (scoring, search sync, analytics, notifications) register here. */
@Module({ imports: [CoreModule] })
export class WorkerModule {}
