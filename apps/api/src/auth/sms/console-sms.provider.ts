import { Logger } from '@nestjs/common';
import type { SmsProvider } from './sms.provider';

/** Dev driver: prints the message. OtpService uses the fixed code 123456 with this driver. */
export class ConsoleSmsProvider implements SmsProvider {
  private readonly logger = new Logger('Sms');

  send(to: string, message: string): Promise<void> {
    this.logger.log(`[console sms] to=${to} message="${message}"`);
    return Promise.resolve();
  }
}
