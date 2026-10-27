/** Unit tests: no database or Redis needed. Contract tests: see test/contract/jest.config.cjs. */
// eslint-disable-next-line @typescript-eslint/no-require-imports
const esm = require('./jest.esm.cjs');
module.exports = {
  transformIgnorePatterns: esm.transformIgnorePatterns,
  rootDir: '.',
  testEnvironment: 'node',
  testRegex: 'src/.*\\.spec\\.ts$',
  moduleFileExtensions: ['ts', 'js', 'json'],
  transform: {
    [esm.esmTransform[0]]: esm.esmTransform[1],
    '^.+\\.ts$': [
      'ts-jest',
      { tsconfig: '<rootDir>/tsconfig.json', diagnostics: { ignoreCodes: [151002] } },
    ],
  },
};
