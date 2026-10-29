# Handoff: টিকযাত্রা — Landing Page

## Overview
Marketing landing page for **টিকযাত্রা** (TikJatra), a Bangla exam-prep platform for BCS, Bank, Primary and NTRCA (9th–20th grade) government job exams. The page's main jobs are: (1) get visitors to download the app (Google Play / App Store), (2) let web users start a free model test in the browser, (3) explain the product: live tests, instant results with explanations, rank, weak-topic practice, and pricing.

All copy is Bangla and all numerals are Bangla digits (০–৯). Light and dark themes are both designed.

## About the Design Files
The files in this bundle are **design references created in HTML**: prototypes showing the intended look, copy and behaviour. They are **not production code to paste in**. Your task is to **recreate this design inside the existing codebase** (its framework, component library, routing, i18n and styling approach), reusing existing components wherever they match (buttons, cards, accordions, header/footer shells).

`Landing Page.dc.html` is a self-contained prototype. It opens directly in a browser alongside `support.js` (its runtime) and `assets/`. The template markup sits between `<x-dc>` tags. All styling is inline, using the CSS variables listed below. Logic (state, timers, data arrays) lives in the `<script type="text/x-dc">` block as a `class Component`, which behaves like a React class component. `{{ name }}` holes in the markup are values returned from `renderVals()`.

## Fidelity
**High-fidelity.** Colours, typography, spacing, copy, and animations are final. Recreate the page pixel-close. Where the codebase already has an equivalent token or component, map onto it instead of duplicating.

## Global layout
- Content max-width **1280px**, centered. Horizontal padding `clamp(16px, 4cqi, 56px)`. Section vertical padding `clamp(56px, 8cqi, 112px)`. (`cqi` = container width units, root is a size container; plain `vw` is an acceptable substitute.)
- Breakpoints (by page width): **desktop ≥ 1060px**, **tablet 720–1059px**, **mobile < 720px** (target 360–430px).
- Alternate section bands: `--bg` and `--sf` with `1px solid var(--ln)` top/bottom borders (Try-one-question, Result preview).
- Card language: `background: var(--sf)`, `border: 1px solid var(--ln)`, radius **16–24px**, shadow `0 1px 2px var(--shc), 0 12px 32px -18px var(--shc)` (soft). No gradients except the subtle tint shapes noted.
- Buttons: primary `min-height: 48px`, radius 12px, `background: var(--pr)`, `color: var(--onpr)`, weight 600. Hover: `background: var(--prh)` + `translateY(-2px)`, transition `.35s cubic-bezier(.22,1,.36,1)`.
- Section heading pattern: H2 in `--fd`, weight 600–700, `clamp(28px, 3.2cqi, 44px)`, line-height 1.2, `text-wrap: balance`. Subline `--ink2` 17–18px. Headings for Features, Reviews and Pricing are **center-aligned**. Other sections are left-aligned. No eyebrow chips above section titles (removed on purpose), except where the copy below lists a small label.

## Sections (top → bottom)

### 1. Header (sticky)
- `position: sticky; top: 0`, `background: var(--hdr)` + `backdrop-filter: blur(14px)`, bottom border `--ln`.
- Left: **logo** (see Logo below, 22px). Center/right nav: পরীক্ষা · প্রশ্নব্যাংক · প্যাকেজ · অ্যাপ. Right: theme toggle (icon button), লগইন (text), primary button **ফ্রি মডেল টেস্ট দিন**.
- < 1060px: nav collapses into a hamburger. The menu panel drops down with the same links plus লগইন.

### 2. Hero (variant A, "Live exam")
Grid `minmax(0,46fr) minmax(0,54fr)` on desktop, single column below. Must fit in one viewport at 1440×900, and the store badges must be visible without scrolling on mobile.

