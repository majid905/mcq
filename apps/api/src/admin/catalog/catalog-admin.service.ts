import { Injectable } from '@nestjs/common';
import { Prisma, type banners, type coupons, type packages } from '@prisma/client';
import { ApiException } from '../../common/api-exception';
import { parseId } from '../../common/ids';
import { Page } from '../../common/page';
import { idList, num } from '../../billing/billing.service';
import { PrismaService } from '../../prisma/prisma.service';
import { AuditService, type Actor } from '../audit.service';

const toIdJson = (ids: string[] | null | undefined) => (ids ? ids.map(Number) : Prisma.DbNull);
const iso = (d: Date | null) => d?.toISOString() ?? null;
const cursorOf = (c: string | undefined) => (c ? parseId(c) : null);

/** Newest first, cursor = last id. */
function pageOf<T extends { id: number | bigint }, D>(rows: T[], limit: number, map: (r: T) => D) {
  const hasMore = rows.length > limit;
  const items = hasMore ? rows.slice(0, limit) : rows;
  const last = items[items.length - 1];
  return new Page(items.map(map), {
    next_cursor: hasMore && last ? String(last.id) : null,
    has_more: hasMore,
  });
}

export interface PackageInput {
  name_bn: string;
  name_en: string;
  description?: string | null | undefined;
  features?: string[] | undefined;
  category_ids?: string[] | null | undefined;
  duration_days: number;
  price_bdt: number;
  compare_at_bdt?: number | null | undefined;
  is_active?: boolean | undefined;
  is_featured?: boolean | undefined;
  sort_order?: number | undefined;
}

export interface CouponInput {
  code: string;
  type: 'percent' | 'fixed';
  value: number;
  max_discount_bdt?: number | null | undefined;
  package_ids?: string[] | null | undefined;
  usage_limit?: number | null | undefined;
  per_user_limit?: number | undefined;
  starts_at?: string | null | undefined;
  ends_at?: string | null | undefined;
  is_active?: boolean | undefined;
}

export interface BannerInput {
  title: string;
  image_url: string;
  deep_link?: string | null | undefined;
  category_ids?: string[] | null | undefined;
  starts_at?: string | null | undefined;
  ends_at?: string | null | undefined;
  sort_order?: number | undefined;
  is_active?: boolean | undefined;
}

