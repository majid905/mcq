---
name: Contract change
about: Dev B asks Dev A for a new or changed API endpoint/field
title: "contract: GET /public/landing for live-exam and social-proof figures"
labels: contract-change, owner:majid
---

## Needed for
K Landing (docs/06-SCREENS.md K, FR-WEB-01), redesigned on branch `b/landing-redesign` from
`design/landing/`. The hero shows the next live exam with a countdown and enrolment count, the
last live test's merit list, and a rating / learner count. None of these have a public source
today (`GET /exams` needs a session), so the page currently hides those numbers instead of
showing made-up ones. The countdown and enrolment line appear automatically once this exists
(`HeroLiveCard` already takes the `next_live_exam` shape below).

## Endpoint
`GET /public/landing` (new, `security: []`, `Cache-Control: public, max-age=60`)

## Request
```json
// no body; Accept-Language picks bn/en titles
```

## Response `data`
```json
{
  "next_live_exam": {
    "id": "5002",
    "title": "BCS লাইভ মডেল টেস্ট — ১৩",
    "starts_at": "2026-10-30T15:00:00.000Z",
    "question_count": 100,
    "duration_min": 60,
    "negative_mark": 0.5,
    "enrolled_count": 320
  },
  "last_live_exam": {
    "id": "4990",
    "title": "BCS লাইভ মডেল টেস্ট — ১২",
    "participants": 1240,
    "top": [
      { "rank": 1, "name": "সাদিয়া আক্তার", "district": "ঢাকা", "score": 91.5 },
      { "rank": 2, "name": "তানভীর হাসান", "district": "রাজশাহী", "score": 89 },
      { "rank": 3, "name": "নুসরাত জাহান", "district": "সিলেট", "score": 88.5 }
    ]
  },
  "rating": { "average": 4.83, "count": 312 },
  "learner_count": 1258
}
```

- `next_live_exam`: the next published, non-premium-only live exam that has not started; `null` if none.
- `last_live_exam`: the most recent finished live exam with published results; `null` if none.
  Names only for users who allow public leaderboard display (same rule as `/exams/{id}/leaderboard`).
- `rating`: from app-store or in-app ratings, whichever the product owner confirms; `null` until
  there is a real source. `learner_count`: registered students (rounded down to the nearest 10 is fine).

## Error codes
None besides the standard envelope; on failure the landing page renders without these figures.

## Blocking?
- [ ] Yes, screen cannot continue
- [x] No, using mock workaround meanwhile (figures hidden; merit list shown as labelled sample)
