export const OBJECT_STORAGE = Symbol('OBJECT_STORAGE');

/**
 * Where immutable public files (paper JSON) are published. A Cloudflare R2 driver replaces the
 * no-op once the bucket and CDN host exist; clients fall back to `GET /exams/{id}/paper`.
 */
export interface ObjectStorage {
  /** Returns the public CDN URL of the stored object, or null when nothing is published. */
  put(key: string, body: string, contentType: string): Promise<string | null>;
}

export class NoopObjectStorage implements ObjectStorage {
  put(): Promise<string | null> {
    return Promise.resolve(null);
  }
}
