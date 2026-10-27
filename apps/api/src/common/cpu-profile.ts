import { writeFileSync } from 'node:fs';
import { Session } from 'node:inspector';

/**
 * Load-test aid: `PROFILE_CPU_SECS=90 node dist/main.js` records a V8 CPU profile for that many
 * seconds starting now and writes `cpu-<pid>.cpuprofile` (open it in Chrome DevTools or run
 * `node load/profile-top.mjs <file>`). Off unless the variable is set.
 */
export function startCpuProfileIfRequested(): void {
  const secs = Number(process.env['PROFILE_CPU_SECS'] ?? 0);
  if (!Number.isFinite(secs) || secs <= 0) return;
  const session = new Session();
  session.connect();
  session.post('Profiler.enable', () => {
    session.post('Profiler.start', () => {
      setTimeout(() => {
        session.post('Profiler.stop', (err, result) => {
          if (!err) {
            const file = `cpu-${process.pid}.cpuprofile`;
            writeFileSync(file, JSON.stringify(result.profile));
            process.stdout.write(`CPU profile written to ${file}\n`);
          }
        });
      }, secs * 1000).unref();
    });
  });
}
