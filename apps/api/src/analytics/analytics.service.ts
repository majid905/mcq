import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { TaxonomyService } from '../questions/taxonomy.service';
import { dayBefore, dhakaDayOf, isWeak } from '../stats/stats-logic';

const round1 = (n: number) => Math.round(n * 10) / 10;

@Injectable()
export class AnalyticsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly taxonomy: TaxonomyService,
  ) {}

  /** FR-ANL-01: headline numbers and the last 7 Dhaka days (missing days are zero). */
  async overview(userId: bigint) {
    const today = dhakaDayOf(new Date());
    const days = Array.from({ length: 7 }, (_, i) => {
      let d = today;
      for (let k = 0; k < 6 - i; k++) d = dayBefore(d);
      return d;
    });
    const [totals, percentile, streak, recent] = await Promise.all([
      this.prisma.user_daily_stats.aggregate({
        where: { user_id: userId },
        _sum: { answered: true, correct: true, exams: true },
      }),
      this.prisma.attempts.aggregate({
        where: { user_id: userId, kind: 'live', status: 'scored', percentile: { not: null } },
        _avg: { percentile: true },
      }),
      this.prisma.user_streaks.findUnique({ where: { user_id: userId } }),
      this.prisma.user_daily_stats.findMany({
        where: { user_id: userId, day: { gte: new Date(`${days[0]}T00:00:00Z`) } },
      }),
    ]);

    const answered = totals._sum.answered ?? 0;
    const lastDay = streak?.last_day?.toISOString().slice(0, 10);
    // A streak that missed yesterday and today is over, even if the row still says otherwise.
    const alive = lastDay !== undefined && lastDay >= dayBefore(today);
    const byDay = new Map(recent.map((r) => [r.day.toISOString().slice(0, 10), r]));
    return {
      answered_total: answered,
      accuracy_pct: answered > 0 ? round1(((totals._sum.correct ?? 0) / answered) * 100) : 0,
      exams_taken: totals._sum.exams ?? 0,
      avg_percentile:
        percentile._avg.percentile === null ? null : round1(Number(percentile._avg.percentile)),
      current_streak: alive ? (streak?.current_streak ?? 0) : 0,
      best_streak: streak?.best_streak ?? 0,
      last_7_days: days.map((day) => ({
        day,
        answered: byDay.get(day)?.answered ?? 0,
        correct: byDay.get(day)?.correct ?? 0,
      })),
    };
  }

  /** FR-ANL-02: accuracy per child topic (subtree totals), weak ones flagged. */
  async topics(userId: bigint, parentId: number | null) {
    const nodes = await this.taxonomy.children(parentId, userId);
    const stats = await this.taxonomy.subtreeStats(
      nodes.map((n) => Number(n.id)),
      userId,
    );
    return nodes.map((node) => {
      const s = stats.get(Number(node.id)) ?? { attempted: 0, correct: 0 };
      return {
        node,
        attempted: s.attempted,
        correct: s.correct,
        accuracy_pct: s.attempted > 0 ? round1((s.correct / s.attempted) * 100) : 0,
        is_weak: isWeak(s.attempted, s.correct),
      };
    });
  }

  /** FR-ANL-03: score and percentile of the last 30 live exams, oldest first for charting. */
  async progress(userId: bigint, locale: 'bn' | 'en') {
    const rows = await this.prisma.attempts.findMany({
      where: { user_id: userId, kind: 'live', status: 'scored' },
      orderBy: { started_at: 'desc' },
      take: 30,
      select: { exam_id: true, started_at: true, score: true, percentile: true },
    });
    const exams = await this.prisma.exams.findMany({
      where: { id: { in: rows.flatMap((r) => r.exam_id ?? []) } },
      select: { id: true, title_bn: true, title_en: true, total_marks: true },
    });
    const byId = new Map(exams.map((e) => [e.id, e]));
    return rows.reverse().flatMap((r) => {
      const e = r.exam_id === null ? undefined : byId.get(r.exam_id);
      if (!e || r.exam_id === null) return [];
      return [
        {
          exam_id: String(r.exam_id),
          title: locale === 'en' ? e.title_en : e.title_bn,
          date: r.started_at.toISOString(),
          score: Number(r.score ?? 0),
          total_marks: Number(e.total_marks),
          percentile: Number(r.percentile ?? 0),
        },
      ];
    });
  }
}
