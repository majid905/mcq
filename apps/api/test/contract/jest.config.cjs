/** Contract tests boot the real app: they need MySQL and Redis (docker compose up -d). */
// eslint-disable-next-line @typescript-eslint/no-require-imports
const esm = require('../../jest.esm.cjs');
module.exports = {
  transformIgnorePatterns: esm.transformIgnorePatterns,
  rootDir: '../..',
  testEnvironment: 'node',
  testRegex: 'test/contract/.*\\.spec\\.ts$',
  moduleFileExtensions: ['ts', 'js', 'json'],
  transform: {
    [esm.esmTransform[0]]: esm.esmTransform[1],
    '^.+\\.ts$': [
      'ts-jest',
      { tsconfig: '<rootDir>/tsconfig.json', diagnostics: { ignoreCodes: [151002] } },
    ],
  },
  setupFiles: ['<rootDir>/test/contract/setup-env.ts'],
  testTimeout: 30000,
};
