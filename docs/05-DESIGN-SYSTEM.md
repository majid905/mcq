# 05 — Design system

**Direction: "Calm focus."** Students spend long, stressful sessions in this app, often on budget Android phones in sunlight. The look is quiet, legible and confident: a deep teal-green primary (studious, a nod to Bangladesh's green), one warm saffron accent for achievement (streaks, ranks, premium), and a red "live" signal used only for things happening now. Flat surfaces, hairline borders, generous Bangla line height, very few shadows. Colour carries meaning, never decoration.

Tokens: `design/tokens.json` → `pnpm tokens:gen` → CSS variables (web/admin) and Dart `AppTokens` ThemeExtension (Flutter). Visual reference: `design/ui-reference.html`.

## 1. Principles
1. **Reading first.** Question text is the hero: 17 px, line-height 1.7, max 720 px wide on web.
2. **One primary action per screen**, full-width at the bottom on mobile (thumb zone).
3. **Status is never colour alone** — pair with icon + text (correct ✓, wrong ✕, live ●).
4. **Calm under time pressure.** Timer turns accent at 5 min left, live-red at 1 min; no flashing.
5. **Same product everywhere.** Web and app share tokens, flows, wording and icons (Lucide on web, `lucide_icons` on Flutter).
6. **Bangla first.** Default locale bn, Bangla digits, Bangla option labels ক খ গ ঘ ঙ.

## 2. Colour roles

| Role | Light | Dark | Used for |
| --- | --- | --- | --- |
| primary | #0F766E | #2DBDAE | Main buttons, selected option, links, active nav |
| accent | #E39B14 | #F2B53D | Streak, rank badges, premium crown, timer warning (fills; saffron text on soft backgrounds uses `accentText` #92640D / #F2B53D) |
| live | #C52E46 | #FF5A73 | "LIVE" pill, running exam card edge, last-minute timer |
| success / danger | #147C3B / #C62828 | #3FCB74 / #F2706B | Correct / wrong answers, form errors |
| bg / surface | #F7F8F6 / #FFFFFF | #0D1412 / #141D1A | Page / cards |
| text / textMuted | #14201B / #55635C | #E8EEEA / #A3B1AA | Body / secondary |

All text pairs meet WCAG AA 4.5:1 (check with the tokens generator's contrast test).

## 3. Typography

| Token | Size / weight | Use |
| --- | --- | --- |
| display | 32 / 700 | Result score |
| h1 | 26 / 700 | Screen titles (web) |
| h2 | 22 / 600 | Section titles |
| h3 | 18 / 600 | Card titles |
| question | 17 / 500, lh 1.7 | Question stem |
| option | 16 / 400, lh 1.6 | Option text |
| body | 16 / 400 | Body |
| bodySm | 14 / 400 | Meta, secondary |
| caption | 12 / 500 | Labels, chips |
| timer / stat | 20 / 600 tabular, 28 / 700 tabular | Timer, numbers |

Fonts: **Hind Siliguri** (Bangla) + **Inter** (Latin), both Google Fonts, bundled in the Flutter app (no network font loading) and self-hosted via `next/font` on web. Math via KaTeX (web) / flutter_math_fork (app).

## 4. Layout
- Spacing scale 4-pt: 4, 8, 12, 16, 20, 24, 32, 40, 48, 64.
- Mobile: 16 px side padding, cards radius 16, list items radius 12.
- Web student: top nav + left sidebar (≥ 1024 px), content max 1120 px; exam room is focus mode (no sidebar, max 720 px question column + 280 px navigator panel on the right).
- Admin: left sidebar 248 px, top bar with search, dense tables (row height 44), page max width fluid.

## 5. Core components
Build once in `packages/ui` (React) and `apps/mobile/lib/shared/widgets` (Flutter) with the same names and props.

| Component | Spec |
| --- | --- |
| `AppButton` | variants primary / secondary (outline) / ghost / danger; sizes md 52 h, sm 40 h; radius 12; loading spinner replaces label; full width on mobile |
| `OptionTile` | min-height 56, radius 12, 1.5 px border; left badge 32×32 circle with ক/খ/গ/ঘ; states idle / selected / correct / wrong / missed (tokens `option.*`); tap target whole tile; haptic light on select (mobile) |
| `QuestionCard` | number chip "প্রশ্ন ১২/১০০", topic chip, bookmark + report icons, rich HTML body, image tap-to-zoom |
| `TimerBar` | sticky top in exam room: remaining time (tabular), thin progress bar under it; colours primary → accent (≤ 5 min) → live (≤ 1 min) |
| `QuestionNavigator` | grid of numbered circles 40 px: answered (primary fill), unanswered (outline), marked (accent ring), current (bold ring); legend; on mobile in bottom sheet, on web right panel |
| `ExamCard` | title, category chip, start time (relative "আজ রাত ৯টা"), duration · questions · marks, participants, LIVE pill or countdown, CTA; left 4 px edge in live colour when running |
| `StatTile` | label caption + big number (stat) + optional delta |
| `ScoreRing` | circular progress 140 px, score/total centre, accuracy below |
| `RankBadge` | accent soft background, trophy icon, "মেধাক্রম ১২৪ / ৮,৫৪০" |
| `PremiumLock` | blurred content + crown + "প্রিমিয়াম দিয়ে আনলক করুন" CTA → packages |
| `EmptyState` | 120 px line illustration, title, one-line help, optional action |
| `ErrorState` | icon, message from error code, "আবার চেষ্টা করুন" |
| `Skeleton` | shimmer blocks matching final layout (no spinners for lists) |
| `Chip`, `Badge`, `Tabs`, `SegmentedControl`, `BottomSheet`, `Dialog`, `Toast/Snackbar`, `TextField` (52 h, label above, helper/error below), `OtpInput` (6 boxes, autofill SMS), `SearchBar`, `ProgressBar`, `Avatar`, `ListTile` | Standard, token-driven |

## 6. Motion
- Screen transitions: platform default (Cupertino on iOS, fade-through on Android/web) 220 ms.
- Option select: 150 ms background fade + badge scale 0.9→1.
- Result reveal: score ring animates 0→score over 800 ms, numbers count up; confetti only for top 10% (respect reduced motion).
- Never animate during the last minute of an exam except the timer colour.

## 7. Iconography & illustration
Lucide icons, 1.75 stroke, 20/24 px. Illustrations: simple 2-colour line art using primary + accent (empty states, onboarding). App icon: rounded square primary background with a white check inside a circle-ish "ক" mark (to be designed; placeholder in Phase 0).

## 8. Accessibility checklist
- Touch targets ≥ 48; focus rings visible on web (2 px `focusRing`, offset 2).
- Screen reader labels on icon buttons and navigator cells ("প্রশ্ন ১২, উত্তর দেওয়া হয়েছে").
- Text scales to 130% without clipping; options wrap.
- Dark mode parity on every screen.

## 9. Content & tone
Friendly, short, encouraging Bangla. Examples: "দারুণ! আজকের লক্ষ্য পূরণ হয়েছে", "আর ৫ মিনিট বাকি", "ইন্টারনেট নেই — উত্তরগুলো ফোনে সংরক্ষিত আছে". All strings live in ARB (Flutter) / JSON (next-intl) with the same keys: `app/lib/l10n/app_bn.arb` ↔ `apps/web/messages/bn.json`.