/** FR-ADM packages, coupons and banners (L11/L12): plain CRUD, each write audited. */
@Injectable()
export class CatalogAdminService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  // ------------------------------------------------------------------ packages

  private packageDto(p: packages, subscribers: number) {
    return {
      id: String(p.id),
      name_bn: p.name_bn,
      name_en: p.name_en,
      description: p.description,
      features: Array.isArray(p.features) ? p.features.map(String) : [],
      category_ids: idList(p.category_ids),
      duration_days: p.duration_days,
      price_bdt: num(p.price_bdt),
      compare_at_bdt: p.compare_at_bdt === null ? null : num(p.compare_at_bdt),
      is_active: p.is_active,
      is_featured: p.is_featured,
      sort_order: p.sort_order,
      subscribers_count: subscribers,
    };
  }

  private async subscriberCounts(ids: number[]): Promise<Map<number, number>> {
    if (ids.length === 0) return new Map();
    const rows = await this.prisma.subscriptions.groupBy({
      by: ['package_id'],
      where: { package_id: { in: ids } },
      _count: { _all: true },
    });
    return new Map(rows.map((r) => [r.package_id ?? 0, r._count._all]));
  }

  async listPackages(cursor: string | undefined, limit: number) {
    const before = cursorOf(cursor);
    const rows = await this.prisma.packages.findMany({
      where: before ? { id: { lt: Number(before) } } : {},
      orderBy: { id: 'desc' },
      take: limit + 1,
    });
    const counts = await this.subscriberCounts(rows.map((r) => r.id));
    return pageOf(rows, limit, (r) => this.packageDto(r, counts.get(r.id) ?? 0));
  }

  private packageData(i: PackageInput) {
    return {
      name_bn: i.name_bn,
      name_en: i.name_en,
      description: i.description ?? null,
      features: i.features ?? [],
      category_ids: toIdJson(i.category_ids),
      duration_days: i.duration_days,
      price_bdt: i.price_bdt,
      compare_at_bdt: i.compare_at_bdt ?? null,
      is_active: i.is_active ?? true,
      is_featured: i.is_featured ?? false,
      sort_order: i.sort_order ?? 0,
    };
  }

  async createPackage(actor: Actor, i: PackageInput) {
    const row = await this.prisma.packages.create({ data: this.packageData(i) });
    const dto = this.packageDto(row, 0);
    await this.audit.record(actor, {
      action: 'package.create',
      entityType: 'package',
      entityId: row.id,
      after: dto,
    });
    return dto;
  }

  async updatePackage(actor: Actor, rawId: string, i: PackageInput) {
    const id = Number(parseId(rawId));
    const before = await this.prisma.packages.findUnique({ where: { id } });
    if (!before) throw new ApiException('NOT_FOUND');
    const row = await this.prisma.packages.update({ where: { id }, data: this.packageData(i) });
    const counts = await this.subscriberCounts([id]);
    const dto = this.packageDto(row, counts.get(id) ?? 0);
    await this.audit.record(actor, {
      action: 'package.update',
      entityType: 'package',
      entityId: id,
      before: this.packageDto(before, counts.get(id) ?? 0),
      after: dto,
    });
    return dto;
  }

  /** Packages that were ever sold stay (payments and subscriptions point at them): deactivate instead. */
  async deletePackage(actor: Actor, rawId: string): Promise<void> {
    const id = Number(parseId(rawId));
    const before = await this.prisma.packages.findUnique({ where: { id } });
    if (!before) throw new ApiException('NOT_FOUND');
    const [payments, subs] = await Promise.all([
      this.prisma.payments.count({ where: { package_id: id } }),
      this.prisma.subscriptions.count({ where: { package_id: id } }),
    ]);
    if (payments + subs > 0) throw new ApiException('IN_USE', { payments, subscriptions: subs });
    await this.prisma.packages.delete({ where: { id } });
    await this.audit.record(actor, {
      action: 'package.delete',
      entityType: 'package',
      entityId: id,
      before: this.packageDto(before, 0),
    });
  }

  // ------------------------------------------------------------------ coupons

  private couponDto(c: coupons) {
    return {
      id: String(c.id),
      code: c.code,
      type: c.type,
      value: num(c.value),
      max_discount_bdt: c.max_discount_bdt === null ? null : num(c.max_discount_bdt),
      package_ids: idList(c.package_ids),
      usage_limit: c.usage_limit,
      per_user_limit: c.per_user_limit,
      used_count: c.used_count,
      starts_at: iso(c.starts_at),
      ends_at: iso(c.ends_at),
      is_active: c.is_active,
    };
  }

  async listCoupons(cursor: string | undefined, limit: number) {
    const before = cursorOf(cursor);
    const rows = await this.prisma.coupons.findMany({
      where: before ? { id: { lt: Number(before) } } : {},
      orderBy: { id: 'desc' },
      take: limit + 1,
    });
    return pageOf(rows, limit, (r) => this.couponDto(r));
  }

  private couponData(i: CouponInput) {
    if (i.type === 'percent' && i.value > 100) {
      throw new ApiException('VALIDATION_FAILED', { fields: { value: 'percent is at most 100' } });
    }
    if (i.starts_at && i.ends_at && new Date(i.starts_at) >= new Date(i.ends_at)) {
      throw new ApiException('VALIDATION_FAILED', {
        fields: { ends_at: 'must be after starts_at' },
      });
    }
    return {
      // Checkout looks codes up upper-case, so they are stored that way.
      code: i.code.trim().toUpperCase(),
      type: i.type,
      value: i.value,
      max_discount_bdt: i.max_discount_bdt ?? null,
      package_ids: toIdJson(i.package_ids),
      usage_limit: i.usage_limit ?? null,
      per_user_limit: i.per_user_limit ?? 1,
      starts_at: i.starts_at ? new Date(i.starts_at) : null,
      ends_at: i.ends_at ? new Date(i.ends_at) : null,
      is_active: i.is_active ?? true,
    };
  }

  async createCoupon(actor: Actor, i: CouponInput) {
    const data = this.couponData(i);
    if (await this.prisma.coupons.findUnique({ where: { code: data.code } })) {
      throw new ApiException('CONFLICT', { field: 'code' }, 'কুপন কোডটি আগে থেকেই আছে');
    }
    const row = await this.prisma.coupons.create({ data });
    await this.audit.record(actor, {
      action: 'coupon.create',
      entityType: 'coupon',
      entityId: row.id,
      after: this.couponDto(row),
    });
    return this.couponDto(row);
  }

  async updateCoupon(actor: Actor, rawId: string, i: CouponInput) {
    const id = Number(parseId(rawId));
    const before = await this.prisma.coupons.findUnique({ where: { id } });
    if (!before) throw new ApiException('NOT_FOUND');
    const data = this.couponData(i);
    const clash = await this.prisma.coupons.findUnique({ where: { code: data.code } });
    if (clash && clash.id !== id) {
      throw new ApiException('CONFLICT', { field: 'code' }, 'কুপন কোডটি আগে থেকেই আছে');
    }
    const row = await this.prisma.coupons.update({ where: { id }, data });
    await this.audit.record(actor, {
      action: 'coupon.update',
      entityType: 'coupon',
      entityId: id,
      before: this.couponDto(before),
      after: this.couponDto(row),
    });
    return this.couponDto(row);
  }

  async deleteCoupon(actor: Actor, rawId: string): Promise<void> {
    const id = Number(parseId(rawId));
    const before = await this.prisma.coupons.findUnique({ where: { id } });
    if (!before) throw new ApiException('NOT_FOUND');
    const used = await this.prisma.payments.count({ where: { coupon_id: id } });
    if (used > 0) throw new ApiException('IN_USE', { payments: used });
    await this.prisma.coupons.delete({ where: { id } });
    await this.audit.record(actor, {
      action: 'coupon.delete',
      entityType: 'coupon',
      entityId: id,
      before: this.couponDto(before),
    });
  }

  // ------------------------------------------------------------------ banners

  private bannerDto(b: banners) {
    return {
      id: String(b.id),
      title: b.title,
      image_url: b.image_url,
      deep_link: b.deep_link,
      category_ids: idList(b.category_ids),
      starts_at: iso(b.starts_at),
      ends_at: iso(b.ends_at),
      sort_order: b.sort_order,
      is_active: b.is_active,
    };
  }

  async listBanners(cursor: string | undefined, limit: number) {
    const before = cursorOf(cursor);
    const rows = await this.prisma.banners.findMany({
      where: before ? { id: { lt: Number(before) } } : {},
      orderBy: { id: 'desc' },
      take: limit + 1,
    });
    return pageOf(rows, limit, (r) => this.bannerDto(r));
  }

  private bannerData(i: BannerInput) {
    return {
      title: i.title,
      image_url: i.image_url,
      deep_link: i.deep_link ?? null,
      category_ids: toIdJson(i.category_ids),
      starts_at: i.starts_at ? new Date(i.starts_at) : null,
      ends_at: i.ends_at ? new Date(i.ends_at) : null,
      sort_order: i.sort_order ?? 0,
      is_active: i.is_active ?? true,
    };
  }

  async createBanner(actor: Actor, i: BannerInput) {
    const row = await this.prisma.banners.create({ data: this.bannerData(i) });
    await this.audit.record(actor, {
      action: 'banner.create',
      entityType: 'banner',
      entityId: row.id,
      after: this.bannerDto(row),
    });
    return this.bannerDto(row);
  }

  async updateBanner(actor: Actor, rawId: string, i: BannerInput) {
    const id = Number(parseId(rawId));
    const before = await this.prisma.banners.findUnique({ where: { id } });
    if (!before) throw new ApiException('NOT_FOUND');
    const row = await this.prisma.banners.update({ where: { id }, data: this.bannerData(i) });
    await this.audit.record(actor, {
      action: 'banner.update',
      entityType: 'banner',
      entityId: id,
      before: this.bannerDto(before),
      after: this.bannerDto(row),
    });
    return this.bannerDto(row);
  }

  async deleteBanner(actor: Actor, rawId: string): Promise<void> {
    const id = Number(parseId(rawId));
    const before = await this.prisma.banners.findUnique({ where: { id } });
    if (!before) throw new ApiException('NOT_FOUND');
    await this.prisma.banners.delete({ where: { id } });
    await this.audit.record(actor, {
      action: 'banner.delete',
      entityType: 'banner',
      entityId: id,
      before: this.bannerDto(before),
    });
  }
}
