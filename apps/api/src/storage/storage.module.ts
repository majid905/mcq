import { Global, Module } from '@nestjs/common';
import { APP_CONFIG, type AppConfig } from '../config/env';
import { FILE_STORE, LocalFileStore, R2FileStore, type FileStore } from './file-store';

/** R2 when its four credentials are set, otherwise a folder on this server. */
@Global()
@Module({
  providers: [
    {
      provide: FILE_STORE,
      inject: [APP_CONFIG],
      useFactory: (config: AppConfig): FileStore =>
        config.R2_ACCOUNT_ID &&
        config.R2_ACCESS_KEY_ID &&
        config.R2_SECRET_ACCESS_KEY &&
        config.R2_BUCKET
          ? new R2FileStore({
              accountId: config.R2_ACCOUNT_ID,
              accessKeyId: config.R2_ACCESS_KEY_ID,
              secretAccessKey: config.R2_SECRET_ACCESS_KEY,
              bucket: config.R2_BUCKET,
              publicBaseUrl: config.R2_PUBLIC_BASE_URL,
            })
          : new LocalFileStore({
              dir: config.UPLOAD_DIR,
              apiBaseUrl: config.PUBLIC_API_URL,
              secret: config.JWT_ACCESS_SECRET,
            }),
    },
  ],
  exports: [FILE_STORE],
})
export class StorageModule {}
