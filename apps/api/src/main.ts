import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { Logger } from 'nestjs-pino';
import { AppModule } from './app.module';
import { configureApp } from './bootstrap';
import { APP_CONFIG, type AppConfig } from './config/env';
import { loadDotenv } from './config/dotenv';

async function main(): Promise<void> {
  loadDotenv();
  const app = await NestFactory.create(AppModule, { bufferLogs: true });
  app.useLogger(app.get(Logger));
  configureApp(app);
  app.enableShutdownHooks();
  const { API_PORT } = app.get<AppConfig>(APP_CONFIG);
  await app.listen(API_PORT, '0.0.0.0');
  app.get(Logger).log(`API listening on :${API_PORT} (Swagger UI at /docs)`);
}

main().catch((err: unknown) => {
  console.error(err);
  process.exit(1);
});
