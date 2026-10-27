import { createHash, createHmac } from 'node:crypto';

export interface PresignInput {
  method: 'GET' | 'PUT';
  host: string;
  /** Path as it appears in the URL, already starting with "/". Segments are encoded here. */
  path: string;
  region: string;
  service?: string;
  accessKeyId: string;
  secretAccessKey: string;
  expiresSec: number;
  now?: Date;
  /** Extra headers that must be sent by the caller and are therefore signed (lower-case names). */
  signedHeaders?: Record<string, string>;
}

const sha256Hex = (s: string) => createHash('sha256').update(s).digest('hex');
const hmac = (key: string | Buffer, data: string) =>
  createHmac('sha256', key).update(data).digest();
const encode = (s: string) =>
  encodeURIComponent(s).replace(
    /[!'()*]/g,
    (c) => `%${c.charCodeAt(0).toString(16).toUpperCase()}`,
  );

/**
 * AWS Signature V4, query-string form (a "presigned URL"). Works for S3 and Cloudflare R2. The payload
 * is not signed (UNSIGNED-PAYLOAD) so the browser can upload any body.
 */
export function presignUrl(i: PresignInput): string {
  const now = i.now ?? new Date();
  const amzDate = now
    .toISOString()
    .replace(/[-:]/g, '')
    .replace(/\.\d{3}/, '');
  const day = amzDate.slice(0, 8);
  const service = i.service ?? 's3';
  const scope = `${day}/${i.region}/${service}/aws4_request`;

  const headers: Record<string, string> = { host: i.host, ...(i.signedHeaders ?? {}) };
  const names = Object.keys(headers).sort();
  const canonicalHeaders = names.map((n) => `${n}:${(headers[n] as string).trim()}\n`).join('');
  const signedHeaders = names.join(';');

  const query: [string, string][] = [
    ['X-Amz-Algorithm', 'AWS4-HMAC-SHA256'],
    ['X-Amz-Credential', `${i.accessKeyId}/${scope}`],
    ['X-Amz-Date', amzDate],
    ['X-Amz-Expires', String(i.expiresSec)],
    ['X-Amz-SignedHeaders', signedHeaders],
  ];
  query.sort(([a], [b]) => (a < b ? -1 : 1));
  const canonicalQuery = query.map(([k, v]) => `${encode(k)}=${encode(v)}`).join('&');
  const canonicalPath = i.path
    .split('/')
    .map((seg) => encode(seg))
    .join('/');

  const canonicalRequest = [
    i.method,
    canonicalPath,
    canonicalQuery,
    canonicalHeaders,
    signedHeaders,
    'UNSIGNED-PAYLOAD',
  ].join('\n');
  const stringToSign = ['AWS4-HMAC-SHA256', amzDate, scope, sha256Hex(canonicalRequest)].join('\n');
  const kDate = hmac(`AWS4${i.secretAccessKey}`, day);
  const kSigning = hmac(hmac(hmac(kDate, i.region), service), 'aws4_request');
  const signature = createHmac('sha256', kSigning).update(stringToSign).digest('hex');
  return `https://${i.host}${canonicalPath}?${canonicalQuery}&X-Amz-Signature=${signature}`;
}
