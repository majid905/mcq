# @mcq/config

Shared `tsconfig.base.json` (strict), ESLint flat config and Prettier config.

**Owner:** shared (Dev A + Dev B). PR review by the other developer.

```js
// eslint.config.mjs in an app
import base from '@mcq/config/eslint';
export default base;
```

```json
// tsconfig.json in an app
{ "extends": "@mcq/config/tsconfig.base.json" }
```
