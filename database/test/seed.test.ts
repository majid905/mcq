import { describe, expect, it } from 'vitest';
import { districts } from '../seed/data/districts';
import { categories, subjectLibrary } from '../seed/data/taxonomy';
import { generateQuestions, toBn, type TopicRef } from '../seed/questions';

const topics: TopicRef[] = categories
  .flatMap((c) =>
    c.subjects.flatMap((kind) =>
      subjectLibrary[kind].chapters.flatMap((ch) =>
        ch.topics.map((t) => ({ id: 0, nameBn: t.bn, kind })),
      ),
    ),
  )
  .map((t, i) => ({ ...t, id: i + 1 }));

describe('seed data', () => {
  it('has 64 districts with unique ids and Dhaka first', () => {
    expect(districts).toHaveLength(64);
    expect(new Set(districts.map((d) => d.id)).size).toBe(64);
    expect(districts[0]).toMatchObject({ id: 1, nameEn: 'Dhaka' });
    expect(new Set(districts.map((d) => d.nameEn)).size).toBe(64);
  });

  it('has 5 categories and 2-3 chapters per subject', () => {
    expect(categories.map((c) => c.slug)).toEqual(['bcs', 'bank', 'primary', 'ntrca', 'admission']);
    for (const s of Object.values(subjectLibrary)) {
      expect(s.chapters.length).toBeGreaterThanOrEqual(2);
      expect(s.chapters.length).toBeLessThanOrEqual(3);
    }
  });
});

describe('generateQuestions', () => {
  const generated = generateQuestions(topics, 2000);

  it('produces 2000 unique questions', () => {
    expect(generated).toHaveLength(2000);
    expect(new Set(generated.map((g) => g.question.contentHash)).size).toBe(2000);
  });

  it('every question has 4 keyed options and a valid correct key', () => {
    for (const { question: q } of generated) {
      expect(q.options.map((o) => o.key)).toEqual(['a', 'b', 'c', 'd']);
      expect(q.options.map((o) => o.key)).toContain(q.correctOption);
      expect(new Set(q.options.map((o) => o.html)).size).toBe(4);
      expect(q.difficulty).toBeGreaterThanOrEqual(1);
      expect(q.difficulty).toBeLessThanOrEqual(5);
    }
  });

  it('is Bangla and spreads topics evenly', () => {
    const bangla = generated.filter((g) => /[ঀ-৿]/.test(g.question.bodyText));
    expect(bangla.length / generated.length).toBeGreaterThan(0.95);
    const perTopic = new Map<number, number>();
    for (const g of generated) perTopic.set(g.topicId, (perTopic.get(g.topicId) ?? 0) + 1);
    const counts = [...perTopic.values()];
    expect(Math.max(...counts) - Math.min(...counts)).toBeLessThanOrEqual(1);
  });

  it('is deterministic', () => {
    expect(generateQuestions(topics, 50).map((g) => g.question.contentHash)).toEqual(
      generated.slice(0, 50).map((g) => g.question.contentHash),
    );
  });

  it('spreads the correct answer over all keys', () => {
    const counts = { a: 0, b: 0, c: 0, d: 0 };
    for (const g of generated) counts[g.question.correctOption]++;
    for (const n of Object.values(counts)) expect(n).toBeGreaterThan(300);
  });

  it('math answers are arithmetically right (LCM)', () => {
    const fromBn = (s: string) =>
      Number(s.replace(/[০-৯]/g, (d) => String('০১২৩৪৫৬৭৮৯'.indexOf(d))));
    const gcd = (a: number, b: number): number => (b === 0 ? a : gcd(b, a % b));
    const lcmQuestions = generated.filter((g) => g.question.bodyText.includes('এর ল.সা.গু. কত'));
    expect(lcmQuestions.length).toBeGreaterThan(10);
    for (const { question: q } of lcmQuestions) {
      const [a, b] = (q.bodyText.match(/[০-৯]+/g) ?? []).map(fromBn) as [number, number];
      const correct = q.options.find((o) => o.key === q.correctOption);
      expect(fromBn(correct?.html.replace(/<[^>]+>/g, '') ?? '')).toBe((a * b) / gcd(a, b));
    }
  });
});

describe('toBn', () => {
  it('converts digits', () => {
    expect(toBn(2026)).toBe('২০২৬');
  });
});
