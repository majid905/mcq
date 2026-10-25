import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { ExamsModule } from '../exams/exams.module';
import { QuestionDtoService } from './question-dto.service';
import { QuestionsController } from './questions.controller';
import { QuestionsService } from './questions.service';
import { TaxonomyService } from './taxonomy.service';

@Module({
  imports: [AuthModule, ExamsModule],
  controllers: [QuestionsController],
  providers: [QuestionsService, QuestionDtoService, TaxonomyService],
  exports: [QuestionsService, QuestionDtoService, TaxonomyService],
})
export class QuestionsModule {}
