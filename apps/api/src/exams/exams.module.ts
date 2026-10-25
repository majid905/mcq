import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { NoopObjectStorage, OBJECT_STORAGE } from '../storage/object-storage';
import { EntitlementService } from './entitlement.service';
import { ExamCardsService } from './exam-cards.service';
import { ExamsController } from './exams.controller';
import { ExamsService } from './exams.service';
import { PaperService } from './paper.service';

@Module({
  imports: [AuthModule],
  controllers: [ExamsController],
  providers: [
    ExamsService,
    ExamCardsService,
    EntitlementService,
    PaperService,
    { provide: OBJECT_STORAGE, useClass: NoopObjectStorage },
  ],
  exports: [ExamsService, ExamCardsService, EntitlementService, PaperService],
})
export class ExamsModule {}
