import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { APP_CONFIG, type AppConfig } from '../config/env';
import { NotificationService } from './notification.service';
import { NotificationsController } from './notifications.controller';
import { ConsolePushSender, FcmPushSender, PUSH_SENDER, type PushSender } from './push.sender';

const pushProvider = {
  provide: PUSH_SENDER,
  inject: [APP_CONFIG],
  useFactory: (config: AppConfig): PushSender =>
    config.PUSH_DRIVER === 'fcm' && config.FCM_SERVICE_ACCOUNT_JSON
      ? new FcmPushSender(config.FCM_SERVICE_ACCOUNT_JSON)
      : new ConsolePushSender(),
};

@Module({
  imports: [AuthModule],
  controllers: [NotificationsController],
  providers: [NotificationService, pushProvider],
  exports: [NotificationService],
})
export class NotificationsModule {}

/** For the worker and scheduler processes (no HTTP controllers). */
@Module({
  providers: [NotificationService, pushProvider],
  exports: [NotificationService],
})
export class NotificationsCoreModule {}
