import { Injectable, Logger } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { RedisService } from '../redis/redis.service';
import { percentile } from './scoring';
import { lbDistrictKey, lbKey } from './scoring.service';

export interface MeritRow {
  userId: bigint;
  /** Higher is better. */
  value: number;
  submittedMs: number;
}

/**
 * Final order: composite value (score, then less time), then earlier submission (FR-RES-06).
 * Ranks are unique and 1-based.
 */
export function orderMerit(rows: MeritRow[]): MeritRow[] {
  return [...rows].sort(
    (a, b) => b.value - a.value || a.submittedMs - b.submittedMs || Number(a.userId - b.userId),
  );
}

const CHUNK = 500;

/** Writes rank, district rank and percentile onto the attempts of one exam (T+5 min job). */
@Injectable()
export class MeritService {
  private readonly logger = new Logger(MeritService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
  ) {}

  /** Number of ranked attempts that are still waiting to be scored or auto-submitted. */
  pending(examId: bigint): Promise<number> {
    return this.prisma.attempts.count({
      where: { exam_id: examId, kind: 'live', status: { in: ['in_progress', 'submitted'] } },
    });
  }

  async publish(examId: bigint): Promise<number> {
    const attempts = await this.prisma.attempts.findMany({
      where: { exam_id: examId, kind: 'live', status: 'scored' },
      select: {
        id: true,
        user_id: true,
        started_at: true,
        submitted_at: true,
        district_id: true,
        score: true,
        time_taken_sec: true,
      },
    });
    const exam = await this.prisma.exams.findUniqueOrThrow({
      where: { id: examId },
      select: { duration_sec: true },
    });
    const byUser = new Map(attempts.map((a) => [a.user_id, a]));
    const ordered = orderMerit(
      attempts.map((a) => ({
        userId: a.user_id,
        value:
          Number(a.score ?? 0) * 1e7 + Math.max(0, exam.duration_sec - (a.time_taken_sec ?? 0)),
        submittedMs: a.submitted_at?.getTime() ?? 0,
      })),
    );
    const participants = ordered.length;

    // District order follows the overall order, so one pass counts district ranks.
    const districtCount = new Map<number, number>();
    const rows = ordered.map((m, i) => {
      const a = byUser.get(m.userId);
      if (!a) throw new Error('unreachable: merit row without attempt');
      let districtRank: number | null = null;
      if (a.district_id !== null) {
        districtRank = (districtCount.get(a.district_id) ?? 0) + 1;
        districtCount.set(a.district_id, districtRank);
      }
      return { a, rank: i + 1, districtRank, percentile: percentile(i + 1, participants) };
    });

    for (let i = 0; i < rows.length; i += CHUNK) {
      const chunk = rows.slice(i, i + CHUNK);
      await this.prisma.$transaction(
        chunk.map((r) =>
          this.prisma.$executeRaw(Prisma.sql`
          UPDATE attempts
          SET rank_overall = ${r.rank}, rank_district = ${r.districtRank}, percentile = ${r.percentile}
          WHERE id = ${r.a.id} AND started_at = ${r.a.started_at} AND exam_id = ${examId}`),
        ),
      );
    }

    // Rebuild the ZSETs from the final order so the board and the stored ranks agree exactly.
    const pipe = this.redis.client.pipeline().del(lbKey(examId));
    const districts = new Set<number>();
    for (const r of rows) if (r.a.district_id !== null) districts.add(r.a.district_id);
    for (const d of districts) pipe.del(lbDistrictKey(examId, String(d)));
    for (const [i, m] of ordered.entries()) {
      const a = byUser.get(m.userId);
      // Unique, strictly decreasing values keep the order stable for ZREVRANGE.
      const value = participants - i;
      pipe.zadd(lbKey(examId), value, String(m.userId));
      if (a?.district_id != null) {
        pipe.zadd(lbDistrictKey(examId, String(a.district_id)), value, String(m.userId));
      }
    }
    const ttl = 30 * 86_400;
    pipe.expire(lbKey(examId), ttl);
    for (const d of districts) pipe.expire(lbDistrictKey(examId, String(d)), ttl);
    await pipe.exec();

    await this.prisma.exams.update({ where: { id: examId }, data: { status: 'merit_published' } });
    this.logger.log(`merit published exam=${examId} participants=${participants}`);
    return participants;
  }
}
