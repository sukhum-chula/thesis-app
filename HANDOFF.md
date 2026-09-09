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
- Leave `DEMO_MODE` / `NEXT_PUBLIC_DEMO_MODE` unset in production — they expose `/demo` and the
  passwordless `/api/auth/demo` login.
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

### Documentation/repo hygiene found during a 2026-09-09 consistency pass (not urgent, not yet acted on)

- `CLAUDE.md`'s architecture map is missing several now-real files: `src/lib/accountScope.ts`
  (load-bearing, already documented in `AGENTS.md`), `config.ts`, `fileStore.ts`, `rateLimit.ts`,
  `translations.ts`; several `src/components/` entries (`ProposalDraftReview`, `UserProfileHeader`,
  `StudentExternalRequests`, `NotificationBell`, `DashboardHeader`, `PasscodeField`,
  `UserDetailPanel`, `RolePendingList`, `StatusBadge`, `Providers`, `LanguageToggle`); and entire
  API route families (`api/admin/*`, `api/external-requests/*`, `api/super-admin/*`,
  `api/submissions/auto-draft-proposal`). Worth a refresh pass next time you're touching that file.
- `scripts/assign-passcodes-no-email.ts` is an untracked, unreferenced one-off script (a real,
  already-run passcode reset for 12 professors whose welcome email hit the Gmail quota). Per the
  migration-script convention above, it should have been deleted after running. Contains real
  internal email addresses — don't commit it, just delete it once you've confirmed it's no longer
  needed.
- `src/lib/rateLimit.ts` and the `RateLimit` Prisma model are orphaned — zero importers anywhere in
  `src/app`. They were only ever used by self-registration/forgot-password, both removed entirely
  (see "Account creation & passcodes" in `AGENTS.md`). Not previously caught by the dead-code audit
  below.
- `src/lib/utils.ts`'s `STEP_NAMES` export (an alias for `PROPOSAL_STEP_NAMES`) has zero importers —
  the "always use `getStepName()`" convention is honored everywhere already.
- **Old-design leftover, reported separately in this same pass, not yet cleaned up**: 9
  `/dashboard/<contextual-role>` route pairs (`advisor`, `co-advisor`, `dept-staff`,
  `exam-committee`, `faculty-dean`, `graduate-school`, `head-exam-committee`,
  `invited-exam-committee`, `program-chair`) are untouched leftovers from the original 2026-06-02
  mockup commit, from before the app had a real account model. 5 of the 9 are still reachable via
  the `/demo` testing flow (`DEMO_MODE`-gated, off in production); the other 4
  (`co-advisor`/`dept-staff`/`faculty-dean`/`graduate-school`) have zero references anywhere. They
  render safely (they reuse the same real, current `RolePendingList`/`RoleSubmissionDetail`
  components, no stale data shapes, no security hole), but they're dead weight and contradict
  `AGENTS.md` (which says Faculty Dean/Graduate School have no login at all). Low-risk cleanup
  whenever someone wants to do it: remove all 9 route pairs together with `/demo` and
  `/api/auth/demo` (which are the only things keeping 5 of the 9 technically linked), in favor of
  the documented `/demo-users` picker.
- Confirmed still accurate and unchanged: the dead-dependency list (`playwright`, `zod`,
  `react-hook-form`, `@hookform/resolvers`, `@auth/prisma-adapter`, `pg`/`@types/pg` all unused but
  present in `package.json`; `xlsx` is correctly kept, used by `scripts/make-wordlist.js`/
  `import-wordlist.js`), `src/lib/workflow.ts` (dead mock-build stub), and `docs/ARCHITECTURE.md`/
  `docs/RECIPES.md` (describe the pre-database, localStorage-only mockup — ignore them, per
  `CLAUDE.md`).

None of the above has been removed — this is a report for a deliberate cleanup pass, not something
that broke.

---

## Email

`src/lib/email.ts` — step notifications, finance mail, exam reminders, via nodemailer.
`SMTP_USER`/`SMTP_PASS` (Office365, default `smtp.office365.com:587`) take priority over
`GMAIL_USER`/`GMAIL_APP_PASSWORD` when both are set. Currently running on the Gmail path — see the
quota warning above for why a Chula mailbox with Authenticated SMTP would be the more durable fix.
