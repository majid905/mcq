import base from '@mcq/config/eslint';

export default [
  ...base,
  {
    rules: {
      // Type-only imports break Nest constructor injection (emitDecoratorMetadata).
      '@typescript-eslint/consistent-type-imports': 'off',
    },
  },
  {
    files: ['src/main.ts', 'src/worker.ts', 'src/scheduler.ts'],
    rules: { 'no-console': 'off' },
  },
];
