import {
  Body,
  Controller,
  Get,
  HttpCode,
  Inject,
  Param,
  Post,
  Put,
  Query,
  Req,
  Res,
} from '@nestjs/common';
import type { Request, Response } from 'express';
import { z } from 'zod';
import { Public } from '../../auth/public.decorator';
import { ApiException } from '../../common/api-exception';
import { ZodValidationPipe } from '../../common/zod-validation.pipe';
import { SkipGate } from '../../gate/skip-gate.decorator';
import {
  FILE_STORE,
  isPublicKey,
  isSafeKey,
  LocalFileStore,
  type FileStore,
} from '../../storage/file-store';
import { AdminApi, RequireAnyPermission, type AdminRequest } from '../admin-auth.guard';
import { maxBytesFor, UploadsService } from './uploads.service';

const signBody = z.object({
  file_name: z.string().min(1).max(200),
  content_type: z.string().min(3).max(120),
  purpose: z.enum(['question_image', 'import_file', 'banner']),
});
const signedQuery = z.object({
  exp: z.coerce.number().int(),
  sig: z.string().min(10).max(200),
});

const joinKey = (raw: string | string[]) => (Array.isArray(raw) ? raw.join('/') : raw);
const IMAGE_MIME: Record<string, string> = {
  png: 'image/png',
  jpg: 'image/jpeg',
  webp: 'image/webp',
  gif: 'image/gif',
};

@AdminApi()
@Controller('admin/uploads')
export class UploadsController {
  constructor(private readonly uploads: UploadsService) {}

  @RequireAnyPermission('questions.write', 'questions.import', 'banners.write')
  @Post()
  async sign(
    @Body(new ZodValidationPipe(signBody)) b: z.infer<typeof signBody>,
    @Req() req: AdminRequest,
    @Res({ passthrough: true }) res: Response,
  ) {
    res.status(201);
    return this.uploads.sign(
      { admin: req.admin as NonNullable<AdminRequest['admin']>, ip: req.ip },
      b.purpose,
      b.file_name,
      b.content_type,
    );
  }
}

/**
 * Storage endpoints used only when R2 is not configured: the signed upload target, the signed
 * download of private files, and the public image URLs. With R2 these answer 404.
 */
@Controller()
export class LocalStorageController {
  constructor(@Inject(FILE_STORE) private readonly store: FileStore) {}

  private local(): LocalFileStore {
    if (!(this.store instanceof LocalFileStore)) throw new ApiException('NOT_FOUND');
    return this.store;
  }

  @Public()
  @SkipGate()
  @Put('admin/uploads/local/*key')
  @HttpCode(204)
  async put(
    @Param('key') raw: string | string[],
    @Query(new ZodValidationPipe(signedQuery)) q: z.infer<typeof signedQuery>,
    @Req() req: Request,
  ): Promise<void> {
    const store = this.local();
    const key = joinKey(raw);
    if (!isSafeKey(key) || !store.verify('PUT', key, q.exp, q.sig)) {
      throw new ApiException('FORBIDDEN');
    }
    try {
      await store.writeStream(key, req, maxBytesFor(key));
    } catch (err) {
      throw new ApiException('VALIDATION_FAILED', { fields: { file: (err as Error).message } });
    }
  }

  @Public()
  @SkipGate()
  @Get('admin/uploads/local/*key')
  async download(
    @Param('key') raw: string | string[],
    @Query(new ZodValidationPipe(signedQuery)) q: z.infer<typeof signedQuery>,
    @Res() res: Response,
  ): Promise<void> {
    const store = this.local();
    const key = joinKey(raw);
    if (!isSafeKey(key) || !store.verify('GET', key, q.exp, q.sig)) {
      throw new ApiException('FORBIDDEN');
    }
    const body = await store.read(key, maxBytesFor(key)).catch(() => {
      throw new ApiException('NOT_FOUND');
    });
    res.set({
      'Content-Type': 'application/octet-stream',
      'Content-Disposition': `attachment; filename="${key.split('/').pop() ?? 'file'}"`,
      'X-Content-Type-Options': 'nosniff',
    });
    res.send(body);
  }

  @Public()
  @SkipGate()
  @Get('files/*key')
  async file(@Param('key') raw: string | string[], @Res() res: Response): Promise<void> {
    const store = this.local();
    const key = joinKey(raw);
    const type = IMAGE_MIME[key.split('.').pop()?.toLowerCase() ?? ''];
    if (!isSafeKey(key) || !isPublicKey(key) || !type) throw new ApiException('NOT_FOUND');
    const body = await store.read(key, maxBytesFor(key)).catch(() => {
      throw new ApiException('NOT_FOUND');
    });
    res.set({
      'Content-Type': type,
      'Cache-Control': 'public, max-age=31536000, immutable',
      'X-Content-Type-Options': 'nosniff',
    });
    res.send(body);
  }
}
