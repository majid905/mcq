# Integrating the landing page into `majid905/mcq`

Read this together with `README.md` (the visual spec). This file maps the design onto **this** repo's rules (`CLAUDE.md`, `docs/05-DESIGN-SYSTEM.md`, `packages/ui`, `packages/design-tokens`). Owner: Dev B (`apps/web`, `packages/ui`, `packages/design-tokens`, `design/`).

## Where it goes
| Design section | File(s) |
|---|---|
| Header + footer | `apps/web/components/public-shell.tsx` (keep `HeaderControls`, `Brand`, login/register links) |
| Logo 1d | `apps/web/components/brand.tsx` → replace `Brand` / `BrandMark` |
| Page body | `apps/web/app/[locale]/(public)/page.tsx` (stays a **server component** for SEO; keep `generateMetadata`, `publicApi`, `/packages`, `/settings/public`) |
| Interactive bits | new client components in `apps/web/components/landing/`: `hero-live-card.tsx` (countdown), `try-question.tsx`, `how-it-works.tsx`, `result-preview.tsx` (cross-fade + capsule tooltips), `reviews-marquee.tsx`, `faq.tsx` |
| Copy | `apps/web/messages/bn.json` **and** `en.json`, `landing.*` namespace, same keys (enforced by `test/messages.test.ts`) |
| Badges | `apps/web/public/badges/google-play.png`, `app-store.png` |

## Tokens: use the repo's, not the prototype's
`CLAUDE.md`: "Never hardcode colors, font sizes or spacing." The prototype's palette is very close to `design/tokens.json`. **Map to existing token utilities** and don't add the prototype hexes:

| Prototype var | Repo utility (Tailwind v4 via `@mcq/design-tokens/theme.css`) |
|---|---|
| `--bg` / `--sf` / `--sf2` | `bg-bg` / `bg-surface` / `bg-surface-muted` |
| `--ink` / `--ink2` / `--ink3` | `text-text` / `text-text-muted` / `text-text-subtle` |
| `--ln` / `--ln2` | `border-border` / `border-border-strong` |
| `--pr` / `--prh` / `--onpr` / `--prs` | `bg-primary` / `hover:bg-primary-hover` / `text-on-primary` / `bg-primary-soft` |
| `--pri` (ink on soft primary) | `text-primary` |
| `--ac` / `--acs` / `--aci` | `bg-accent` / `bg-accent-soft` / `text-accent-text` (saffron text **must** use `accent-text`, per contrast rule) |
| `--ok`/`--oks`, `--er`/`--ers` | `success`/`success-soft`, `danger`/`danger-soft` (answer states: use `OptionTile` `state`) |
| "লাইভ" red | `live` / `live-soft` (`AppChip variant="live"`) |
| `--rv`/`--rvs` (review indigo) | `info` / `info-soft` |
| `--fx` (app-download green panel) | `bg-primary` + `text-on-primary` |
| `--shc` shadows | `shadow-sm` / `shadow-md` / `shadow-lg` |
| `--hdr` (blurred sticky header) | `bg-surface/90 backdrop-blur` (or keep `bg-surface` as today) |

Radii: `rounded-sm|md|lg|xl|pill` (8/12/16/24/999). Spacing: 4-pt scale (`p-4` = 16px). Type: `text-display|h1|h2|h3|body|body-sm|caption|stat`. The landing hero/section headings are larger than `h1` (26px). **Add two tokens to `tokens.json`** rather than arbitrary values: `font.size.heroDisplay: 56` (mobile 36) and `font.size.sectionTitle: 40` (mobile 28). Then run `pnpm tokens:gen`.

Dark mode already works through `data-theme` + `ThemeToggle`. Don't re-implement the prototype's theme switch.

### Visual delta to expect
The repo primary is `#0F766E` (slightly brighter teal) vs the prototype's `#0E5E4E`, and the dark-mode primary is `#2DBDAE` vs `#3CC4A2`. That's acceptable; it keeps the landing page consistent with the app. If the team prefers the deeper green, change it **once** in `design/tokens.json` (and recheck `contrast.ts`), never per-component.

## Fonts
The repo self-hosts Inter + Hind Siliguri through `apps/web/app/fonts.ts`. The design adds **Anek Bangla** (variable, `wdth` 75–125) for display headings, big numbers and the logo:
```ts
// apps/web/app/fonts.ts
import { Anek_Bangla } from 'next/font/google';
export const anekBangla = Anek_Bangla({ subsets: ['bengali','latin'], axes: ['wdth'], variable: '--font-anek', display: 'swap' });
```
Add `anekBangla.variable` to `<html className>` in `[locale]/layout.tsx` and `--mcq-font-display: var(--font-inter), var(--font-anek), var(--font-hind), sans-serif;` in `globals.css`. Use it only for headings, stats and the logo. Body text stays Hind Siliguri. Also add `font.family.display` to `tokens.json` so Flutter can bundle it later.

