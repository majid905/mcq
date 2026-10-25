import base from '@mcq/config/eslint';
import reactHooks from 'eslint-plugin-react-hooks';
import globals from 'globals';

export default [
  ...base,
  reactHooks.configs.flat.recommended,
  { languageOptions: { globals: { ...globals.browser } } },
];
