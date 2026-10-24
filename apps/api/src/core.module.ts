import { Module } from '@nestjs/common';
import { ConfigModule } from './config/config.module';
import { LoggerModule } from './logger/logger.module';
import { PrismaModule } from './prisma/prisma.module';
import { RedisModule } from './redis/redis.module';

/** Infrastructure shared by the http, worker and scheduler processes. */
@Module({
  imports: [ConfigModule, LoggerModule, PrismaModule, RedisModule],
  exports: [ConfigModule, PrismaModule, RedisModule],
})
export class CoreModule {}
