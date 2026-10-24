# Prompt 12 — Track M (Flutter): Phase 1 auth, onboarding, home, shell

---

Read `CLAUDE.md`, `docs/05-DESIGN-SYSTEM.md`, `docs/06-SCREENS.md` sections A, B, C, J, and open `design/ui-reference.html` (screen C1). You own `apps/mobile`.

Build against the mock (`--dart-define=API_BASE=http://10.0.2.2:4010/v1`) using the generated `api_client` package wrapped in repositories (`features/*/data`).
- Splash with `settings/public` check → force-update screen (FR-APP-01) and maintenance screen (FR-APP-02).
- Screens B2–B10, C1 Home, bottom navigation shell (StatefulShellRoute), J2–J4.
- Auth: tokens in flutter_secure_storage; dio interceptor that refreshes once on 401 with a lock so parallel requests wait; `SESSION_REVOKED` → `/device-limit`.
- Device id: UUID generated once, stored in secure storage, sent as `X-Device-Id`.
- OTP input with SMS autofill (Android `sms_autofill`/User Consent API; iOS `oneTimeCode`).
- l10n via ARB (same keys as web), Bangla digits formatting helper, theme light/dark/system persisted.
- Riverpod providers per feature; go_router redirects on auth state.
- Widget tests for login form validation and home states (loading/empty/error/success); golden tests for OptionTile and Home in light/dark.
Match the reference look exactly with tokens only. Report mock gaps.
