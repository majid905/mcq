/**
 * sanitize-html 2.18+ depends on ESM-only packages (htmlparser2 12 and friends). Jest runs CommonJS,
 * so these few packages are compiled on the fly. Production runs on Node 22.12+, which can
 * require() ESM natively.
 */
const ESM_ONLY = [
  'htmlparser2',
  'domhandler',
  'domutils',
  'dom-serializer',
  'entities',
  'domelementtype',
];

module.exports = {
  // Everything in node_modules is left alone except these packages (pnpm nests them under .pnpm/).
  transformIgnorePatterns: ['/node_modules/(?!(?:[.]pnpm/)?(?:' + ESM_ONLY.join('|') + ')[@/])'],
  esmTransform: [
    '^.+[.]m?js$',
    [
      'ts-jest',
      { tsconfig: { allowJs: true, module: 'commonjs', target: 'es2022' }, diagnostics: false },
    ],
  ],
};
