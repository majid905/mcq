import { Injectable } from '@nestjs/common';
import type { exams, users } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { effectiveStatus, toExamCard, type ExamCardDto } from './exam-card';

/** Builds `ExamCard`s in three batched queries (categories, attempts, reminders), not per exam. */
@Injectable()
export class ExamCardsService {
  constructor(private readonly prisma: PrismaService) {}

  async build(
    user: Pick<users, 'id' | 'locale'>,
    rows: exams[],
    now: Date,
  ): Promise<Map<bigint, ExamCardDto>> {
    const out = new Map<bigint, ExamCardDto>();
    if (rows.length === 0) return out;
    const ids = rows.map((e) => e.id);

    const [categories, attempts, reminders] = await Promise.all([
      this.prisma.taxonomy_nodes.findMany({
        where: { id: { in: [...new Set(rows.map((e) => e.category_id))] } },
        select: { id: true, name_bn: true, name_en: true },
      }),
      this.prisma.attempts.findMany({
        where: { user_id: user.id, exam_id: { in: ids } },
        orderBy: { started_at: 'desc' },
      }),
      this.prisma.exam_reminders.findMany({ where: { user_id: user.id, exam_id: { in: ids } } }),
    ]);
    const categoryName = new Map(
      categories.map((c) => [c.id, user.locale === 'en' ? c.name_en : c.name_bn]),
    );
    // The ranked attempt wins over a later practice attempt on the same exam.
    const latest = new Map<bigint, (typeof attempts)[number]>();
    for (const a of attempts) {
      if (a.exam_id === null) continue;
      const cur = latest.get(a.exam_id);
      if (!cur || (cur.kind !== 'live' && a.kind === 'live')) latest.set(a.exam_id, a);
    }
    const reminded = new Set(reminders.map((r) => r.exam_id));

    for (const e of rows) {
      if (!effectiveStatus(e, now)) continue;
      const a = latest.get(e.id);
      const card = toExamCard(e, {
        locale: user.locale,
        categoryName: categoryName.get(e.category_id) ?? '',
        myAttempt: a
          ? {
              attempt_id: String(a.id),
              status: a.status,
              score: a.score === null ? null : Number(a.score),
            }
          : null,
        hasReminder: reminded.has(e.id),
        now,
      });
      if (card) out.set(e.id, card);
    }
    return out;
  }
}
