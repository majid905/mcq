/** Sends one SMS. Drivers: `console` (dev) and `http` (generic Bangladeshi gateway). */
export interface SmsProvider {
  send(to: string, message: string): Promise<void>;
}

export const SMS_PROVIDER = Symbol('SMS_PROVIDER');
