import type { Connection, ResultSetHeader, RowDataPacket } from 'mysql2/promise';

const HOUR = 3_600_000;
const QUESTIONS_PER_EXAM = 30;

interface ExamDef {
  slug: string;
  category: string;
  titleBn: string;
  titleEn: string;
  /** ms relative to now */
  startOffset: number;
  windowHours: number;
  status: 'merit_published' | 'running' | 'scheduled';
  premium: boolean;
}

const defs: ExamDef[] = [
  {
    slug: 'bcs-live-model-test-11',
    category: 'bcs',
    titleBn: '৪৭তম বিসিএস লাইভ মডেল টেস্ট - ১১',
    titleEn: '47th BCS Live Model Test 11',
    startOffset: -72 * HOUR,
    windowHours: 2,
    status: 'merit_published',
    premium: false,
  },
  {
    slug: 'bank-live-test-05',
    category: 'bank',
    titleBn: 'ব্যাংক জব লাইভ পরীক্ষা - ০৫',
    titleEn: 'Bank Job Live Exam 05',
    startOffset: -0.5 * HOUR,
    windowHours: 4,
    status: 'running',
    premium: false,
  },
  {
    slug: 'bcs-live-model-test-12',
    category: 'bcs',
    titleBn: '৪৭তম বিসিএস লাইভ মডেল টেস্ট - ১২',
    titleEn: '47th BCS Live Model Test 12',
    startOffset: 24 * HOUR,
    windowHours: 2,
    status: 'scheduled',
    premium: false,
  },
  {
    slug: 'primary-live-test-03',
    category: 'primary',
    titleBn: 'প্রাথমিক শিক্ষক নিয়োগ লাইভ পরীক্ষা - ০৩',
    titleEn: 'Primary Teacher Live Exam 03',
    startOffset: 72 * HOUR,
    windowHours: 2,
    status: 'scheduled',
    premium: true,
  },
  {
    slug: 'ntrca-live-test-02',
    category: 'ntrca',
    titleBn: 'এনটিআরসিএ লাইভ পরীক্ষা - ০২',
    titleEn: 'NTRCA Live Exam 02',
    startOffset: 144 * HOUR,
    windowHours: 2,
    status: 'scheduled',
    premium: false,
  },
];

/** Inserts 5 live exams, each with a 30-question paper spread over the category's subjects. */
export async function seedExams(
  conn: Connection,
  categoryIdBySlug: Map<string, number>,
): Promise<number[]> {
  const now = Date.now();
  const ids: number[] = [];

  for (const [index, def] of defs.entries()) {
    const categoryId = categoryIdBySlug.get(def.category) as number;
    const [subjects] = await conn.query<RowDataPacket[]>(
      "SELECT id, name_bn, path FROM taxonomy_nodes WHERE parent_id = ? AND type = 'subject' ORDER BY sort_order",
      [categoryId],
    );
    const perSubject = Math.ceil(QUESTIONS_PER_EXAM / subjects.length);

    const paper: { id: number; sectionId: number }[] = [];
    const syllabus: { node_id: number; label: string; questions: number; marks: number }[] = [];
    for (const subject of subjects) {
      const [rows] = await conn.query<RowDataPacket[]>(
        `SELECT q.id FROM questions q JOIN taxonomy_nodes n ON n.id = q.primary_node_id
         WHERE n.path LIKE ? AND q.status = 'published' ORDER BY q.id LIMIT ? OFFSET ?`,
        [`${subject.path}%`, perSubject, index * 3],
      );
      const take = rows.slice(0, QUESTIONS_PER_EXAM - paper.length);
      for (const r of take) paper.push({ id: Number(r.id), sectionId: Number(subject.id) });
      syllabus.push({
        node_id: Number(subject.id),
        label: subject.name_bn as string,
        questions: take.length,
        marks: take.length,
      });
    }

    const start = new Date(now + def.startOffset);
    const end = new Date(start.getTime() + def.windowHours * HOUR);
    const publishAt = new Date(end.getTime() + 5 * 60_000);
    const [res] = await conn.execute<ResultSetHeader>(
      `INSERT INTO exams (type, category_id, title_bn, title_en, slug, description, syllabus, start_at, end_at,
         duration_sec, question_count, mark_per_question, negative_mark, total_marks, pass_marks, is_premium,
         result_publish_at, status, participant_count)
       VALUES ('live', ?, ?, ?, ?, ?, ?, ?, ?, 1800, ?, 1, 0.5, ?, ?, ?, ?, ?, 0)`,
      [
        categoryId,
        def.titleBn,
        def.titleEn,
        def.slug,
        'নমুনা লাইভ পরীক্ষা। প্রতিটি প্রশ্নের মান ১, ভুল উত্তরে ০.৫ নম্বর কাটা যাবে।',
        JSON.stringify(syllabus),
        start,
        end,
        paper.length,
        paper.length,
        Math.round(paper.length * 0.4),
        def.premium ? 1 : 0,
        publishAt,
        def.status,
      ],
    );
    const examId = res.insertId;
    ids.push(examId);

    await conn.query(
      'INSERT INTO exam_questions (exam_id, question_id, position, section_node_id) VALUES ?',
      [paper.map((p, i) => [examId, p.id, i + 1, p.sectionId])],
    );
  }
  return ids;
}
