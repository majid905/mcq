import base from '@mcq/config/eslint';

export default [
  ...base,
  // CLI scripts print progress.
  { rules: { 'no-console': 'off' } },
];
