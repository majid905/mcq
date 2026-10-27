import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  Post,
  Put,
  Query,
  Req,
  Res,
} from '@nestjs/common';
import type { Response } from 'express';
import { z } from 'zod';
import { ZodValidationPipe } from '../../common/zod-validation.pipe';
import {
  AdminApi,
  RequireAnyPermission,
  RequirePermission,
  type AdminRequest,
} from '../admin-auth.guard';
import type { Actor } from '../audit.service';
import { CatalogAdminService } from './catalog-admin.service';

const idList = z.array(z.string().regex(/^\d{1,10}$/)).max(200);
const when = z.iso.datetime().nullable().optional();

const listQuery = z.object({
  cursor: z.string().max(20).optional(),
  limit: z.coerce.number().int().min(1).max(100).default(20),
});
const packageBody = z.object({
  name_bn: z.string().min(1).max(150),
  name_en: z.string().min(1).max(150),
  description: z.string().max(5000).nullable().optional(),
  features: z.array(z.string().max(200)).max(30).optional(),
  category_ids: idList.nullable().optional(),
  duration_days: z.number().int().min(1).max(3650),
  price_bdt: z.number().min(0).max(1_000_000),
  compare_at_bdt: z.number().min(0).max(1_000_000).nullable().optional(),
  is_active: z.boolean().optional(),
  is_featured: z.boolean().optional(),
  sort_order: z.number().int().optional(),
});
const couponBody = z.object({
  code: z.string().regex(/^[A-Za-z0-9_-]{3,40}$/),
  type: z.enum(['percent', 'fixed']),
  value: z.number().min(0).max(1_000_000),
  max_discount_bdt: z.number().min(0).nullable().optional(),
  package_ids: idList.nullable().optional(),
  usage_limit: z.number().int().min(1).nullable().optional(),
  per_user_limit: z.number().int().min(1).max(1000).optional(),
  starts_at: when,
  ends_at: when,
  is_active: z.boolean().optional(),
});
const bannerBody = z.object({
  title: z.string().min(1).max(150),
  image_url: z.string().min(1).max(500),
  deep_link: z.string().max(300).nullable().optional(),
  category_ids: idList.nullable().optional(),
  starts_at: when,
  ends_at: when,
  sort_order: z.number().int().optional(),
  is_active: z.boolean().optional(),
});

type List = z.infer<typeof listQuery>;

@AdminApi()
@Controller('admin')
export class CatalogAdminController {
  constructor(private readonly catalog: CatalogAdminService) {}

  private actor(req: AdminRequest): Actor {
    return { admin: req.admin as NonNullable<AdminRequest['admin']>, ip: req.ip };
  }

  // ---- packages (accountant has packages.write only, so writers may read too)

  @RequireAnyPermission('packages.read', 'packages.write')
  @Get('packages')
  listPackages(@Query(new ZodValidationPipe(listQuery)) q: List) {
    return this.catalog.listPackages(q.cursor, q.limit);
  }

  @RequirePermission('packages.write')
  @Post('packages')
  async createPackage(
    @Body(new ZodValidationPipe(packageBody)) b: z.infer<typeof packageBody>,
    @Req() req: AdminRequest,
    @Res({ passthrough: true }) res: Response,
  ) {
    res.status(201);
    return this.catalog.createPackage(this.actor(req), b);
  }

  @RequirePermission('packages.write')
  @Put('packages/:id')
  updatePackage(
    @Param('id') id: string,
    @Body(new ZodValidationPipe(packageBody)) b: z.infer<typeof packageBody>,
    @Req() req: AdminRequest,
  ) {
    return this.catalog.updatePackage(this.actor(req), id, b);
  }

  @RequirePermission('packages.write')
  @Delete('packages/:id')
  @HttpCode(204)
  async deletePackage(@Param('id') id: string, @Req() req: AdminRequest): Promise<void> {
    await this.catalog.deletePackage(this.actor(req), id);
  }

  // ---- coupons

  @RequireAnyPermission('coupons.read', 'coupons.write')
  @Get('coupons')
  listCoupons(@Query(new ZodValidationPipe(listQuery)) q: List) {
    return this.catalog.listCoupons(q.cursor, q.limit);
  }

  @RequirePermission('coupons.write')
  @Post('coupons')
  async createCoupon(
    @Body(new ZodValidationPipe(couponBody)) b: z.infer<typeof couponBody>,
    @Req() req: AdminRequest,
    @Res({ passthrough: true }) res: Response,
  ) {
    res.status(201);
    return this.catalog.createCoupon(this.actor(req), b);
  }

  @RequirePermission('coupons.write')
  @Put('coupons/:id')
  updateCoupon(
    @Param('id') id: string,
    @Body(new ZodValidationPipe(couponBody)) b: z.infer<typeof couponBody>,
    @Req() req: AdminRequest,
  ) {
    return this.catalog.updateCoupon(this.actor(req), id, b);
  }

  @RequirePermission('coupons.write')
  @Delete('coupons/:id')
  @HttpCode(204)
  async deleteCoupon(@Param('id') id: string, @Req() req: AdminRequest): Promise<void> {
    await this.catalog.deleteCoupon(this.actor(req), id);
  }

  // ---- banners

  @RequireAnyPermission('banners.read', 'banners.write')
  @Get('banners')
  listBanners(@Query(new ZodValidationPipe(listQuery)) q: List) {
    return this.catalog.listBanners(q.cursor, q.limit);
  }

  @RequirePermission('banners.write')
  @Post('banners')
  async createBanner(
    @Body(new ZodValidationPipe(bannerBody)) b: z.infer<typeof bannerBody>,
    @Req() req: AdminRequest,
    @Res({ passthrough: true }) res: Response,
  ) {
    res.status(201);
    return this.catalog.createBanner(this.actor(req), b);
  }

  @RequirePermission('banners.write')
  @Put('banners/:id')
  updateBanner(
    @Param('id') id: string,
    @Body(new ZodValidationPipe(bannerBody)) b: z.infer<typeof bannerBody>,
    @Req() req: AdminRequest,
  ) {
    return this.catalog.updateBanner(this.actor(req), id, b);
  }

  @RequirePermission('banners.write')
  @Delete('banners/:id')
  @HttpCode(204)
  async deleteBanner(@Param('id') id: string, @Req() req: AdminRequest): Promise<void> {
    await this.catalog.deleteBanner(this.actor(req), id);
  }
}
