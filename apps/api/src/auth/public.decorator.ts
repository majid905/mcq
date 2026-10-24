import { SetMetadata } from '@nestjs/common';

export const IS_PUBLIC = 'isPublic';

/** Marks a route that needs no access token (contract: `security: []`). Everything else is protected. */
export const Public = () => SetMetadata(IS_PUBLIC, true);
