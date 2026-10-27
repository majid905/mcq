import { Inject, Injectable } from '@nestjs/common';
import { ulid } from '../../billing/ulid';
import { ApiException } from '../../common/api-exception';
import { FILE_STORE, type FileStore } from '../../storage/file-store';
import { assertPermission } from '../admin-auth.guard';
import type { Actor } from '../audit.service';

export type UploadPurpose = 'question_image' | 'import_file' | 'banner';

const IMAGE_TYPES: Record<string, string> = {
  'image/png': 'png',
  'image/jpeg': 'jpg',
  'image/webp': 'webp',
  'image/gif': 'gif',
};
const IMPORT_TYPES: Record<string, string> = {
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': 'xlsx',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document': 'docx',
  'text/csv': 'csv',
  'application/csv': 'csv',
  'application/vnd.ms-excel': 'csv', // browsers label .csv this way on Windows
};

export const MAX_IMAGE_BYTES = 5 * 1024 * 1024;
export const MAX_IMPORT_BYTES = 50 * 1024 * 1024;
export const maxBytesFor = (key: string): number =>
  key.startsWith('imports/') ? MAX_IMPORT_BYTES : MAX_IMAGE_BYTES;

const PERMISSION: Record<UploadPurpose, string> = {
  question_image: 'questions.write',
  banner: 'banners.write',
  import_file: 'questions.import',
};
const TTL_SEC = 600;

/** `upload://<key>` is how a private upload is referred to in API calls (never a fetchable URL). */
export const uploadRef = (key: string) => `upload://${key}`;
export const keyOfRef = (ref: string): string | null =>
  ref.startsWith('upload://') ? ref.slice('upload://'.length) : null;

const safeName = (n: string) =>
  n
    .normalize('NFKD')
    .replace(/[^A-Za-z0-9._-]+/g, '_')
    .replace(/^[._-]+/, '')
    .slice(-60);

/** FR-ADM-05/07: signed upload targets for images and import files. */
@Injectable()
export class UploadsService {
  constructor(@Inject(FILE_STORE) private readonly store: FileStore) {}

  sign(actor: Actor, purpose: UploadPurpose, fileName: string, contentType: string) {
    assertPermission(actor.admin, PERMISSION[purpose]);
    const type = contentType.toLowerCase().split(';')[0]?.trim() ?? '';
    const table = purpose === 'import_file' ? IMPORT_TYPES : IMAGE_TYPES;
    const ext = table[type];
    if (!ext) {
      throw new ApiException('VALIDATION_FAILED', {
        fields: { content_type: `not allowed for ${purpose}` },
      });
    }
    const year = new Date().getUTCFullYear();
    const stem = safeName(fileName.replace(/\.[^.]+$/, '')) || 'file';
    const key =
      purpose === 'import_file'
        ? `imports/${actor.admin.id}/${ulid()}-${stem}.${ext}`
        : `${purpose === 'banner' ? 'banners' : 'images'}/${year}/${ulid()}.${ext}`;
    const signed = this.store.presignPut(key, type, TTL_SEC);
    return {
      upload_url: signed.uploadUrl,
      public_url: this.store.publicUrl(key) ?? uploadRef(key),
      headers: signed.headers,
      expires_in: TTL_SEC,
    };
  }
}
