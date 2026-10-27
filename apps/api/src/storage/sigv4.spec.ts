import { presignUrl } from './sigv4';

describe('presignUrl', () => {
  // The worked example from the AWS S3 documentation ("Authenticating Requests: Using Query Parameters").
  it('matches the AWS documented signature', () => {
    const url = presignUrl({
      method: 'GET',
      host: 'examplebucket.s3.amazonaws.com',
      path: '/test.txt',
      region: 'us-east-1',
      accessKeyId: 'AKIAIOSFODNN7EXAMPLE',
      secretAccessKey: 'wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY',
      expiresSec: 86400,
      now: new Date('2013-05-24T00:00:00Z'),
    });
    expect(url).toContain(
      'X-Amz-Signature=aeeed9bbccd4d02ee5c0109b86d86835f995330da4c265957d157751f604d404',
    );
    expect(url).toContain(
      'X-Amz-Credential=AKIAIOSFODNN7EXAMPLE%2F20130524%2Fus-east-1%2Fs3%2Faws4_request',
    );
  });

  it('signs extra headers and encodes awkward keys', () => {
    const base = {
      method: 'PUT' as const,
      host: 'acc.r2.cloudflarestorage.com',
      path: '/bucket/images/2026/a b+c.png',
      region: 'auto',
      accessKeyId: 'ak',
      secretAccessKey: 'sk',
      expiresSec: 600,
      now: new Date('2026-10-27T00:00:00Z'),
    };
    const plain = presignUrl(base);
    const typed = presignUrl({ ...base, signedHeaders: { 'content-type': 'image/png' } });
    expect(plain).toContain('/bucket/images/2026/a%20b%2Bc.png?');
    expect(typed).toContain('X-Amz-SignedHeaders=content-type%3Bhost');
    expect(typed).not.toBe(plain);
  });
});
