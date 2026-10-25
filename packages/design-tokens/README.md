# @mcq/design-tokens

`design/tokens.json` → generated outputs. **Owner:** Dev B (Mozlish, @Mozlish). Never edit the outputs by hand; change `tokens.json` and run `pnpm tokens:gen`.

| Output | Used by |
| --- | --- |
| `dist/tokens.css` | Web + admin: `--mcq-*` CSS variables. Light by default, dark with `<html data-theme="dark">` or the OS setting (unless `data-theme="light"`). Durations drop to 0 with reduced motion. |
| `dist/theme.css` | Web + admin: Tailwind v4 `@theme inline`. Tailwind's default palette, font sizes, radii and shadows are reset, so only token utilities exist: `bg-surface`, `text-text-muted`, `border-border`, `text-question`, `rounded-md`, `shadow-sm`, `p-4` (= 16 px, spacing step 4 px), `max-w-reading`. |
| `apps/mobile/lib/core/theme/tokens.g.dart` | Flutter (committed): `AppColors.light/dark`, `AppSpace`, `AppRadius`, `AppText`, `AppMotion`, `AppTokens` theme extension, `buildTheme(Brightness)`. |

`dist/` is git-ignored; turbo runs `build` (= `gen`) before `dev`, `typecheck` and `test` of the apps.

```css
/* apps/web/app/globals.css */
@import 'tailwindcss';
@import '@mcq/design-tokens/tokens.css';
@import '@mcq/design-tokens/theme.css';
```

## Contrast

`pnpm --filter @mcq/design-tokens test` checks every text/background pair in `src/contrast.ts` (`TEXT_PAIRS` plus each option tile state) against WCAG AA 4.5:1 in light and dark. When you add a colour that carries text, add its pair there.

Saffron `accent` is for fills (streak badge, timer bar, rank tile). Saffron **text** (on `accentSoft` chips, the timer under 5 minutes, marked navigator cells) uses `accentText`, because `accent` on a light background is only ~2:1.
