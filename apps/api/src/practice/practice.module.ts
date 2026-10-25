import { Module } from '@nestjs/common';
import { AttemptsModule } from '../attempts/attempts.module';
import { AuthModule } from '../auth/auth.module';
import { ExamsModule } from '../exams/exams.module';
import { PoolService } from './pool.service';
import { PracticeController } from './practice.controller';
import { PracticeService } from './practice.service';

@Module({
  imports: [AuthModule, ExamsModule, AttemptsModule],
  controllers: [PracticeController],
  providers: [PracticeService, PoolService],
  exports: [PracticeService, PoolService],
})
export class PracticeModule {}