**Left column**
- **Eyebrow chip** "BCS · ব্যাংক · প্রাইমারি · NTRCA": pill, `--prs` bg, `--pri` text, 14px/600, with a small pulsing dot. Glow animation `glow` (box-shadow breathing in primary tint, ~3s ease-in-out infinite).
- **H1**: "সবার সঙ্গে লাইভ পরীক্ষা, সঙ্গে সঙ্গে আসল র‍্যাংক". `--fd`, 700, `clamp(36px, 4.6cqi, 64px)`, line-height 1.15, max 2–3 lines. "আসল র‍্যাংক" gets an amber highlighter underline (`--ac` band behind the lower ~35% of the glyphs).
- **Subline**: "প্রতি সপ্তাহে লাইভ মডেল টেস্ট — জমা দিলেই ফল, প্রতিটি প্রশ্নের ব্যাখ্যা আর দুর্বল টপিকের প্র্যাকটিস।" `--ink2`, 18px, max ~46ch.
- **Store badges**: official artwork `assets/badge-google-play.png`, `assets/badge-app-store.png`, **48px high**, side by side (gap 12px), each an `<a>` to the store. Hover: lift `translateY(-3px)` plus a soft shadow bloom, `.45s cubic-bezier(.22,1,.36,1)`. Don't redraw the logos.
- **Web link**: "অথবা ব্রাউজারে ফ্রি টেস্ট শুরু করুন →" in `--pr`, 16px/600. Hover: the arrow slides off to the right and a new arrow slides in from the left (two stacked arrows in an `overflow:hidden` box, `translateX(100%)` / `translateX(-100%) → 0`, .4s).
- **Trust row**: 5 amber stars + **৪.৮৩**, divider, **১,২৫৮+ শিক্ষার্থী**.

**Right column**: live-test card stack
- **Live test card** (`--sf` card, radius 24): "লাইভ" red badge with ping dot + "এনরোলমেন্ট চলছে". Title "BCS লাইভ মডেল টেস্ট — ১৩", meta "১০০ প্রশ্ন · ৬০ মিনিট · ভুলে −০.৫০". **Countdown**: 3 cells (ঘণ্টা / মিনিট / সেকেন্ড), ticking every second to the next **21:00 local time**, Bangla digits, tabular numerals, 28–36px. Footer: "৩২০ জন এনরোলমেন্ট করেছেন" + secondary button **রিমাইন্ডার দিন**.
- **Leaderboard card** "গত লাইভ টেস্টের মেধাতালিকা · ১,২৪০ জন অংশ নিয়েছেন": rows 1 সাদিয়া আক্তার (ঢাকা) ৯১.৫ · 2 তানভীর হাসান (রাজশাহী) ৮৯ · 3 নুসরাত জাহান (সিলেট) ৮৮.৫ · ⋮ · highlighted "you" row **৮৭ · আপনি · আগের চেয়ে ১২ ধাপ উপরে ↑ · ৭২.৫** in `--prs`. Rows animate in with `rowin` (opacity + translateX(-14px)), staggered ~80ms. Small "নমুনা তথ্য" (sample data) label.
- On-load order: card fades/rises in first, then the leaderboard rows stagger.

### 3. Try one question (`#try`, `--sf` band)
- Two columns (left text, right interactive question card); stacks on mobile.
- Left: chip "সাইন আপ ছাড়াই", H2 "একটি প্রশ্নের উত্তর দিয়ে দেখুন", body text, question switcher pills প্রশ্ন ১ / ২ / ৩, then a **benefit list card** (3 rows with icon tiles, divided by 1px lines): প্রতিটি উত্তরের ব্যাখ্যা / বিগত প্রশ্নের ধরনে তৈরি / সাইন আপ ছাড়াই শুরু. Then primary button **পূর্ণ ফ্রি মডেল টেস্ট দিন →**, which links to the Exam page.
- Right card: subject + topic tag, question, 4 options labelled ক খ গ ঘ (2-col grid on desktop, 1-col mobile). On select: the correct option turns `--oks`/`--ok` with a check icon and a "সঠিক উত্তর" tag. A wrong pick turns `--ers`/`--er` with "আপনার উত্তর". The explanation panel expands (grid-rows `0fr → 1fr`, .45s). Footer: "[সংখ্যা]% পরীক্ষার্থী এই প্রশ্নে সঠিক উত্তর দিয়েছেন" (**placeholder, fill with real data**) + "আরেকটি প্রশ্ন" button that cycles the questions.
- Question data: `TRY` array in the script (subject, source, text, options, answer index, explanation).

