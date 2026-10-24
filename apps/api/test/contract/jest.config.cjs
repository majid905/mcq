/** Contract tests boot the real app: they need MySQL and Redis (docker compose up -d). */
module.exports = {
  rootDir: '../..',
  testEnvironment: 'node',
  testRegex: 'test/contract/.*\\.spec\\.ts$',
  moduleFileExtensions: ['ts', 'js', 'json'],
  transform: {
    '^.+\\.ts$': [
      'ts-jest',
      { tsconfig: '<rootDir>/tsconfig.json', diagnostics: { ignoreCodes: [151002] } },
    ],
  },
  setupFiles: ['<rootDir>/test/contract/setup-env.ts'],
  testTimeout: 30000,
};
