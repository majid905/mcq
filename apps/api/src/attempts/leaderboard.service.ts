import { Injectable } from '@nestjs/common';
import type { users } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { RedisService } from '../redis/redis.service';
import { lbDistrictKey, lbKey } from './scoring.service';

export interface LeaderboardRowDto {
  rank: number;
  user_id: string;
  name: string;
  avatar_url: string | null;
  district: string | null;
  score: number;
  time_taken_sec: number;
}

export interface LeaderboardDto {
  is_final: boolean;
  participants: number;
  top: LeaderboardRowDto[];
  me?: LeaderboardRowDto;
}

const TOP = 100;
/** The top-100 body is shared by everyone looking at the same board, so it is built once per 5 s. */
const CACHE_SEC = 5;
export const topCacheKey = (examId: bigint | string, scope: string, locale: string) =>
  `lb:${examId}:top:${scope}:${locale}`;

@Injectable()
export class LeaderboardService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
  ) {}

  /** FR-RES-06: top 100 plus my own row, provisional until merit is published. */
  async get(
    user: Pick<users, 'id' | 'locale'>,
    examId: bigint,
    isFinal: boolean,
    scope: 'overall' | 'district',
  ): Promise<LeaderboardDto> {
    let districtId: number | null = null;
    if (scope === 'district') {
      const mine = await this.prisma.attempts.findFirst({
        where: { exam_id: examId, user_id: user.id, kind: 'live' },
        select: { district_id: true },
      });
      districtId = mine?.district_id ?? null;
      if (districtId === null) {
        return { is_final: isFinal, participants: 0, top: [] };
      }
    }
    const key = scope === 'overall' ? lbKey(examId) : lbDistrictKey(examId, String(districtId));
    const participants = await this.redis.client.zcard(key);
    const top = await this.topRows(examId, key, scope, user.locale, 0, TOP - 1);

    const idx = await this.redis.client.zrevrank(key, String(user.id));
    let me: LeaderboardRowDto | undefined = top.find((r) => r.user_id === String(user.id));
    if (!me && idx !== null) {
      me = (await this.rows(examId, [String(user.id)], user.locale, idx + 1))[0];
    }
    return { is_final: isFinal, participants, top, ...(me ? { me } : {}) };
  }

  private async topRows(
    examId: bigint,
    key: string,
    scope: string,
    locale: string,
    from: number,
    to: number,
  ): Promise<LeaderboardRowDto[]> {
    const cacheKey = topCacheKey(examId, `${scope}:${key}`, locale);
    const cached = await this.redis.client.get(cacheKey);
    if (cached) return JSON.parse(cached) as LeaderboardRowDto[];
    const members = await this.redis.client.zrevrange(key, from, to);
    const rows = await this.rows(examId, members, locale, from + 1);
    await this.redis.client.set(cacheKey, JSON.stringify(rows), 'EX', CACHE_SEC);
    return rows;
  }

  /** Rows for consecutive ranks starting at `firstRank`, in the order of `members`. */
  private async rows(
    examId: bigint,
    members: string[],
    locale: string,
    firstRank: number,
  ): Promise<LeaderboardRowDto[]> {
    if (members.length === 0) return [];
    const ids = members.map((m) => BigInt(m));
    const [attempts, people] = await Promise.all([
      this.prisma.attempts.findMany({
        where: { exam_id: examId, kind: 'live', user_id: { in: ids } },
        select: { user_id: true, score: true, time_taken_sec: true, district_id: true },
      }),
      this.prisma.users.findMany({
        where: { id: { in: ids } },
        select: { id: true, name: true, avatar_url: true },
      }),
    ]);
    const districtIds = [...new Set(attempts.flatMap((a) => a.district_id ?? []))];
    const districts = await this.prisma.districts.findMany({ where: { id: { in: districtIds } } });
    const districtName = new Map(
      districts.map((d) => [d.id, locale === 'en' ? d.name_en : d.name_bn]),
    );
    const attemptBy = new Map(attempts.map((a) => [a.user_id, a]));
    const personBy = new Map(people.map((p) => [p.id, p]));

    return members.flatMap((m, i) => {
      const id = BigInt(m);
      const a = attemptBy.get(id);
      const p = personBy.get(id);
      if (!a || !p) return [];
      return [
        {
          rank: firstRank + i,
          user_id: m,
          name: p.name,
          avatar_url: p.avatar_url,
          district: a.district_id === null ? null : (districtName.get(a.district_id) ?? null),
          score: Number(a.score ?? 0),
          time_taken_sec: a.time_taken_sec ?? 0,
        },
      ];
    });
  }
}
