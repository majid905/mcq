// CI helper: turns a jest --json report into GitHub annotations (one per failed test, first lines
// of the message), so a red run can be diagnosed from the checks page and the API without logs.
//   node scripts/ci-annotate-jest.mjs apps/api/jest-contract.json
import { existsSync, readFileSync } from 'node:fs';

const file = process.argv[2];
if (!file || !existsSync(file)) {
  process.stdout.write(`::warning::no jest report at ${file}\n`);
  process.exit(0);
}
const report = JSON.parse(readFileSync(file, 'utf8'));
let shown = 0;
const clean = (s) =>
  String(s)
    .replace(/\u001b\[[0-9;]*m/g, '')
    .replace(/[\r\n]+/g, ' | ')
    .slice(0, 500);

for (const suite of report.testResults ?? []) {
  if (suite.status === 'failed' && (suite.assertionResults ?? []).length === 0) {
    process.stdout.write(`::error title=jest suite failed::${clean(suite.name)} ${clean(suite.message)}\n`);
    shown++;
  }
  for (const t of suite.assertionResults ?? []) {
    if (t.status !== 'failed' || shown >= 10) continue;
    process.stdout.write(
      `::error title=jest::${clean(t.fullName)} => ${clean((t.failureMessages ?? [])[0] ?? '')}\n`,
    );
    shown++;
  }
}
process.stdout.write(
  `jest: ${report.numPassedTests} passed, ${report.numFailedTests} failed, ${report.numTotalTests} total\n`,
);
