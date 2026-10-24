import { Logger } from '@nestjs/common';
import type { SmsProvider } from './sms.provider';

export interface HttpSmsOptions {
  url: string;
  apiKey?: string;
  senderId?: string;
  /** Injectable for tests. */
  fetchFn?: typeof fetch;
}

/**
 * Generic JSON gateway: POST { to, message, sender_id } with `Authorization: Bearer <key>`.
 * Adapt the body here once the Bangladeshi gateway is chosen; the rest of the app only sees SmsProvider.
 */
export class HttpSmsProvider implements SmsProvider {
  private readonly logger = new Logger('Sms');

  constructor(private readonly options: HttpSmsOptions) {}

  async send(to: string, message: string): Promise<void> {
    const doFetch = this.options.fetchFn ?? fetch;
    const res = await doFetch(this.options.url, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        ...(this.options.apiKey ? { authorization: `Bearer ${this.options.apiKey}` } : {}),
      },
      body: JSON.stringify({ to, message, sender_id: this.options.senderId }),
      signal: AbortSignal.timeout(8000),
    });
    if (!res.ok) {
      this.logger.error(`SMS gateway answered ${res.status}`);
      throw new Error(`SMS gateway error ${res.status}`);
    }
  }
}
