# Handoff — for the next developer

Read this **after** `AGENTS.md` (the behavioral spec — workflow rules, roles, conventions, file
map). This file is not a spec and not a log — it's the state a new session needs to *pick up*
current work: what's still open, what to watch out for operationally, and where things live.

**For the full dated history of what shipped, see `CHANGELOG.md`.** This file used to accumulate a
growing narrative of every session's work (with verification notes, concurrent-session
coordination details, etc.) under a "§8 Active/in-progress development" section — that content has
been moved into `CHANGELOG.md` and this file was rewritten to be short again. **Keep it that way**:
when you finish and verify a piece of work, write one dated `CHANGELOG.md` entry for it (condensed —
what changed and why, not a session narration) and only touch this file if something about it
should change what the *next* session needs to know or do differently. Don't let this file regrow
into a log; that's what silently happened for two days before this rewrite, and `CHANGELOG.md`
stopped being updated as a result.

The app is **live with real users** — treat data and email as production, on every environment
(there is no email-redirect safety net — see below).

---

## Read this before touching real accounts or sending email

- **⚠️ Every account's passcode is currently the shared value `A00a00`.** All live accounts —
  real STUDENT/PROFESSOR/ADMIN/SUPER_ADMIN accounts, not just test ones — were bulk-reset to this
  one known value for local testing convenience (see `CHANGELOG.md` 2026-09-07/09-09). Anyone who
  knows this string can currently log in as **any** user. This is a genuine, unresolved security
  issue on a live app. Fix: reset real users back to individually-random passcodes (an ADMIN's
  per-user "รีเซ็ตรหัสเข้าใช้งาน" button already does this one at a time) and remove this warning
  once done.
- **No environment redirects outgoing email.** `EMAIL_OVERRIDE_TO` was removed entirely
  (2026-09-07) — local dev, Preview, Development, and Production all send real email to whatever
  address is on the account. Be careful triggering step approvals/rejections/passcode
  resets/account creation against real accounts anywhere but a throwaway test account.
- **The outgoing-mail Gmail account (`GMAIL_USER`) can hit Google's ~500/day sending-limit quota**
  (confirmed live 2026-09-09: `550-5.4.5 Daily user sending limit exceeded`). Not a code bug — every
  send path already creates/updates its DB record regardless of email outcome, and the UI now
  correctly reports send failures (see `CHANGELOG.md` 2026-09-09) instead of claiming success. Fix
  options, still undecided: wait for the daily reset, switch to the already-built Office365 SMTP
  path (`SMTP_USER`/`SMTP_PASS`, needs a Chula mailbox with Authenticated SMTP enabled), or move to
  a dedicated transactional-email provider.

---

## Where things live

| | |
| --- | --- |
| Local checkout | `C:\Users\ASUS\Desktop\Grad Tracking System\thesis-app` |
| `origin` | `https://github.com/sukhum-chula/thesis-app` |
| `upstream` | `https://github.com/Jukkruu/thesis-app` (original author, read-only reference) |
| Vercel | `thesis-app` under account `sukhums-4319` — auto-deploys on push to `main` |
| Supabase | `tluqclmgbnciymxzknhh` (region `ap-southeast-1`). The previous owner's project
  (`jttfcoisygcqqshghkmn`) is still paused-not-deleted as a rollback window — **still needs
  retiring**: revoke its service-role key once nobody needs the rollback option, then delete it. |

