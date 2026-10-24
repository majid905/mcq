// pnpm mock  -> Prism mock of openapi.yaml, served at http://localhost:4010/v1
//
// Prism ignores the base path of `servers`, so it answers at "/". This wrapper runs Prism on an
// internal port and puts a tiny proxy on 4010 that strips the "/v1" prefix. Clients can then use
// the same base URL shape for the mock and the real API: http://localhost:<port>/v1
//
//   node scripts/mock.mjs            static mode: returns the Bangla `examples` from the contract
//   node scripts/mock.mjs --dynamic  Prism generates random data from the schemas
import { spawn } from 'node:child_process';
import http from 'node:http';

const PORT = Number(process.env.MOCK_PORT ?? 4010);
const PRISM_PORT = PORT + 1;
const dynamic = process.argv.includes('--dynamic');

const prism = spawn(
  `prism mock openapi.yaml -p ${PRISM_PORT} -h 127.0.0.1${dynamic ? ' -d' : ''}`,
  { stdio: 'inherit', shell: true },
);
prism.on('exit', (code) => process.exit(code ?? 0));
for (const sig of ['SIGINT', 'SIGTERM']) {
  process.on(sig, () => {
    prism.kill();
    process.exit(0);
  });
}

const proxy = http.createServer((req, res) => {
  const path = (req.url ?? '/').replace(/^\/v1(?=\/|\?|$)/, '') || '/';
  const upstream = http.request(
    { host: '127.0.0.1', port: PRISM_PORT, method: req.method, path, headers: req.headers },
    (up) => {
      res.writeHead(up.statusCode ?? 502, up.headers);
      up.pipe(res);
    },
  );
  upstream.on('error', () => {
    res.writeHead(503, { 'content-type': 'application/json' });
    res.end(
      JSON.stringify({ error: { code: 'MOCK_STARTING', message: 'Prism is not ready yet' } }),
    );
  });
  req.pipe(upstream);
});

proxy.listen(PORT, '0.0.0.0', () => {
  console.log(
    `Mock API ready: http://localhost:${PORT}/v1 (${dynamic ? 'dynamic' : 'static'} mode)`,
  );
});
