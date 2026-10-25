import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { ExamsModule } from '../exams/exams.module';
import { AttemptsController } from './attempts.controller';
import { AttemptsService } from './attempts.service';
import { LeaderboardService } from './leaderboard.service';
import { ResultsService } from './results.service';
import { ScoringConsumer } from './scoring.consumer';
import { ScoringService } from './scoring.service';

@Module({
  imports: [AuthModule, ExamsModule],
  controllers: [AttemptsController],
  providers: [AttemptsService, ResultsService, LeaderboardService, ScoringService],
  exports: [AttemptsService, ResultsService, LeaderboardService, ScoringService],
})
export class AttemptsModule {}

/** Pulled in by the worker process only: starts the `q:submit` consumer. */
@Module({
  imports: [ExamsModule],
  providers: [ScoringService, ScoringConsumer],
  exports: [ScoringService, ScoringConsumer],
})
export class ScoringWorkerModule {}
