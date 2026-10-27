import { Module } from '@nestjs/common';
import { AuditService } from '../audit.service';
import { TaxonomyCounts } from '../content/taxonomy-counts';
import { ImportsConsumer } from './imports.consumer';
import { ImportsService } from './imports.service';

/** Pulled in by the worker process: starts the  consumer. */
@Module({
  providers: [ImportsService, ImportsConsumer, AuditService, TaxonomyCounts],
  exports: [ImportsConsumer, ImportsService],
})
export class ImportsWorkerModule {}