### 4. How it works
- H2 "যেভাবে কাজ করে / তিন ধাপে নিয়মিত প্রস্তুতি", subline "সাইন আপ থেকে প্রথম ফল পর্যন্ত লাগে এক বসার সময়।"
- 3 step cards in a row (desktop). Number badge (১/২/৩) and title are **center-aligned**. A dashed connector line between the steps animates its width 0 → 100% when the section scrolls into view (IntersectionObserver).
- Each card has an auto-looping mini animation (**no hover/click effects on these cards**):
  1. **লক্ষ্য বাছাই**: category chips. The selection cycles BCS → ব্যাংক → প্রাইমারি → NTRCA every ~2.6s, and the caption below cross-fades to match (`HWCAP`).
  2. **পরীক্ষা দিন**: a question from `HWQ`. A simulated tap selects an option, it is marked correct/wrong, then the next question cross-fades in. Loops.
  3. **দুর্বল টপিক ঠিক করুন**: topic bars with a weak topic highlighted, plus an "practice" tap animation.
- Use cross-fades only (opacity .5–.6s ease). Respect reduced motion.

### 5. Features bento (`#features`)
- Centered H2 "যা যা পাচ্ছেন / প্রস্তুতির জন্য যা দরকার, এক জায়গায়".
- CSS grid areas: desktop `"a a b b" "a a c d" "f f e e" "g g g g"`, tablet `"a a" "b b" "c d" "f f" "e e" "g g"`, mobile single column.
  - **a** "যেকোনো সময় ১০০ নম্বরের পূর্ণ টেস্ট": OMR answer-sheet grid of 100 bubbles. **70 answered** (filled `--pr`), a few "রিভিউর জন্য রাখা" (amber), rest empty. Legend: উত্তর দেওয়া / রিভিউর জন্য রাখা / বাকি. Some bubbles pulse with `bfill`/`ripple`. Meta: ১০০ প্রশ্ন · ৬০ মিনিট · প্রতি ভুলে −০.৫০.
  - **b** "তাৎক্ষণিক ফল, প্রতিটি প্রশ্নের ব্যাখ্যা": answer chips (wrong vs correct) + explanation line + সঠিক ৭৯ / ভুল ১৩ / বাদ ৮.
  - **c** Rank: "৮৭তম · ১,২৪০ জনের মধ্যে · শীর্ষ ৭%", ring fill animation (`ringfill`).
  - **d** "বিগত বছরের প্রশ্ন · ১০ম–৪৬তম".
  - **e/f/g**: bilingual search demo ("বাংলা বা English — যেভাবে খুশি খুঁজুন", typed query + highlighted result) and the remaining tiles as in the prototype.

### 6. Result preview (`--sf` band)
- Left: H2 "ফল মানে শুধু নম্বর নয় — পরের পদক্ষেপ", body, then **5 checkmark bullets**: বিষয়ভিত্তিক নম্বর ও সময় / র‍্যাংক ও পার্সেন্টাইল… / শক্তিশালী ও দুর্বল টপিক… / প্রতিটি টপিকে কতটি সঠিক… / সব ভুল উত্তর ব্যাখ্যাসহ….
- Right: result card. Score "/ ১০০", সঠিক/ভুল/স্কিপ, rank, per-subject **progress bars**, then **topic capsules** (strong ↑ in green, weak ↓ in red) under "শক্তিশালী ও দুর্বল টপিক".
- Several sample results (`RES`) **cross-fade** on a timer (no dots or pager).
- **Capsule hover/focus** shows a small tooltip with the insight note (`tipin` animation; flips left/right near edges). No box-shadow on capsule hover, only a border/background tint. Hint pill above: pointer icon + "বিস্তারিত দেখতে পয়েন্টার রাখুন" on a `--prs` background, static (no animation).

