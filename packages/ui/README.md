# @mcq/ui

Shared React components for web and admin. Tokens only (`@mcq/design-tokens` utilities such as `bg-surface`, `text-text-muted`); never hardcode colours, sizes or spacing.

**Owner:** Dev B (Mozlish, @Mozlish)

- The package exports TypeScript source: add `@mcq/ui` to `transpilePackages` and `@source` it from the app's `globals.css` so Tailwind sees its classes.
- `cn()` is `clsx` + `tailwind-merge` taught about token font sizes; use it for every `className` merge.
- Theme: put `themeInitScript` inline in `<head>` and render `<ThemeToggle labels={...} />`.
- Labels and copy come from the app's next-intl messages as props; components do not import next-intl.

## Components (UI kit v1)

Same names as the Flutter widgets planned in `apps/mobile/lib/shared/widgets` (docs/05 §5). See them all at `/dev/gallery` on web (`:3001/dev/gallery`, `/en/dev/gallery`) and admin (`:3002/dev/gallery`), light and dark side by side. The gallery is hidden in production unless `NEXT_PUBLIC_SHOW_GALLERY=1`.

| Component | Notes |
| --- | --- |
| `AppButton` | `variant` primary / secondary / ghost / danger, `size` md (52) / sm (40), `fullWidth`, `loading` (spinner, label kept for screen readers), `asChild` for links |
| `AppTextField` | 52 px, label above, `helperText` / `error` below (linked with `aria-describedby`) |
| `OptionTile` | `state` idle / selected / correct / wrong / missed from the `option.*` tokens; `onSelect` makes it a `role="radio"` (wrap in `role="radiogroup"`); result states add an icon + `statusLabel`; `OPTION_LABELS.bn` = ক খ গ ঘ ঙ |
| `AppCard` | `live` adds the 4 px live edge, `interactive` adds hover |
| `AppChip` | soft / primary / accent / live (dot) / success / danger, optional `icon` |
| `Skeleton` | compose to match the final layout |
| `EmptyState` | 120 px line illustration, title, description, `action` |
| `ErrorState` | message, `retryLabel` + `onRetry`, `kind="offline"` |
| `TimerBar` | static: `remainingSec`, `totalSec`, `locale`; primary → accent (≤ 5 min) → live (≤ 1 min) |
| `QuestionNavigator` | static grid of 40 px cells (answered / unanswered / marked + current), legend, screen reader names from `labels.cell` |

Text never comes from the package: pass translated labels as props. `formatInteger` / `formatClock` print locale digits (০৪:৫২ in bn). Import `@mcq/ui/styles.css` after the tokens for the option badge animation.
