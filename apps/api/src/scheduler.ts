import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { Logger } from 'nestjs-pino';
import { loadDotenv } from './config/dotenv';
import { SchedulerModule } from './scheduler.module';

async function main(): Promise<void> {
  loadDotenv();
  const app = await NestFactory.createApplicationContext(SchedulerModule, { bufferLogs: true });
  app.useLogger(app.get(Logger));
  app.enableShutdownHooks();
  app.get(Logger).log('Scheduler started');
}

main().catch((err: unknown) => {
  console.error(err);
  process.exit(1);
});
