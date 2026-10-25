# @mcq/ui

Shared React components for web and admin. Tokens only (`@mcq/design-tokens` utilities such as `bg-surface`, `text-text-muted`); never hardcode colours, sizes or spacing.

**Owner:** Dev B (Mozlish, @Mozlish)

- The package exports TypeScript source: add `@mcq/ui` to `transpilePackages` and `@source` it from the app's `globals.css` so Tailwind sees its classes.
- `cn()` is `clsx` + `tailwind-merge` taught about token font sizes; use it for every `className` merge.
- Theme: put `themeInitScript` inline in `<head>` and render `<ThemeToggle labels={...} />`.
- Labels and copy come from the app's next-intl messages as props; components do not import next-intl.