### 7. Reviews
- Centered H2 "পরীক্ষার্থীদের কথা / যাঁরা নিয়মিত টেস্ট দিচ্ছেন".
- Two horizontal **marquee tickers** (opposite directions), cards = quote + name + district (`REV` data, dummy). Animation `marquee` = translateX(calc(-50% − gap/2)), linear infinite, list duplicated for a seamless loop. Pause on hover. Edge fade masks left/right.

### 8. Pricing (`#pricing`)
- Centered H2 "প্যাকেজ / প্রস্তুতির মেয়াদ অনুযায়ী বেছে নিন" + centered intro.
- 4 plan cards: **ফ্রি ৳০**, **মাসিক ৳১৪৯ / মাস**, **৬ মাস ৳৬৯৯ (মাসে ৳১১৭)**, **বার্ষিক ৳৯৯৯ (মাসে মাত্র ৳৮৩)**, with the badge "সবচেয়ে সাশ্রয়ী" on the 6-month plan and a primary-coloured border. Each card has feature bullets with checks and a full-width CTA. Exact copy is in the prototype.

### 9. App download (`#app`)
- Rounded panel (`--fx` green surface) with H2 "বাসে, অফিসের বিরতিতে, রাতে — অ্যাপেও একই অ্যাকাউন্ট", body "ওয়েবে যেখানে থামলেন…", store badges (48px), and feature points.
- Right: **phone mockup** of the app dashboard (status bar ৯:৪১, greeting "শুভ সন্ধ্যা, রাফি", exam countdown "৪৬তম BCS প্রিলি · আর ৪২ দিন", 7-day streak, continue-test card "৩১/১০০ · ৪২ মিনিট বাকি", weekly goal ৩/৫, rank trend sparkline ৮৭তম ↑১২, recent results). Two floating capsules overlap the phone screen edge, inset ~30–35px: "র‍্যাংক আপডেট লাইভ", "নিজে থেকে সিঙ্ক".
- Background: slow drifting dot field (`APPDOTS`, `drift` keyframes, a few px). Static in reduced motion.

### 10. FAQ (`#faq`)
- max-width 920px. H2 "সাধারণ প্রশ্ন". Accordion (`FAQ` data), one item open at a time. The +/− icon rotates and the body expands with grid-rows `0fr → 1fr`.

### 11. Footer
- `--sf` background, top border. Grid desktop `1.6fr .8fr .9fr 1.2fr`, tablet 2 cols, mobile 1 col.
- Col 1: logo (28px), tagline "সরকারি চাকরির পরীক্ষার জন্য নিজের সময়ে পূর্ণ মডেল টেস্ট, ব্যাখ্যা আর আসল র‍্যাংক।", store badges, **social icon buttons** (36px circles, 1.5px `--ln2` border, 15px icons): Facebook, YouTube, LinkedIn, Instagram. Hover: fill `--pr`, icon `--onpr`.
- Col 2 পরীক্ষা: BCS, ব্যাংক, প্রাইমারি, NTRCA, ৯ম–২০তম গ্রেড. Col 3 সাহায্য: সাধারণ প্রশ্ন, প্যাকেজ ও পেমেন্ট, অ্যাপ ডাউনলোড, যোগাযোগ. Col 4 যোগাযোগ: support@tikjatra.com, ০১৭ *** **** (placeholder), সকাল ১০টা–রাত ১০টা.
- Bottom bar: © ২০২৬ টিকযাত্রা · গোপনীয়তা নীতি · শর্তাবলি · আমাদের সম্পর্কে.
- Oversized faint wordmark "টিকযাত্রা" bleeding off the bottom edge (decorative, `user-select:none`, ~6% ink opacity).

