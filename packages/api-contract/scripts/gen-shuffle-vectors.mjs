// Regenerates shuffle-vectors.json. Written straight from docs/04-API.md section 6,
// independent of packages/api-client-ts/src/shuffle.ts so the tests are not circular.
import { writeFileSync } from 'node:fs';

function mulberry32(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function fisherYates(list, rnd) {
  for (let i = list.length - 1; i >= 1; i--) {
    const j = Math.floor(rnd() * (i + 1));
    [list[i], list[j]] = [list[j], list[i]];
  }
  return list;
}

const paper = {
  sections: [
    { node_id: '11', question_ids: ['101', '102', '103', '104', '105', '106'] },
    { node_id: '12', question_ids: ['201', '202', '203', '204', '205'] },
  ],
  options: {
    101: ['a', 'b', 'c', 'd'],
    102: ['a', 'b', 'c', 'd'],
    103: ['a', 'b', 'c', 'd'],
    104: ['a', 'b', 'c', 'd'],
    105: ['a', 'b', 'c', 'd'],
    106: ['a', 'b', 'c', 'd'],
    201: ['a', 'b', 'c', 'd', 'e'],
    202: ['a', 'b', 'c', 'd', 'e'],
    203: ['a', 'b', 'c', 'd'],
    204: ['a', 'b', 'c', 'd'],
    205: ['a', 'b', 'c', 'd', 'e'],
  },
};

// [seed, shuffle_questions, shuffle_options]
const cases = [
  [0, true, true],
  [1, true, true],
  [42, true, true],
  [12345, true, true],
  [2024, true, false],
  [987654321, false, true],
  [2147483647, true, true],
  [3141592653, true, true],
  [4294967295, true, true],
  [7, false, false],
];

const vectors = cases.map(([seed, shuffleQuestions, shuffleOptions]) => {
  const rnd = mulberry32(seed);
  const probe = mulberry32(seed);
  const first_floats = Array.from({ length: 5 }, () => probe());
  const sections = paper.sections.map((s) => [...s.question_ids]);
  if (shuffleQuestions) for (const ids of sections) fisherYates(ids, rnd);
  const options = {};
  for (const ids of sections) {
    for (const id of ids) {
      const keys = [...paper.options[id]];
      options[id] = shuffleOptions ? fisherYates(keys, rnd) : keys;
    }
  }
  return {
    seed,
    shuffle_questions: shuffleQuestions,
    shuffle_options: shuffleOptions,
    first_floats,
    sections,
    options,
  };
});

const out = {
  description:
    'Shared TS/Dart shuffle vectors. Algorithm: docs/04-API.md section 6. Regenerate: pnpm --filter @mcq/api-contract vectors:gen',
  paper,
  vectors,
};
writeFileSync(
  new URL('../shuffle-vectors.json', import.meta.url),
  JSON.stringify(out, null, 2) + '\n',
);
console.log(`wrote ${vectors.length} vectors`);
