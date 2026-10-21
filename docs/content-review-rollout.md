# Content review rollout (2026-10-21)

## Implemented server behavior (activation held until frontend release)

- Five distinct reporters hide a content item. One reporter counts once per item.
- Ten distinct reporters across an author's active reports suspend publishing indefinitely pending administrator review. This is independent of paid membership and existing timed mutes/bans.
- Administrators approve/restore, reject/remove from display, release this report suspension, or keep a permanent publishing suspension. Existing account bans and timed mutes remain separate.
- Approved false reports no longer contribute to thresholds. Previously handled reports cannot be replayed to hide the same item again.
- A serious report can be hidden immediately by an administrator without waiting for five people.
- RLS and privileged room/member/featured-post readers filter hidden content. Private-message reporting checks conversation participation; password-room messages require membership. Room media preview is administrator-only.
- Revisions protect against stale review decisions. Snapshots, decisions and report records are stored separately from public content, with export from the management client.
- Content and account results generate system notifications. Users can submit an appeal through existing problem feedback.
- Redacted realtime invalidations and a visible-page fallback check remove stale displayed/cached content. Events contain IDs and visibility only, no message text or reporter identity.

## Automatic review: deliberately NOT enabled

Public repository publication was blocked by automatic approval review. Report thresholds are staged with `reports_enabled=false` until the administrator client is available; enable only after the user authorizes source publication and the frontend release passes checks.

No content-review provider or credentials were configured in the project. The database switch remains false. The new Edge Function and policy contract are integration scaffolding, not a claim that automatic review is running.

An adapter must accept `{id, revision, kind, snapshot, policy}` and return `{decision: 'allow'|'review'|'reject', reason, complete: true, media_complete: true}`. Only a fully completed review can approve; missing credentials, exceptions, timeout, unknown results and incomplete media remain pending. Provider credentials belong only in Edge Function secrets `CONTENT_REVIEW_ENDPOINT` and `CONTENT_REVIEW_KEY`.

Before enabling, finish provider integration and test all pending-submission UX (including existing INSERT RETURNING clients, room creation, optimistic private messages and poll option voting). Add staged nickname/avatar/member-intro review without hiding identity records used for authentication. Confirm complete image OCR/GIF/video coverage and the provider's actual categories. Do not enable the switch merely because the webhook deploys.

## Validation

`supabase/tests/content-review.sql` uses disposable identities inside a rollback transaction and checks distinct thresholds, duplicate reports, RLS hiding, permission checks, stale revisions, suspension/restoration, report replay and fail-closed machine decisions. It was run successfully against the connected database; fixtures were rolled back and the automatic switch remained false.

`tests/content-review.test.mjs` covers the provider contract and failed/incomplete results. Browser specs cover report submission and loaded-content invalidation; existing Windows/web/admin release checks also apply. Local browser execution was blocked by the unavailable browser runtime, so CI browser checks are required before release.
