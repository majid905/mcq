import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { ExamsModule } from '../exams/exams.module';
import { QuestionDtoService } from './question-dto.service';
import { QuestionsController } from './questions.controller';
import { QuestionsService } from './questions.service';
import { SitemapController } from './sitemap.controller';
import { SitemapService } from './sitemap.service';
import { TaxonomyService } from './taxonomy.service';

@Module({
  imports: [AuthModule, ExamsModule],
  controllers: [QuestionsController, SitemapController],
  providers: [QuestionsService, QuestionDtoService, TaxonomyService, SitemapService],
  exports: [QuestionsService, QuestionDtoService, TaxonomyService],
})
export class QuestionsModule {}
