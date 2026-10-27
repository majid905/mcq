import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { Logger } from 'nestjs-pino';
import { AppModule } from './app.module';
import { configureApp } from './bootstrap';
import { APP_CONFIG, type AppConfig } from './config/env';
import { startCpuProfileIfRequested } from './common/cpu-profile';
import { loadDotenv } from './config/dotenv';

async function main(): Promise<void> {
  loadDotenv();
  startCpuProfileIfRequested();
  const app = await NestFactory.create(AppModule, { bufferLogs: true });
  app.useLogger(app.get(Logger));
  configureApp(app);
  app.enableShutdownHooks();
  const { API_PORT } = app.get<AppConfig>(APP_CONFIG);
  // A live exam starts with thousands of connections in a few seconds: a deep accept queue stops the
  // kernel refusing them, and keep-alive must outlive the reverse proxy's idle timeout (nginx 60 s).
  await app.init();
  const server = app.getHttpServer() as import('node:http').Server;
  server.keepAliveTimeout = 65_000;
  server.headersTimeout = 66_000;
  await new Promise<void>((resolve, reject) => {
    server.once('error', reject);
    server.listen(API_PORT, '0.0.0.0', 4096, resolve);
  });
  app.get(Logger).log(`API listening on :${API_PORT} (Swagger UI at /docs)`);
}

main().catch((err: unknown) => {
  console.error(err);
  process.exit(1);
});
