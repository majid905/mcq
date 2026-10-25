import base from '@mcq/config/eslint';
import nextPlugin from '@next/eslint-plugin-next';
import reactHooks from 'eslint-plugin-react-hooks';
import globals from 'globals';

export default [
  ...base,
  { ignores: ['next-env.d.ts', 'playwright-report/**', 'test-results/**'] },
  reactHooks.configs.flat.recommended,
  {
    plugins: { '@next/next': nextPlugin },
    rules: {
      ...nextPlugin.configs.recommended.rules,
      ...nextPlugin.configs['core-web-vitals'].rules,
    },
    languageOptions: { globals: { ...globals.browser } },
  },
];
