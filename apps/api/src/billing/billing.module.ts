import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { APP_CONFIG, type AppConfig } from '../config/env';
import { NotificationsCoreModule } from '../notifications/notifications.module';
import { RedisService } from '../redis/redis.service';
import { BillingJobsService } from './billing-jobs.service';
import { BillingController } from './billing.controller';
import { BillingService } from './billing.service';
import { BkashGateway } from './gateways/bkash.gateway';
import { FakeGateway } from './gateways/fake.gateway';
import { PAYMENT_GATEWAYS, type PaymentGateway } from './gateways/payment-gateway';
import { SslcommerzGateway } from './gateways/sslcommerz.gateway';
import { PaymentsService } from './payments.service';

const gatewayProvider = {
  provide: PAYMENT_GATEWAYS,
  inject: [APP_CONFIG, RedisService],
  useFactory: (config: AppConfig, redis: RedisService): PaymentGateway[] => {
    if (
      config.PAYMENT_DRIVER === 'live' &&
      config.SSLCOMMERZ_STORE_ID &&
      config.SSLCOMMERZ_STORE_PASSWORD &&
      config.BKASH_APP_KEY &&
      config.BKASH_APP_SECRET &&
      config.BKASH_USERNAME &&
      config.BKASH_PASSWORD
    ) {
      return [
        new SslcommerzGateway({
          storeId: config.SSLCOMMERZ_STORE_ID,
          storePassword: config.SSLCOMMERZ_STORE_PASSWORD,
          live: config.SSLCOMMERZ_LIVE,
        }),
        new BkashGateway(
          {
            appKey: config.BKASH_APP_KEY,
            appSecret: config.BKASH_APP_SECRET,
            username: config.BKASH_USERNAME,
            password: config.BKASH_PASSWORD,
            live: config.BKASH_LIVE,
          },
          redis,
        ),
      ];
    }
    return [new FakeGateway('bkash'), new FakeGateway('sslcommerz')];
  },
};

/** FR-PAY-01..06: packages, coupons, trial, checkout, gateway callbacks. */
@Module({
  imports: [AuthModule, NotificationsCoreModule],
  controllers: [BillingController],
  providers: [BillingService, PaymentsService, gatewayProvider],
  exports: [BillingService, PaymentsService],
})
export class BillingModule {}

/** Scheduler process: subscription expiry reminders. */
@Module({
  imports: [NotificationsCoreModule],
  providers: [BillingJobsService],
})
export class BillingJobsModule {}