Also present in the working folder but not part of the app: reference Thai PDF form templates one
level up in `Grad Tracking System\` (`บ.วศ.1ก`, `บ.2`, `บ.3`, `บ.4`, exam-result form) — keep these,
they're not scratch files.

### Environment variables (Vercel + `.env.local`)

See `AGENTS.md`'s "Required env vars" section for the full annotated list — it's kept current
there, not duplicated here. Quick reminders specific to this deployment:
- `AUTH_SECRET`, not `NEXTAUTH_SECRET`.
- `NEXTAUTH_URL` is set for **Production only**; leave it unset on Preview/Development so the
  `VERCEL_URL` fallback resolves correctly per-deployment.
- `FINANCE_EMAIL` (`hare081987@gmail.com`) is the confirmed fallback recipient — the real primary
  path is the ADMIN designated as finance contact via "ตั้งค่าระบบ" (see `AGENTS.md`).
- Leave `NEXT_PUBLIC_DEMO_MODE` unset in production — it exposes the demo reset-tools card in
  `AdminUsersPanel`. (`DEMO_MODE` and `/demo`/`/api/auth/demo`, an older passwordless per-role login
  page, were removed entirely 2026-09-09 — see below.)
- `NEXT_PUBLIC_*` values are inlined at build time — changing one needs a redeploy, not just a
  restart.

---

## Database/infra gotchas a new session will get wrong

- **There is no `prisma/migrations/` directory.** The schema is managed with `prisma db push`, not
  migrations — `prisma migrate deploy` finds nothing and silently leaves a database empty. To
  create the schema on a fresh project: `npx prisma db push`.
- **`prisma db push` needs the direct connection (port 5432), not the transaction pooler (port
  6543).** Pgbouncer transaction mode doesn't support the prepared statements the migration engine
  uses — it hangs. Use the pooler only for the app's runtime `DATABASE_URL`.
- **`DATABASE_URL` must be the transaction-mode pooler on port 6543.** Session mode (`:5432`) has a
  15-client cap and caused a real `EMAXCONNSESSION` incident under production traffic.
- **After changing a Prisma schema field, restart `next dev` — don't just re-run `prisma
  generate`.** A running Turbopack dev server keeps its old compiled Prisma client in memory even
  after the client is regenerated on disk; it'll throw `PrismaClientKnownRequestError: column ...
  does not exist` on the renamed/added field until you kill the process (clear `.next/` too if the
  error persists) and restart.
- Storage bucket `thesis-files` is **private**. `FormUpload.fileUrl` stores a bare storage path,
  never a public URL — previews/downloads always resolve a short-lived signed URL through `GET
  /api/upload/[uploadId]/signed-url`. Don't reintroduce a public bucket or a stored public URL (it
  was briefly public before 2026-09-04 — every uploaded document was reachable by anyone with the
  link — that was a bug, not the design). Upload paths are `{submissionId}/...`, which
  `deleteFolder()` relies on.
- One-off DB migration scripts in this project's history were written to `scripts/`, run once via
  `npx tsx`, then deleted (not committed) — that's the established convention when only the pooler
  connection is available and a real Prisma migration isn't possible. Follow it: don't leave a
  one-off migration script sitting in the repo (see the "stray scripts" item below).

---

## Open items for whoever picks this up next

Roughly in priority order:

1. **A real human click-through smoke test has still never been done.** Every verification to date
   has been `npm run build`/`tsc`/`eslint` plus scattered real-browser spot-checks per feature (see
   `CHANGELOG.md` for which features have and haven't had one). Nobody has done one continuous
   walkthrough of a full PROPOSAL and a full THESIS_DEFENSE submission end to end as real users.
2. **Resolve the shared-passcode security issue** (see warning above) — reset every real account to
   an individual passcode.
3. **Retire the old Supabase project** (`jttfcoisygcqqshghkmn`) — pause window is long over.
4. **Browser-verify recent features that have only been build/type/lint-checked so far** (per
   `CHANGELOG.md` 2026-09-08/09-09 entries): multi-member `INVITED_EXAM_COMMITTEE` sequential
   signing + emails; draft-save leniency round-trip (empty save, partial save, reload); the
   responsive admin user-list header at `xl`+ desktop width and true mobile width; the
   email-result-reporting fix's *failure* branch for passcode-reset/email-change and for the
   `pending-professors`/`/super-dashboard` add-user forms specifically; `/professor-dashboard`'s
   rework as a real PROFESSOR account; the name-title split and editable-login-email features
   end-to-end.
5. **Fix the outgoing-mail quota problem** (see warning above) — pick one of the three options and
   do it, rather than continuing to absorb Gmail's daily cap.
6. **Decide the Vercel-deployed-URL lag.** Several recent changes have only been confirmed against
   the local dev server (same production DB) — worth a quick pass on the actual deployed URL after
   the next push.
7. **Decide what deleting a user should do to their audit trail.** Only three FKs to `users(id)`
   refuse a delete (`submissions.studentId`, `form_uploads.uploadedById`, `signatures.userId`);
   `submissions.advisorId` and `workflow_steps.actedById` are `SET NULL` — Prisma's default for an
   *optional* relation — so deleting a professor succeeds and silently erases their advisor link
   and their step-action attribution on existing submissions. The committee id columns
   (`headCommitteeId`/`programChairId`/`committeeIds`/`coAdvisorIds`/`invitedCommitteeIds`) aren't
   FKs at all, so the same delete leaves dangling ids there. Both contradict the stated intent that
   deleting an account must never silently destroy thesis records; making those two relations
   explicit `Restrict` would close the first half. Left as a deliberate decision, not a drive-by —
   see `CHANGELOG.md` 2026-09-15.
8. **Drop the now-orphaned `rate_limits` and `magic_tokens` tables** from the live DB — their Prisma
   models are gone from the schema (see below), but the tables themselves haven't been dropped yet;
   this is a real destructive action against production, so do it deliberately (one-off pooler
   script, confirm row counts are 0/don't matter first) rather than as a drive-by.

### Dead code/scripts removed 2026-09-09 (following the consistency pass above)

All of the following were reported first, then removed the same day with the project owner's
go-ahead (build/`tsc`/`eslint` re-verified clean after each step, same baseline lint count as
before):

- `scripts/assign-passcodes-no-email.ts` — untracked, already-run one-off passcode-reset script.
- `src/lib/rateLimit.ts` + the `RateLimit` Prisma model (`rate_limits` table) — orphaned since
  self-registration/forgot-password were removed. The schema model is gone; the live `rate_limits`
  table itself hasn't been dropped yet (same "orphaned table, not yet dropped" state as
  `magic_tokens` — see the 2026-09-09 magic-link removal in `CHANGELOG.md` — drop both together via
  the usual one-off pooler-script convention when someone confirms).
- `src/lib/utils.ts`'s unused `STEP_NAMES` export.
- **All 9 `/dashboard/<contextual-role>` route pairs** (`advisor`, `co-advisor`, `dept-staff`,
  `exam-committee`, `faculty-dean`, `graduate-school`, `head-exam-committee`,
  `invited-exam-committee`, `program-chair`) — leftovers from the pre-account-model 2026-06-02
  mockup commit. Removed together with `/demo` and `/api/auth/demo` (the old passwordless per-role
  test-login flow that kept 5 of the 9 technically reachable) in favor of the documented
  `/demo-users` picker, and the now-orphaned `RolePendingList` component those routes used.
- 5 unused npm dependencies: `zod`, `react-hook-form`, `@hookform/resolvers`, `@auth/prisma-adapter`,
  `playwright` (removed from `package.json`, `npm install` re-run to sync the lockfile). `pg`/
  `@types/pg` were deliberately left — redundant (already pulled in transitively by
  `@prisma/adapter-pg`) but harmless, not worth the churn.

**Still not removed, left for a deliberate later pass:**
- `CLAUDE.md`'s architecture map is still missing several now-real files (`src/lib/accountScope.ts`,
  `config.ts`, `fileStore.ts`, `translations.ts`; several `src/components/` entries; the
  `api/admin/*`/`api/external-requests/*`/`api/super-admin/*`/`api/submissions/auto-draft-proposal`
  route families) — a documentation refresh, not a code change.
- `src/lib/workflow.ts` (dead mock-build stub) and `docs/ARCHITECTURE.md`/`docs/RECIPES.md`
  (pre-database mockup docs) — confirmed still accurate/still stale respectively, left alone.

---

## Email

`src/lib/email.ts` — step notifications, finance mail, exam reminders, via nodemailer.
`SMTP_USER`/`SMTP_PASS` (Office365, default `smtp.office365.com:587`) take priority over
`GMAIL_USER`/`GMAIL_APP_PASSWORD` when both are set. Currently running on the Gmail path — see the
quota warning above for why a Chula mailbox with Authenticated SMTP would be the more durable fix.