## Components to reuse from `@mcq/ui`
- Buttons → `AppButton` (`asChild` with `Link`; `size="md"` is 52px, consistent with 48px badges). Add the hover lift as an extra `className` (`motion-safe:hover:-translate-y-0.5 transition-transform`).
- Chips (eyebrow, "লাইভ", "সবচেয়ে সাশ্রয়ী") → `AppChip` (`soft` / `live` / `accent`).
- Cards → `AppCard` (`live` for the live-test card's left edge).
- Try-one-question options → `OptionTile` + `OPTION_LABELS.bn` inside `role="radiogroup"`.
- Result preview → `ScoreRing`, `ProgressBar`, `StatTile`, `RankBadge`.
- Countdown digits → `formatClock` / `formatInteger(n, locale)` (don't hand-roll a Bangla digit map; this also gives English digits on `/en`).
- Icons → `lucide-react`, `strokeWidth={1.75}`. Social icons (Facebook, YouTube, LinkedIn, Instagram) aren't in Lucide, so add them as small inline SVG components in `components/landing/social-icons.tsx`.

## Data: real vs placeholder
| Shown in design | Source |
|---|---|
| Pricing cards | existing `GET /packages` (`is_featured` → "সবচেয়ে সাশ্রয়ী" badge, `price_bdt`, `duration_days`, `features`). Don't hardcode the 4 plans. |
| Free quota line | existing `GET /settings/public` |
| Next live exam + countdown, enrolled count (৩২০), last live leaderboard (১,২৪০ জন) | **no public endpoint yet**. Dev B writes a contract-change request (`.github/ISSUE_TEMPLATE/contract-change.md`) for e.g. `GET /public/landing` → `{ next_live_exam, enrolled_count, last_leaderboard_top3, participants }`. Until it exists, hide those numbers or show the card without them. Don't ship fake numbers. |
| Rating ৪.৮৩, ১,২৫৮+ শিক্ষার্থী | include in the same contract request (or `settings/public`). Until then, keep them in messages and agree with the product owner that they're real. |
| Try-one-question (3 Qs) | `GET /public/questions/{slug}` for 3 chosen slugs (already public, SEO-safe), or static in messages |
| Reviews marquee | dummy in design. Keep it as a static array in messages until real testimonials exist. |
| Store links | env `NEXT_PUBLIC_PLAY_STORE_URL`, `NEXT_PUBLIC_APP_STORE_URL`. The current page says "app coming soon" (`landing.appSoon`), so hide the badges until the URLs are set. |

## Motion
Use `motion-safe:` variants and the token durations (`duration-(--mcq-duration-base)`, `ease-standard`); `tokens.css` already zeroes durations under reduced motion. Put the custom keyframes from `tokens.css` (`glow`, `ping`, `marquee`, `rowin`, `drift`, `ringfill`, `tipin`) in `packages/ui/src/styles.css` or a `landing.css` imported by the page. JS loops (how-it-works, result rotation, countdown) live in client components. Start them with `IntersectionObserver` and skip them when `matchMedia('(prefers-reduced-motion: reduce)')` matches. `docs/05 §6`: no flashing.

## Routing & links
- "ফ্রি মডেল টেস্ট দিন" / "অথবা ব্রাউজারে ফ্রি টেস্ট শুরু করুন →" → `/register` (guests) via `@/i18n/navigation` `Link`.
- লগইন → `/login`. প্যাকেজ → `/plans`. Footer links keep `landing.footer.*` (about, contact, privacy, terms, refund).
- Section anchors: `#try`, `#features`, `#pricing`, `#app`, `#faq`.

## Acceptance checklist (from `B-session-start.md`)
- bn **and** en render (all strings in both message files, same keys); light **and** dark.
- Lint, typecheck, `vitest` (messages test, design-tokens contrast test) and a Playwright check of `/` pass.
- Lighthouse: hero LCP is text (no image), badges have `width`/`height`, mobile shows store badges above the fold.
- Commit: `feat(web): landing page redesign [K]` on branch `b/landing-redesign`. Push the branch and draft the PR text; don't merge.

## Prompt to paste into Claude Code (Dev B session)
> Read `CLAUDE.md`, `docs/05-DESIGN-SYSTEM.md`, then `design_handoff_landing_page/README.md` and `INTEGRATION-mcq.md`. Open `design_handoff_landing_page/Landing Page.dc.html` in a browser as the visual reference. Rebuild the landing page (`apps/web/app/[locale]/(public)/page.tsx`), `public-shell.tsx` and `brand.tsx` to match it using `@mcq/ui` components and design-token utilities only, per the mapping in INTEGRATION-mcq.md. Put all copy in `messages/bn.json` + `en.json`. Write the contract-change request for the landing stats instead of hardcoding them. Work on branch `b/landing-redesign`.
