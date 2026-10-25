import { createSign } from 'node:crypto';
import { Logger } from '@nestjs/common';

export const PUSH_SENDER = Symbol('PUSH_SENDER');

export interface PushMessage {
  title: string;
  body: string;
  /** App deep link, e.g. /exams/12; clients route it with go_router / the web router. */
  deepLink?: string | null;
}

export type PushOutcome = 'sent' | 'invalid_token' | 'failed';

/** Sends one push. The notification inbox is the source of truth; a lost push is not an error. */
export interface PushSender {
  sendToToken(token: string, msg: PushMessage): Promise<PushOutcome>;
  /** FR-NOTI-01: category broadcasts go to a topic that clients subscribe to (cat_<id>, all). */
  sendToTopic(topic: string, msg: PushMessage): Promise<PushOutcome>;
}

/** Development driver: logs instead of sending. */
export class ConsolePushSender implements PushSender {
  private readonly logger = new Logger('Push');
  readonly sent: { target: string; msg: PushMessage }[] = [];

  sendToToken(token: string, msg: PushMessage): Promise<PushOutcome> {
    this.sent.push({ target: `token:${token}`, msg });
    this.logger.log(`push -> token ${token.slice(0, 8)}…: ${msg.title}`);
    return Promise.resolve('sent');
  }

  sendToTopic(topic: string, msg: PushMessage): Promise<PushOutcome> {
    this.sent.push({ target: `topic:${topic}`, msg });
    this.logger.log(`push -> topic ${topic}: ${msg.title}`);
    return Promise.resolve('sent');
  }
}

interface ServiceAccount {
  project_id: string;
  client_email: string;
  private_key: string;
}

const b64url = (v: string | Buffer) => Buffer.from(v).toString('base64url');

/** Firebase Cloud Messaging HTTP v1, authenticated with a service account (no SDK needed). */
export class FcmPushSender implements PushSender {
  private readonly logger = new Logger('Push');
  private readonly account: ServiceAccount;
  private cached: { token: string; expiresAt: number } | undefined;

  constructor(serviceAccountJson: string) {
    this.account = JSON.parse(serviceAccountJson) as ServiceAccount;
  }

  private async accessToken(): Promise<string> {
    const now = Math.floor(Date.now() / 1000);
    if (this.cached && this.cached.expiresAt - 60 > now) return this.cached.token;
    const head = b64url(JSON.stringify({ alg: 'RS256', typ: 'JWT' }));
    const claims = b64url(
      JSON.stringify({
        iss: this.account.client_email,
        scope: 'https://www.googleapis.com/auth/firebase.messaging',
        aud: 'https://oauth2.googleapis.com/token',
        iat: now,
        exp: now + 3600,
      }),
    );
    const sig = createSign('RSA-SHA256')
      .update(`${head}.${claims}`)
      .sign(this.account.private_key)
      .toString('base64url');
    const res = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
        assertion: `${head}.${claims}.${sig}`,
      }),
      signal: AbortSignal.timeout(10_000),
    });
    if (!res.ok) throw new Error(`FCM auth failed: ${res.status}`);
    const json = (await res.json()) as { access_token: string; expires_in: number };
    this.cached = { token: json.access_token, expiresAt: now + json.expires_in };
    return json.access_token;
  }

  private async send(target: { token: string } | { topic: string }, msg: PushMessage) {
    try {
      const res = await fetch(
        `https://fcm.googleapis.com/v1/projects/${this.account.project_id}/messages:send`,
        {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${await this.accessToken()}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            message: {
              ...target,
              notification: { title: msg.title, body: msg.body },
              data: msg.deepLink ? { deep_link: msg.deepLink } : {},
              android: { priority: 'HIGH' },
            },
          }),
          signal: AbortSignal.timeout(10_000),
        },
      );
      if (res.ok) return 'sent' as const;
      const text = await res.text();
      // The device uninstalled the app or the token expired: the caller drops the token.
      if (
        res.status === 404 ||
        text.includes('UNREGISTERED') ||
        text.includes('INVALID_ARGUMENT')
      ) {
        return 'invalid_token' as const;
      }
      this.logger.warn(`FCM ${res.status}: ${text.slice(0, 200)}`);
      return 'failed' as const;
    } catch (err) {
      this.logger.warn(`FCM send failed: ${(err as Error).message}`);
      return 'failed' as const;
    }
  }

  sendToToken(token: string, msg: PushMessage): Promise<PushOutcome> {
    return this.send({ token }, msg);
  }

  sendToTopic(topic: string, msg: PushMessage): Promise<PushOutcome> {
    return this.send({ topic }, msg);
  }
}
