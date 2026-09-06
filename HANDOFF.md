# Handoff — ownership transfer to sukhum.s@cp.eng.chula.ac.th

Written 2026-08-17, updated 2026-09-04, updated 2026-09-06. Read this **after** `AGENTS.md`.
`AGENTS.md` describes the app (workflow rules, roles, conventions) and is still accurate about
behaviour; this file covers what changed when the project moved off the ex-intern's accounts
(§1–§7), plus — since 2026-09-06 — an ongoing tracker of active/in-progress development (§8). For
the dated, change-by-change history, see `CHANGELOG.md`; this file only carries what a session
needs to *pick up* current work, not a full log.

**Status: the ownership transfer (§1–§7) is functionally complete.** Every item in the original
open-work list (§2) is done and verified. What's left there is a couple of judgment calls for the
new owner, not technical work — see the end of §2. Separately, §8 tracks whatever development is
active right now — check it for what's mid-flight.

**The app is live with real users.** Treat data and email as production.

---

## 1. Where the code lives now

| | |
| --- | --- |
| Local checkout | `C:\Users\ASUS\Desktop\Grad Tracking System\thesis-app` |
| `origin` | `https://github.com/sukhum-chula/thesis-app` (new owner) |
| `upstream` | `https://github.com/Jukkruu/thesis-app` (ex-intern's original, read-only reference) |
| Vercel | `thesis-app` under account `sukhums-4319` — confirmed connected to `origin` via GitHub integration, auto-deploys on push to `main` |
| Supabase | **migrated** to a new project, `tluqclmgbnciymxzknhh` (region `ap-southeast-1`, same as before). The ex-intern's original project (`jttfcoisygcqqshghkmn`) is left running, paused-not-deleted, as a rollback window — see §2 |

Repo-local git config set during the transfer: `core.fileMode=false`, `core.autocrlf=false`.

Also present in the working folder but **not** part of the app: the Thai PDF forms
(`บ.วศ.1ก`, `บ.2`, `บ.3`, `บ.4`, exam-result form) sitting one level up in
`Grad Tracking System\` — these are reference form templates, not scratch files, and are kept.
The `_to_delete\` folder (a stale git lock file and a 2026-08-17 pre-transfer backup tarball) was
removed on 2026-09-04 once the transfer was fully verified.

## 2. Open work — status

1. ✅ **Push to the new remote** — done; `origin/main` and Vercel's GitHub integration both confirmed.
2. ✅ **Migrate Supabase to the new owner** — done via `docs/SUPABASE-MIGRATION.md` /
   `scripts/migrate-supabase.mjs`. All 8 tables copied and verified row-for-row identical
   (users 50, submissions 10, workflow_steps 121, form_uploads 94, notifications 268), all 399
   storage files (93 MB) copied with zero failures.
3. ✅ **Fix `NEXTAUTH_URL` in Vercel** — set to the deployed origin (`https://thesis-app-tau.vercel.app`) for Production only; left unset for Preview/Development so `getAppUrl()`'s `VERCEL_URL` fallback resolves correctly per-deployment.
4. ✅ **Email sender configured** — `GMAIL_USER`/`GMAIL_APP_PASSWORD` (Gmail App Password, 2SV
   enabled) set in Vercel and locally; a real test send was verified (`250 2.0.0 OK`). The Resend
   integration (`RESEND_API_KEY`, `/api/email/advisor`, `/api/email/finance`) was removed entirely —
   both routes were orphaned (no callers anywhere in the app) and the finance one didn't even use
   Resend correctly.
5. ✅ **`CRON_SECRET` set** in Vercel — verified the endpoint now returns 401 without it, and that
   Vercel's own Cron scheduler sends the matching `Authorization: Bearer` header automatically, so
   the daily exam-reminder job still fires correctly.
6. ✅ **Build confirmed** — `npm run build` passes; a real production deployment was verified live
   (login page 200, a DB-touching endpoint completed successfully, signed URL fetch returned the
   correct file, direct public-style storage URL correctly rejected with 400).
7. ✅ **`VERCEL_OIDC_TOKEN` removed** from `.env.local`.
8. ✅ *(found during the transfer, not in the original list)* **Storage bucket was public**,
   contradicting what this doc and `AGENTS.md` claimed. Every uploaded thesis document was
   reachable by anyone with the URL, no login required. Fixed: new bucket is private,
   `FormUpload.fileUrl` now stores a bare storage path (not a public URL), and previews/downloads
   resolve a signed URL via `GET /api/upload/[uploadId]/signed-url`. See §3.
9. ✅ *(found during the transfer)* **Vercel had zero environment variables set** in any
   environment (Production/Preview/Development) before this pass — the live deployment was very
   likely non-functional beyond static pages. All required vars are now set; see §6.

**Still open — judgment calls for the owner, not engineering work:**

- **Retire the old Supabase project.** Per the original plan: pause (don't delete) for a rollback
  window, then revoke its service-role key. Nothing to do yet, just don't forget it's sitting there
  with a live key.
- **Do an actual manual smoke test in a real browser.** A full API-level walkthrough (real
  credentials login, viewing a submission, signed-URL file download, upload → approve → notify
  chained across student → admin → program chair, email correctly redirected in testing) was
  verified against synthetic test accounts on 2026-09-04 — see §7. Nobody has clicked through the
  UI itself in a browser since the cutover.

`FINANCE_EMAIL` (`hare081987@gmail.com`) is confirmed as the real recipient — see §6.
`AGENTS.md`'s stale statements (formerly §5) were fixed and pushed on 2026-09-04.

## 3. Database and storage facts a new session will get wrong

- **There is no `prisma/migrations/` directory.** The schema was managed with `prisma db push`, not
  migrations. `prisma migrate deploy` will find nothing and silently leave a database empty. To
  create the schema on a fresh project: `npx prisma db push`. If you introduce a real migration
  history later, do it deliberately with `prisma migrate diff` against the live schema — don't
  assume a baseline exists.
- **`prisma db push` needs a direct connection, not the pooler.** Running it against the
  transaction-pooler URL (port 6543) hangs — pgbouncer transaction mode doesn't support the
  prepared statements the migration engine uses. Use the direct connection (port 5432,
  `db.<ref>.supabase.co`) for `db push`; use the pooler for the app's runtime `DATABASE_URL`.
- `prisma/migrate-roles.sql` is a one-off historical script (single-role → `Role[]`), already
  applied. Not part of setup.
- `DATABASE_URL` must be the **transaction-mode pooler on port 6543**. Session mode (`:5432`) has a
  15-client cap and caused `EMAXCONNSESSION` under real traffic — this is a real incident, not a
  preference.
- Storage bucket `thesis-files` is **private**; `FormUpload.fileUrl` stores a bare storage path
  (e.g. `{submissionId}/BW1A_<timestamp>.pdf`), and previews/downloads resolve a short-lived signed
  URL through `GET /api/upload/[uploadId]/signed-url` (gated by the same submission-involvement
  check used elsewhere in the API). This was **not actually true before 2026-09-04** — the bucket
  was public and uploads stored full public URLs directly; `getSignedUrl()` in `src/lib/supabase.ts`
  existed but was dead code. Do not reintroduce public URLs. Upload paths are `{submissionId}/...`,
  which `deleteFolder()` relies on.

## 4. Email

- **`src/lib/email.ts`** — step notifications, finance mail, exam reminders. nodemailer;
  `SMTP_USER`/`SMTP_PASS` (Office 365, default `smtp.office365.com:587`) take priority, else
  `GMAIL_USER`/`GMAIL_APP_PASSWORD`. Currently configured via the Gmail path — a Chula mailbox with
  "Authenticated SMTP" enabled would be the more durable long-term fix, since the Gmail App Password
  is tied to one person's personal account and its 2-Step Verification phone number.
- `EMAIL_OVERRIDE_TO` routes every nodemailer message to one address, with the intended recipient
  appended to the subject. Set on Preview and Development (not Production) so test/preview
  deployments can never email real students or faculty.

## 5. `AGENTS.md` staleness — fixed 2026-09-04

`AGENTS.md` previously had several statements left over from the intern's setup (wrong GitHub
repo/Vercel account, `NEXTAUTH_SECRET` instead of the real `AUTH_SECRET`, missing env vars, the old
"no magic links" email claim, and the storage claim being aspirational rather than actual). All of
these were corrected directly in `AGENTS.md` and pushed — there is no separate list to maintain
here any more. If you spot `AGENTS.md` drifting from reality again, fix it there directly (it's
loaded via `CLAUDE.md`, so stale lines mislead every future session) rather than re-growing this
section.

## 6. Environment variables — current state in the new Vercel project

All of these are confirmed set (Production, Preview and Development unless noted):

```
DATABASE_URL                            # NEW Supabase, transaction pooler :6543
AUTH_SECRET                             # NOT NEXTAUTH_SECRET
NEXTAUTH_URL                            # Production only — deployed origin
NEXT_PUBLIC_SUPABASE_URL                # NEW project
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY    # NEW project
SUPABASE_SERVICE_ROLE_KEY               # NEW project, server-side only
FINANCE_EMAIL                           # hare081987@gmail.com — confirmed real recipient
CRON_SECRET
GMAIL_USER / GMAIL_APP_PASSWORD
EMAIL_OVERRIDE_TO                       # Preview + Development only
```

Leave unset in production: `DEMO_MODE`, `NEXT_PUBLIC_DEMO_MODE` (they expose `/demo` and the
passwordless role-login at `/api/auth/demo`).

Remember `NEXT_PUBLIC_*` values are inlined at build time — changing them requires a redeploy, not
just a restart.

## 7. Verified vs unverified

Verified (2026-09-04): `npm run build`; the full migration script including the storage half (399
files, 93 MB, zero failures, all row counts md5-matched); Vercel env vars across all three
environments; a live production deployment (login page, DB connectivity, signed-URL file access,
cron auth, a real test email send).

Not verified: a real human login/click-through smoke test in the browser (only API/script-level
checks have been done).

---

## 8. Active / in-progress development

This section tracks work that's mid-flight or needs follow-up **right now** — keep it current:
add an entry when you start something that spans multiple sessions, and remove/move it to
`CHANGELOG.md`'s dated log once it's shipped and verified. Unlike `CHANGELOG.md` (append-only,
dated), this section is meant to be edited in place.

### Shipped and verified (locally — not yet re-checked on the deployed Vercel URL)

- **2026-09-06 — SUPER_ADMIN/ADMIN responsibility split.** SUPER_ADMIN is now account/user
  management only (SUPER_ADMIN + ADMIN accounts, via new landing page `/super-dashboard`) with
  zero submission-workflow access; ADMIN owns the entire submission workflow exclusively plus
  ADMIN/PROFESSOR/STUDENT account management (new landing page `/admin-dashboard`). Tiered rules
  in `src/lib/accountScope.ts`. Pushed to `origin/main` — Vercel should have auto-deployed it.
  **Verified** via real browser login as both a SUPER_ADMIN and an ADMIN account against the local
  dev server (same live Supabase DB): (a) SUPER_ADMIN is correctly bounced from anything
  submission-related and vice versa, (b) SUPER_ADMIN and ADMIN can each manage ADMIN-tier accounts
  (create/update role both directions/delete), (c) ADMIN can create/update/delete STUDENT,
  PROFESSOR, and peer ADMIN accounts, (d) logout works from both new dashboards. Found and fixed
  one real bug along the way (`router.replace()` called during render instead of in `useEffect` on
  the ADMIN submission-detail guards — threw a React console error when a non-ADMIN hit them).
  **Still worth a quick pass on the actual deployed URL** once Vercel finishes building, just to
  rule out anything env/deploy-specific.
- **2026-09-06 — `/demo-users`.** Local-only read-only user listing for picking a test-login email.
  Gated on `NODE_ENV !== "production"`, not `DEMO_MODE` — confirm it actually 404s on the deployed
  (production) build if you're ever unsure.

### Carried over from the ownership transfer (not urgent, just not forgotten)

- Retire the old Supabase project (`jttfcoisygcqqshghkmn`) — currently paused, not deleted, per the
  original rollback-window plan. Revoke its service-role key once you're confident nothing needs it.
- The full manual browser smoke test from §7 still hasn't happened — real credentials, real click
  path through at least one full PROPOSAL and one THESIS_DEFENSE submission.
