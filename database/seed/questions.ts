import { createHash } from 'node:crypto';
import { facts } from './data/facts';
import type { SubjectKind } from './data/taxonomy';

export type OptionKey = 'a' | 'b' | 'c' | 'd';
const KEYS: OptionKey[] = ['a', 'b', 'c', 'd'];

export interface SeedQuestion {
  body: string;
  bodyText: string;
  options: { key: OptionKey; html: string }[];
  correctOption: OptionKey;
  explanation: string;
  difficulty: number;
  contentHash: string;
}

export interface TopicRef {
  id: number;
  nameBn: string;
  kind: SubjectKind;
}

export type Rng = () => number;

/** mulberry32, same generator the clients use (docs/04-API.md section 6). */
export function rngFrom(seed: number): Rng {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const BN_DIGITS = ['০', '১', '২', '৩', '৪', '৫', '৬', '৭', '৮', '৯'];
export const toBn = (n: number | string): string =>
  String(n).replace(/\d/g, (d) => BN_DIGITS[Number(d)] ?? d);

const int = (rnd: Rng, min: number, max: number) => min + Math.floor(rnd() * (max - min + 1));
const pick = <T>(rnd: Rng, list: readonly T[]): T => list[Math.floor(rnd() * list.length)] as T;

const gcd = (a: number, b: number): number => (b === 0 ? a : gcd(b, a % b));

interface Draft {
  q: string;
  correct: string;
  wrong: [string, string, string];
  explanation: string;
  difficulty: number;
}

/** Numeric distractors near the answer: distinct, positive, never equal to it. */
function numericWrong(rnd: Rng, answer: number, step: number): [string, string, string] {
  const seen = new Set<number>([answer]);
  const out: number[] = [];
  let guard = 0;
  while (out.length < 3 && guard++ < 50) {
    const candidate = answer + int(rnd, -4, 4) * step;
    if (candidate > 0 && !seen.has(candidate)) {
      seen.add(candidate);
      out.push(candidate);
    }
  }
  for (let k = 1; out.length < 3; k++) {
    const candidate = answer + (5 + k) * step;
    if (!seen.has(candidate)) {
      seen.add(candidate);
      out.push(candidate);
    }
  }
  return [toBn(out[0] as number), toBn(out[1] as number), toBn(out[2] as number)];
}

type MathGen = (rnd: Rng) => Draft;

const mathGenerators: MathGen[] = [
  (rnd) => {
    const a = pick(rnd, [4, 6, 8, 9, 12, 15, 18, 20, 24]);
    const b = pick(rnd, [10, 14, 16, 21, 25, 30, 36]);
    const l = (a * b) / gcd(a, b);
    return {
      q: `${toBn(a)} ও ${toBn(b)} এর ল.সা.গু. কত?`,
      correct: toBn(l),
      wrong: numericWrong(rnd, l, gcd(a, b)),
      explanation: `ল.সা.গু. = (${toBn(a)} × ${toBn(b)}) ÷ গ.সা.গু. = ${toBn(l)}।`,
      difficulty: 2,
    };
  },
  (rnd) => {
    const g = pick(rnd, [3, 4, 5, 6, 7]);
    const a = g * pick(rnd, [4, 5, 6, 8]);
    const b = g * pick(rnd, [3, 7, 9, 10]);
    const d = gcd(a, b);
    return {
      q: `${toBn(a)} ও ${toBn(b)} এর গ.সা.গু. কত?`,
      correct: toBn(d),
      wrong: numericWrong(rnd, d, 1),
      explanation: `${toBn(a)} ও ${toBn(b)} এর সবচেয়ে বড় সাধারণ গুণনীয়ক ${toBn(d)}।`,
      difficulty: 2,
    };
  },
  (rnd) => {
    const x = 20 * int(rnd, 2, 40);
    const p = 5 * int(rnd, 2, 12);
    const r = (x * p) / 100;
    return {
      q: `${toBn(x)} এর ${toBn(p)}% কত?`,
      correct: toBn(r),
      wrong: numericWrong(rnd, r, 5),
      explanation: `${toBn(x)} × ${toBn(p)} ÷ ১০০ = ${toBn(r)}।`,
      difficulty: 1,
    };
  },
  (rnd) => {
    const cost = 100 * int(rnd, 3, 40);
    const profit = pick(rnd, [10, 20, 25, 30, 40]);
    const sp = (cost * (100 + profit)) / 100;
    return {
      q: `একটি পণ্য ${toBn(cost)} টাকায় কিনে ${toBn(profit)}% লাভে বিক্রি করলে বিক্রয়মূল্য কত টাকা?`,
      correct: toBn(sp),
      wrong: numericWrong(rnd, sp, 10),
      explanation: `বিক্রয়মূল্য = ${toBn(cost)} × (১০০ + ${toBn(profit)}) ÷ ১০০ = ${toBn(sp)} টাকা।`,
      difficulty: 3,
    };
  },
  (rnd) => {
    const principal = 1000 * int(rnd, 2, 25);
    const rate = pick(rnd, [5, 8, 10, 12]);
    const years = int(rnd, 2, 5);
    const si = (principal * rate * years) / 100;
    return {
      q: `${toBn(principal)} টাকার ${toBn(years)} বছরের সরল সুদ কত, যদি সুদের হার বার্ষিক ${toBn(rate)}% হয়?`,
      correct: toBn(si),
      wrong: numericWrong(rnd, si, 50),
      explanation: `সুদ = (${toBn(principal)} × ${toBn(rate)} × ${toBn(years)}) ÷ ১০০ = ${toBn(si)} টাকা।`,
      difficulty: 2,
    };
  },
  (rnd) => {
    const avg = int(rnd, 10, 60);
    const offsets = [int(rnd, -8, 8), int(rnd, -8, 8), int(rnd, -8, 8), int(rnd, -8, 8)];
    const last = -offsets.reduce((s, v) => s + v, 0);
    const nums = [...offsets, last].map((o) => avg + o);
    return {
      q: `${nums.map(toBn).join(', ')} এর গড় কত?`,
      correct: toBn(avg),
      wrong: numericWrong(rnd, avg, 1),
      explanation: `সংখ্যাগুলোর যোগফল ${toBn(avg * 5)}, গড় = ${toBn(avg * 5)} ÷ ৫ = ${toBn(avg)}।`,
      difficulty: 2,
    };
  },
  (rnd) => {
    const speed = 5 * int(rnd, 6, 16);
    const hours = int(rnd, 2, 8);
    const distance = speed * hours;
    return {
      q: `ঘণ্টায় ${toBn(speed)} কিমি বেগে ${toBn(hours)} ঘণ্টায় কত কিমি পথ যাওয়া যায়?`,
      correct: toBn(distance),
      wrong: numericWrong(rnd, distance, speed >= 20 ? 10 : 5),
      explanation: `দূরত্ব = বেগ × সময় = ${toBn(speed)} × ${toBn(hours)} = ${toBn(distance)} কিমি।`,
      difficulty: 1,
    };
  },
];

function placeholder(topic: TopicRef, n: number, rnd: Rng): Draft {
  const correct = `বিকল্প ${toBn(n)}-ক`;
  return {
    q: `${topic.nameBn} (নমুনা প্রশ্ন ${toBn(n)}): নিচের কোনটি সঠিক উত্তর?`,
    correct,
    wrong: [`বিকল্প ${toBn(n)}-খ`, `বিকল্প ${toBn(n)}-গ`, `বিকল্প ${toBn(n)}-ঘ`],
    explanation: 'এটি একটি নমুনা প্রশ্ন। প্রকৃত কনটেন্ট আমদানির পর এটি প্রতিস্থাপিত হবে।',
    difficulty: int(rnd, 1, 5),
  };
}

const sha256 = (s: string) => createHash('sha256').update(s).digest('hex');

const stripTags = (html: string) => html.replace(/<[^>]+>/g, '');

function finalize(draft: Draft, rnd: Rng): SeedQuestion {
  const all = [draft.correct, ...draft.wrong];
  // Fisher-Yates so the correct answer is spread over a..d.
  for (let i = all.length - 1; i > 0; i--) {
    const j = Math.floor(rnd() * (i + 1));
    [all[i], all[j]] = [all[j] as string, all[i] as string];
  }
  const options = all.map((text, i) => ({ key: KEYS[i] as OptionKey, html: `<p>${text}</p>` }));
  const correctOption = KEYS[all.indexOf(draft.correct)] as OptionKey;
  const body = `<p>${draft.q}</p>`;
  const bodyText = stripTags(body);
  const normalized = [bodyText, ...options.map((o) => stripTags(o.html))].join('|').toLowerCase();
  return {
    body,
    bodyText,
    options,
    correctOption,
    explanation: `<p>${draft.explanation}</p>`,
    difficulty: draft.difficulty,
    contentHash: sha256(normalized),
  };
}

/**
 * Deterministic: the same topics + count always give the same questions.
 * Real facts are used once each, math is generated, everything else is a numbered placeholder.
 */
export function generateQuestions(topics: TopicRef[], total: number, seed = 20261024) {
  const rnd = rngFrom(seed);
  const factQueue: Partial<Record<SubjectKind, number>> = {};
  const seen = new Set<string>();
  const out: { topicId: number; question: SeedQuestion }[] = [];

  for (let i = 0; i < total; i++) {
    const topic = topics[i % topics.length] as TopicRef;
    const n = i + 1;
    let draft: Draft | undefined;
    let question: SeedQuestion | undefined;

    if (topic.kind === 'math' || topic.kind === 'hmath') {
      for (let attempt = 0; attempt < 30 && !question; attempt++) {
        const candidate = finalize(pick(rnd, mathGenerators)(rnd), rnd);
        if (!seen.has(candidate.contentHash)) question = candidate;
      }
    } else {
      const bank = facts[topic.kind];
      const next = factQueue[topic.kind] ?? 0;
      const fact = bank?.[next];
      if (fact) {
        factQueue[topic.kind] = next + 1;
        draft = {
          q: fact.q,
          correct: fact.a,
          wrong: fact.wrong,
          explanation: fact.explanation,
          difficulty: int(rnd, 1, 3),
        };
      }
    }

    question ??= finalize(draft ?? placeholder(topic, n, rnd), rnd);
    if (seen.has(question.contentHash)) {
      question = finalize(placeholder(topic, n, rnd), rnd);
    }
    seen.add(question.contentHash);
    out.push({ topicId: topic.id, question });
  }
  return out;
}
