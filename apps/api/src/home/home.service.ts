import { Injectable } from '@nestjs/common';
import type { users } from '@prisma/client';
import type { ExamCardDto } from '../exams/exam-card';
import { ExamCardsService } from '../exams/exam-cards.service';
import { dhakaDay } from '../me/me.service';
import { answersKey } from '../attempts/attempt-state';
import { PrismaService } from '../prisma/prisma.service';
import { RedisService } from '../redis/redis.service';
import { SettingsService } from '../settings/settings.service';

export interface HomeFeedDto {
  server_time: string;
  banners: { id: string; image_url: string; deep_link: string | null; title: string }[];
  running_exams: ExamCardDto[];
  next_exam: ExamCardDto | null;
  continue_practice: { attempt_id: string; title: string; answered: number; total: number } | null;
  today: { answered: number; accuracy_pct: number; streak: number; goal: number };
}

const toNumberIds = (v: unknown): number[] =>
  Array.isArray(v) ? v.map(Number).filter((n) => Number.isInteger(n) && n > 0) : [];

/** FR-HOME-01..03: one call for the home screen, filtered by the user's target exams. */
@Injectable()
export class HomeService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly settings: SettingsService,
    private readonly examCards: ExamCardsService,
    private readonly redis: RedisService,
  ) {}

  async feed(user: users): Promise<HomeFeedDto> {
    const now = new Date();
    const targets = toNumberIds(user.target_node_ids);
    const categoryFilter = targets.length > 0 ? { category_id: { in: targets } } : {};
    const live = { status: { in: ['scheduled', 'running'] as ('scheduled' | 'running')[] } };

    const [runningRows, nextRows, banners, daily, streak, practice, goal] = await Promise.all([
      this.prisma.exams.findMany({
        where: { ...live, ...categoryFilter, start_at: { lte: now }, end_at: { gt: now } },
        orderBy: { start_at: 'asc' },
        take: 5,
      }),
      this.prisma.exams.findMany({
        where: { ...live, ...categoryFilter, start_at: { gt: now } },
        orderBy: { start_at: 'asc' },
        take: 1,
      }),
      this.banners(now, targets),
      this.prisma.user_daily_stats.findUnique({
        where: { user_id_day: { user_id: user.id, day: new Date(`${dhakaDay(now)}T00:00:00Z`) } },
      }),
      this.prisma.user_streaks.findUnique({ where: { user_id: user.id } }),
      this.prisma.attempts.findFirst({
        where: {
          user_id: user.id,
          kind: { in: ['quick_practice', 'custom'] },
          status: 'in_progress',
        },
        orderBy: { started_at: 'desc' },
      }),
      this.settings.number('daily_goal', 10),
    ]);

    const examRows = [...runningRows, ...nextRows];
    const cards = await this.examCards.build(user, examRows, now);

    const answered = daily?.answered ?? 0;
    const yesterday = dhakaDay(new Date(now.getTime() - 24 * 3600_000));
    const lastDay = streak?.last_day?.toISOString().slice(0, 10);
    const streakNow = streak && lastDay && lastDay >= yesterday ? streak.current_streak : 0;

    // Answers of a running session live in Redis; the saved JSON is the fallback.
    const saved = practice?.answers;
    const practiceAnswered = practice
      ? (await this.redis.client.hlen(answersKey(practice.id))) ||
        (saved && typeof saved === 'object' ? Object.keys(saved).length : 0)
      : 0;
    return {
      server_time: now.toISOString(),
      banners,
      running_exams: runningRows.flatMap((e) => cards.get(e.id) ?? []),
      next_exam: nextRows[0] ? (cards.get(nextRows[0].id) ?? null) : null,
      continue_practice: practice
        ? {
            attempt_id: String(practice.id),
            title: user.locale === 'en' ? 'Continue practice' : 'অনুশীলন চালিয়ে যান',
            answered: practiceAnswered,
            total: practice.total_questions,
          }
        : null,
      today: {
        answered,
        accuracy_pct: answered > 0 ? Math.round(((daily?.correct ?? 0) / answered) * 1000) / 10 : 0,
        streak: streakNow,
        goal,
      },
    };
  }

  private async banners(now: Date, targets: number[]): Promise<HomeFeedDto['banners']> {
    const rows = await this.prisma.banners.findMany({
      where: {
        is_active: true,
        AND: [
          { OR: [{ starts_at: null }, { starts_at: { lte: now } }] },
          { OR: [{ ends_at: null }, { ends_at: { gt: now } }] },
        ],
      },
      orderBy: { sort_order: 'asc' },
    });
    return rows
      .filter((b) => {
        const cats = toNumberIds(b.category_ids);
        return cats.length === 0 || targets.length === 0 || cats.some((c) => targets.includes(c));
      })
      .map((b) => ({
        id: String(b.id),
        image_url: b.image_url,
        deep_link: b.deep_link,
        title: b.title,
      }));
  }
}
