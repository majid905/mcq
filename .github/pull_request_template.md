## What
<!-- One feature or screen. Link the issue if any. -->

## Requirement IDs
<!-- e.g. FR-EXAM-07, FR-EXAM-08 -->

## Owner
- [ ] Dev A (backend) — branch `a/...`
- [ ] Dev B (frontend) — branch `b/...`

## Contract
- [ ] No change to `openapi.yaml`
- [ ] Changed `openapi.yaml` (Dev A only) and ran `pnpm contract:gen` — list endpoints/fields:

## How to test
<!-- Commands, URLs, test accounts (mock OTP 123456) -->

## Screenshots (frontend)
<!-- bn + en, light + dark for each new screen -->

## Checklist
- [ ] Lint, typecheck, unit tests pass
- [ ] Contract tests (API) / Playwright e2e (web) pass for touched flows
- [ ] Loading, empty, error states (frontend)
- [ ] No hardcoded colours, secrets or `console.log`
- [ ] Only files in my owner's folders (or shared files explained above)
