import { hash } from '@node-rs/argon2';
import type { Connection, ResultSetHeader, RowDataPacket } from 'mysql2/promise';
import { districts } from './data/districts';
import { categories, subjectLibrary, type SubjectKind } from './data/taxonomy';
import { seedExams } from './exams';
import { generateQuestions, type TopicRef } from './questions';

export const QUESTION_COUNT = 2000;

interface TopicInfo extends TopicRef {
  categoryId: number;
  subjectId: number;
  /** ids from category down to the topic itself */
  ancestry: number[];
}

const BATCH = 500;
const json = (v: unknown) => JSON.stringify(v);

async function insertBatches(
  conn: Connection,
  sql: string,
  rows: unknown[][],
  size = BATCH,
): Promise<void> {
  for (let i = 0; i < rows.length; i += size) {
    await conn.query(sql, [rows.slice(i, i + size)]);
  }
}

export async function seed(conn: Connection): Promise<void> {
  const [existing] = await conn.query<RowDataPacket[]>('SELECT COUNT(*) AS n FROM districts');
  if (Number(existing[0]?.n) > 0) {
    throw new Error('Database already seeded. Run `pnpm db:reset` to start from scratch.');
  }

  // ---- districts
  await insertBatches(
    conn,
    'INSERT INTO districts (id, name_bn, name_en, division) VALUES ?',
    districts.map((d) => [d.id, d.nameBn, d.nameEn, d.division]),
  );

  // ---- taxonomy (categories first so they get ids 1..5)
  const topics: TopicInfo[] = [];
  const nodeParent = new Map<number, number | null>();
  const nodeSubject = new Map<number, string>();

  async function insertNode(
    parentId: number | null,
    parentPath: string,
    type: 'category' | 'subject' | 'chapter' | 'topic',
    depth: number,
    def: { bn: string; en: string; slug: string },
    sortOrder: number,
    icon: string | null,
  ): Promise<{ id: number; path: string }> {
    const [res] = await conn.execute<ResultSetHeader>(
      `INSERT INTO taxonomy_nodes (parent_id, type, name_bn, name_en, slug, path, depth, sort_order, icon)
       VALUES (?, ?, ?, ?, ?, '/', ?, ?, ?)`,
      [parentId, type, def.bn, def.en, def.slug, depth, sortOrder, icon],
    );
    const id = res.insertId;
    const path = `${parentPath}${id}/`;
    await conn.execute('UPDATE taxonomy_nodes SET path = ? WHERE id = ?', [path, id]);
    nodeParent.set(id, parentId);
    return { id, path };
  }

  const categoryNodes: { id: number; path: string; subjects: SubjectKind[] }[] = [];
  for (const [i, c] of categories.entries()) {
    const node = await insertNode(null, '/', 'category', 0, c, i + 1, c.icon);
    categoryNodes.push({ ...node, subjects: c.subjects });
  }
  for (const cat of categoryNodes) {
    for (const [si, kind] of cat.subjects.entries()) {
      const sDef = subjectLibrary[kind];
      const subject = await insertNode(cat.id, cat.path, 'subject', 1, sDef, si + 1, null);
      nodeSubject.set(subject.id, kind);
      for (const [ci, chDef] of sDef.chapters.entries()) {
        const chapter = await insertNode(
          subject.id,
          subject.path,
          'chapter',
          2,
          chDef,
          ci + 1,
          null,
        );
        for (const [ti, tDef] of chDef.topics.entries()) {
          const topic = await insertNode(chapter.id, chapter.path, 'topic', 3, tDef, ti + 1, null);
          topics.push({
            id: topic.id,
            nameBn: tDef.bn,
            kind,
            categoryId: cat.id,
            subjectId: subject.id,
            ancestry: [cat.id, subject.id, chapter.id, topic.id],
          });
        }
      }
    }
  }
  const topicById = new Map(topics.map((t) => [t.id, t]));

  // ---- source exams (previous-year papers), two per category
  const sourceDefs: [slug: string, bn: string, en: string, year: number][] = [
    ['bcs', '৪৫তম বিসিএস প্রিলিমিনারি', '45th BCS Preliminary', 2024],
    ['bcs', '৪৪তম বিসিএস প্রিলিমিনারি', '44th BCS Preliminary', 2023],
    ['bank', 'সোনালী ব্যাংক সিনিয়র অফিসার', 'Sonali Bank Senior Officer', 2023],
    ['bank', 'জনতা ব্যাংক অফিসার (ক্যাশ)', 'Janata Bank Officer (Cash)', 2022],
    ['primary', 'প্রাথমিক সহকারী শিক্ষক নিয়োগ', 'Primary Assistant Teacher Recruitment', 2022],
    ['primary', 'প্রাথমিক সহকারী শিক্ষক নিয়োগ', 'Primary Assistant Teacher Recruitment', 2019],
    ['ntrca', 'এনটিআরসিএ ৫ম গণবিজ্ঞপ্তি', 'NTRCA 5th Mass Circular', 2023],
    ['ntrca', 'এনটিআরসিএ ৪র্থ গণবিজ্ঞপ্তি', 'NTRCA 4th Mass Circular', 2021],
    ['admission', 'ঢাকা বিশ্ববিদ্যালয় ভর্তি পরীক্ষা', 'University of Dhaka Admission Test', 2023],
    ['admission', 'বুয়েট ভর্তি পরীক্ষা', 'BUET Admission Test', 2022],
  ];
  const categoryIdBySlug = new Map(
    categories.map((c, i) => [c.slug, (categoryNodes[i] as { id: number }).id]),
  );
  const sourceByCategory = new Map<number, { id: number; year: number }[]>();
  for (const [slug, bn, en, year] of sourceDefs) {
    const categoryId = categoryIdBySlug.get(slug) as number;
    const [res] = await conn.execute<ResultSetHeader>(
      'INSERT INTO source_exams (category_id, name_bn, name_en, slug, year) VALUES (?, ?, ?, ?, ?)',
      [
        categoryId,
        bn,
        en,
        `${slug}-${year}-${(sourceByCategory.get(categoryId)?.length ?? 0) + 1}`,
        year,
      ],
    );
    const list = sourceByCategory.get(categoryId) ?? [];
    list.push({ id: res.insertId, year });
    sourceByCategory.set(categoryId, list);
  }

  // ---- questions
  const generated = generateQuestions(topics, QUESTION_COUNT);
  const now = new Date();
  const questionRows = generated.map(({ topicId, question: q }, i) => {
    const sources = sourceByCategory.get((topicById.get(topicId) as TopicInfo).categoryId) ?? [];
    const source = i % 7 === 0 ? sources[((i / 7) % sources.length) | 0] : undefined;
    return [
      q.body,
      q.bodyText,
      json(q.options),
      q.correctOption,
      q.explanation,
      q.difficulty,
      'published',
      source?.id ?? null,
      source?.year ?? null,
      topicId,
      q.contentHash,
      i % 10 === 0 ? 1 : 0,
      now,
    ];
  });
  await insertBatches(
    conn,
    `INSERT INTO questions (body, body_text, options, correct_option, explanation, difficulty, status,
       source_exam_id, source_year, primary_node_id, content_hash, is_premium, published_at) VALUES ?`,
    questionRows,
  );

  const [idRows] = await conn.query<RowDataPacket[]>('SELECT id, content_hash FROM questions');
  const idByHash = new Map(idRows.map((r) => [r.content_hash as string, Number(r.id)]));
  const tagRows: unknown[][] = [];
  const countByNode = new Map<number, number>();
  for (const { topicId, question } of generated) {
    const qid = idByHash.get(question.contentHash) as number;
    for (const nodeId of (topicById.get(topicId) as TopicInfo).ancestry) {
      tagRows.push([qid, nodeId]);
      countByNode.set(nodeId, (countByNode.get(nodeId) ?? 0) + 1);
    }
  }
  await insertBatches(
    conn,
    'INSERT INTO question_tags (question_id, node_id) VALUES ?',
    tagRows,
    1000,
  );

  // question_count = published questions in subtree (worker maintains it later)
  const allNodeIds = [...nodeParent.keys()];
  for (const id of allNodeIds) {
    await conn.execute('UPDATE taxonomy_nodes SET question_count = ? WHERE id = ?', [
      countByNode.get(id) ?? 0,
      id,
    ]);
  }

  // ---- packages
  await insertBatches(
    conn,
    `INSERT INTO packages (name_bn, name_en, description, features, duration_days, price_bdt, compare_at_bdt,
       is_featured, sort_order) VALUES ?`,
    [
      [
        'মাসিক প্রিমিয়াম',
        'Monthly Premium',
        'এক মাসের জন্য সব প্রিমিয়াম কনটেন্ট',
        json(['সব লাইভ পরীক্ষা', 'আনলিমিটেড প্র্যাকটিস', 'সব সমাধান ও ব্যাখ্যা']),
        30,
        299,
        399,
        0,
        1,
      ],
      [
        'ত্রৈমাসিক প্রিমিয়াম',
        'Quarterly Premium',
        'তিন মাসের জন্য সেরা মূল্য',
        json([
          'সব লাইভ পরীক্ষা',
          'আনলিমিটেড প্র্যাকটিস',
          'সব সমাধান ও ব্যাখ্যা',
          'বিস্তারিত অ্যানালিটিক্স',
        ]),
        90,
        699,
        897,
        1,
        2,
      ],
      [
        'বার্ষিক প্রিমিয়াম',
        'Yearly Premium',
        'এক বছরের জন্য সর্বোচ্চ সাশ্রয়',
        json([
          'সব লাইভ পরীক্ষা',
          'আনলিমিটেড প্র্যাকটিস',
          'সব সমাধান ও ব্যাখ্যা',
          'বিস্তারিত অ্যানালিটিক্স',
          'অগ্রাধিকার সাপোর্ট',
        ]),
        365,
        1999,
        3588,
        0,
        3,
      ],
    ],
  );

  // ---- banners
  await insertBatches(
    conn,
    'INSERT INTO banners (title, image_url, deep_link, sort_order) VALUES ?',
    [
      ['প্রিমিয়ামে ৩০% ছাড়', 'https://cdn.example.com/banners/premium-offer.jpg', '/plans', 1],
      [
        'প্রতিদিন ১০টি প্রশ্ন অনুশীলন করুন',
        'https://cdn.example.com/banners/daily-practice.jpg',
        '/practice',
        2,
      ],
    ],
  );

  // ---- super admin from env
  const email = process.env.SEED_ADMIN_EMAIL ?? 'admin@example.com';
  const password = process.env.SEED_ADMIN_PASSWORD ?? 'change-me-admin';
  const [roles] = await conn.query<RowDataPacket[]>(
    "SELECT id FROM roles WHERE name = 'super_admin'",
  );
  await conn.execute(
    'INSERT INTO admins (email, name, password_hash, role_id) VALUES (?, ?, ?, ?)',
    [email, 'Super Admin', await hash(password), roles[0]?.id],
  );

  // ---- exams (finished, running, 3 upcoming) with papers
  const examIds = await seedExams(conn, categoryIdBySlug);

  console.log(
    `Seeded: ${districts.length} districts, ${allNodeIds.length} taxonomy nodes (${topics.length} topics), ` +
      `${generated.length} questions, 3 packages, 1 admin (${email}), ${examIds.length} exams.`,
  );
}
