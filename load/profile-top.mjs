// Prints the functions with the most self time from a V8 .cpuprofile (see PROFILE_CPU_SECS in
// apps/api/src/common/cpu-profile.ts).   node load/profile-top.mjs cpu-1234.cpuprofile [rows]
import { readFileSync } from 'node:fs';

const [file, rowsArg] = process.argv.slice(2);
if (!file) throw new Error('usage: profile-top.mjs <file.cpuprofile> [rows]');
const profile = JSON.parse(readFileSync(file, 'utf8'));
const byId = new Map(profile.nodes.map((n) => [n.id, n]));
const self = new Map();
const dt = profile.timeDeltas;
profile.samples.forEach((id, i) => self.set(id, (self.get(id) ?? 0) + (dt[i] ?? 0)));

const total = [...self.values()].reduce((a, b) => a + b, 0);
const rows = new Map();
for (const [id, us] of self) {
  const { functionName, url, lineNumber } = byId.get(id).callFrame;
  const where = url ? url.replace(/^.*[\/]node_modules[\/]/, 'node_modules/').replace(/^file:\/\/\//, '') : '';
  const key = `${functionName || '(anonymous)'}  ${where}:${lineNumber + 1}`;
  rows.set(key, (rows.get(key) ?? 0) + us);
}
const top = [...rows].sort((a, b) => b[1] - a[1]).slice(0, Number(rowsArg ?? 25));
console.log(`total sampled: ${(total / 1e6).toFixed(1)} s`);
for (const [k, us] of top) console.log(`${((us / total) * 100).toFixed(1).padStart(5)}%  ${(us / 1000).toFixed(0).padStart(7)} ms  ${k}`);
