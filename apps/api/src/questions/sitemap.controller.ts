import { Controller, Get, Header, Param } from '@nestjs/common';
import { Public } from '../auth/public.decorator';
import { ApiException } from '../common/api-exception';
import { SitemapService } from './sitemap.service';

/** Cloudflare caches these for an hour; nothing here is personal. */
const CACHE = 'public, max-age=3600';

@Controller('public/sitemap')
export class SitemapController {
  constructor(private readonly sitemap: SitemapService) {}

  @Public()
  @Get('questions')
  @Header('Cache-Control', CACHE)
  questionIndex() {
    return this.sitemap.questionIndex();
  }

  @Public()
  @Get('questions/:page')
  @Header('Cache-Control', CACHE)
  questionPage(@Param('page') raw: string) {
    if (!/^\d{1,6}$/.test(raw)) throw new ApiException('NOT_FOUND');
    return this.sitemap.questionPage(Number(raw));
  }

  @Public()
  @Get('exams')
  @Header('Cache-Control', CACHE)
  exams() {
    return this.sitemap.exams();
  }
}
