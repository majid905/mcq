// pnpm contract:gen            -> TypeScript client (packages/api-client-ts)
// pnpm contract:gen --dart     -> also the Dart client (apps/mobile/packages/api_client)
// Dart is off by default: apps/mobile is out of scope until the website launches.
import { spawnSync } from 'node:child_process';

const withDart = process.argv.includes('--dart') || process.env.CONTRACT_GEN_DART === '1';

function run(cmd, args) {
  console.log(`> ${cmd} ${args.join(' ')}`);
  // Single command string: all arguments are static, and this avoids Node's DEP0190 warning.
  const res = spawnSync(`${cmd} ${args.join(' ')}`, { stdio: 'inherit', shell: true });
  if (res.status !== 0) process.exit(res.status ?? 1);
}

run('pnpm', ['--filter', '@mcq/api-client-ts', 'run', 'gen']);

if (withDart) {
  run('npx', [
    '--yes',
    '@openapitools/openapi-generator-cli',
    'generate',
    '-g',
    'dart-dio',
    '-i',
    'packages/api-contract/openapi.yaml',
    '-o',
    'apps/mobile/packages/api_client',
    '--additional-properties=pubName=api_client,serializationLibrary=json_serializable',
  ]);
} else {
  console.log('Dart client skipped (pass --dart or CONTRACT_GEN_DART=1 to generate it).');
}