## Logo (variant 1d "যাত্রাপথ")
Typographic: **টিকযাত্রা** in Anek Bangla 700, `font-stretch: 110%`, line-height 1. Below it a "path" row: a small dot (`--pr`, 0.24×font-size) → dashed line (2px, dash 5 / gap 4, `--pr`, flex:1) → amber circle (`--ac`, 0.42×font-size) holding a dark check (`#15171C`, stroke 4). Gap between word and path ≈ 0.14×font-size. Sizes used: header 22px, footer 28px, exam header 19px. In dark mode `--pr` swaps automatically. See `Logo.dc.html` (#1d) for the light/dark/app-icon renders. **The final logo should be redrawn as a vector (SVG).** The current version is built from type and shapes.

## Interactions & Behaviour summary
- Theme toggle (header): sets light/dark. Implement with `data-theme="dark"` on `<html>` and the token overrides in `tokens.css`. Persist the choice and default to `prefers-color-scheme`.
- Countdown: next 21:00 local, ticks each second.
- Try-one-question: select → reveal → next. Local state only.
- How-it-works loops: setInterval-driven (~2.6s steps). Start when the section is in view, stop when it leaves.
- Result card rotation: cross-fade every ~5s. Pause while a capsule tooltip is open.
- Reviews marquee: CSS only. Pause on hover.
- FAQ: single-open accordion.
- **Reduced motion**: `@media (prefers-reduced-motion: reduce)` disables every animation and transition. Loops should also not start (show the first state statically).
- All decorative animation uses transform/opacity only.

## State (prototype → suggested)
`theme`, `menuOpen`, `tryQuestionIndex`, `trySelected`, `howItWorksTick`, `resultIndex`, `activeTooltip`, `faqOpenIndex`. No data fetching in the prototype. These should be wired to real data later:
- Hero rating (৪.৮৩), learner count (১,২৫৮+), live test info, enrolment count (৩২০), leaderboard: from the API.
- "[সংখ্যা]%" correct-rate on Try-one-question, "[সংখ্যা] প্রশ্ন" in Features: placeholders.
- Reviews are dummy text. Replace them with real testimonials before launch.

## Design Tokens
All colours are CSS variables, defined in **`tokens.css`** (light on `:root`, dark on `[data-theme="dark"]`) together with every `@keyframes` used.

| Token | Role | Light | Dark |
|---|---|---|---|
| `--bg` | Page background | `#F7F5F0` | `#0F1513` |
| `--sf` | Surface / card | `#FFFFFF` | `#17201D` |
| `--sf2` | Surface 2 (inset) | `#EFECE5` | `#1E2925` |
| `--ink` | Text primary | `#15171C` | `#ECEEEA` |
| `--ink2` | Text secondary | `#464A52` | `#C3CBC7` |
| `--ink3` | Text tertiary | `#5B6170` | `#9AA8A2` |
| `--ln` | Border | `#E6E2DA` | `#26332F` |
| `--ln2` | Border strong | `#D5D2CB` | `#3A4A45` |
| `--pr` | Primary | `#0E5E4E` | `#3CC4A2` |
| `--prh` | Primary hover | `#0A473B` | `#5AD3B4` |
| `--onpr` | On primary | `#FFFFFF` | `#0F1513` |
| `--prs` | Primary soft bg | `#E3F0EC` | `#16302A` |
| `--pri` | Primary ink (on soft) | `#0A473B` | `#3CC4A2` |
| `--ac` | Accent (amber) | `#F2A93B` | `#F2A93B` |
| `--acs` | Accent soft | `#FCEFD6` | `#3A2B12` |
| `--wn` | Warning | `#D98E04` | `#D98E04` |
| `--aci` | Accent ink | `#8A5508` | `#F5C57A` |
| `--ok` | Success | `#1E9E5A` | `#1E9E5A` |
| `--oks` | Success soft | `#E4F4EA` | `#143323` |
| `--oki` | Success ink | `#14532D` | `#7FD9A5` |
| `--er` | Error | `#E0533D` | `#E0533D` |
| `--ers` | Error soft | `#FBE7E3` | `#3B1E19` |
| `--eri` | Error ink | `#7A2414` | `#F59A8A` |
| `--rv` | Review (indigo) | `#5B5BD6` | `#5B5BD6` |
| `--rvs` | Review soft | `#ECECFB` | `#25264A` |
| `--rvi` | Review ink | `#2E2E8A` | `#B8BBFB` |
| `--fx` | Fixed brand green | `#0E5E4E` | `#3CC4A2` |
| `--shc` | Shadow colour | `rgba(21,23,28,.10)` | `rgba(0,0,0,.5)` |
| `--hdr` | Sticky header bg | `rgba(247,245,240,.88)` | `rgba(15,21,19,.86)` |
| `--fd` | Display font stack | `'Inter','Anek Bangla',sans-serif` | `'Inter','Anek Bangla',sans-serif` |
| `--fb` | Body font stack | `'Inter','Hind Siliguri',sans-serif` | `'Inter','Hind Siliguri',sans-serif` |

**Typography**
- Display (`--fd`): **Anek Bangla** (variable, wdth 75–125, wght 400–800) for Bangla + Inter for Latin. Used for headings, numbers, logo.
- Body (`--fb`): **Hind Siliguri** 400/500/600/700 for Bangla + Inter for Latin.
- Google Fonts URL: `https://fonts.googleapis.com/css2?family=Anek+Bangla:wdth,wght@75..125,400..800&family=Hind+Siliguri:wght@400;500;600;700&family=Inter:wght@400;500;600;700&display=swap`
- Scale: H1 clamp(36–64px) · H2 clamp(28–44px) · H3 20–24px · body 16–18px · small 14px · minimum 12px inside mockups. Bangla body line-height 1.6–1.7, headings 1.15–1.25. Use `font-variant-numeric: tabular-nums` on counters and scores.

**Radii**: 8 (chips/small), 10–12 (buttons, inputs, icon tiles), 16 (cards), 20–24 (large panels), 999 (pills).
**Shadows**: soft card `0 1px 2px var(--shc), 0 12px 32px -18px var(--shc)`. Floating mockup `0 30px 60px -30px var(--shc)`.
**Spacing**: 4px base. Common gaps 8 / 12 / 16 / 24 / 32 / 48. Section padding clamp(56–112px).
**Easing**: `cubic-bezier(.22,1,.36,1)` for hovers and entrances. Durations .3–.6s.

## Number formatting
Convert all digits to Bangla: `String(x).replace(/\d/g, d => '০১২৩৪৫৬৭৮৯'[d])`. Use the Bangla thousands separator style `১,২৪০`. Option labels are ক খ গ ঘ.

## Assets
- `assets/badge-google-play.png`, `assets/badge-app-store.png`: official store badges, retouched to a uniform 48px display height. Use the official badge guidelines and links in production.
- Icons: simple inline SVG strokes (24px viewBox, 2–2.2 stroke, round caps). Swap in the codebase's icon set (e.g. Lucide) where equivalents exist. Social icons are brand glyphs (Facebook, YouTube, LinkedIn, Instagram).
- No photography is used.

## Files in this bundle
- `Landing Page.dc.html`: the full landing page prototype (open in a browser, keeping `support.js` and `assets/` alongside). Sample data arrays (`TRY`, `HWQ`, `HWCAP`, `RES`, `REV`, `FAQ`, `APPDOTS`, `OMR`) are in the script block at the bottom, along with the `DARK` token map.
- `Logo.dc.html`: logo explorations. The chosen variant is **1d**.
- `tokens.css`: ready-to-use CSS variables (light + dark), keyframes and the reduced-motion rule.
- `support.js`: prototype runtime only, **not** needed in your codebase.
- `assets/`: store badges.

## Suggested implementation steps for Claude Code
1. Add `tokens.css` (or map its values into the existing theme/Tailwind config) and the Google Fonts link.
2. Build the `Logo` component (SVG or the type+shapes construction above).
3. Build the sections as separate components in the order above, reusing existing Button / Card / Accordion primitives.
4. Port the sample data arrays into typed constants (later replaced by API data).
5. Implement the animations with CSS keyframes from `tokens.css`. Gate the JS loops behind IntersectionObserver and `prefers-reduced-motion`.
6. Check against the prototype at 1440×900, 1024, 768, 390 and 360 widths, in light and dark.
