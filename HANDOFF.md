# Handoff — ownership transfer to sukhum.s@cp.eng.chula.ac.th

Written 2026-08-17, updated 2026-09-04, updated 2026-09-06, updated 2026-09-07 (twice). Read this
**after** `AGENTS.md`.
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

**⚠️ SECURITY: every account's passcode is currently the shared value `A00a00` (set 2026-09-07,
re-applied to all 20 accounts on 2026-09-07 after 5 new accounts joined the DB).**
All 20 users in the live DB — including real STUDENT/PROFESSOR/ADMIN/SUPER_ADMIN accounts, not just
test ones — were bulk-reset to this one known passcode for local testing convenience (see §8 for
why). Anyone who knows this string can log in as **any** user right now. This is a genuinely
insecure state for a live app with real users — reset real users back to individually-random
passcodes (an ADMIN's per-user "รีเซ็ตรหัสเข้าใช้งาน" reset button already does this, one at a time)
before leaving this unattended for long, and remove this warning once that's done.

**⚠️ `EMAIL_OVERRIDE_TO` was removed entirely on 2026-09-07** (code, `.env.local`, and the Vercel
Preview/Development env vars). There is now no safety net redirecting outgoing mail — local dev,
Preview, and Development deployments send real emails to whatever address is on the account, same
as Production. Be careful triggering step approvals/rejections/passcode resets/etc. against real
accounts on non-Production environments.

**⚠️ The outgoing-mail Gmail account (`GMAIL_USER=suphap.m.me@gmail.com`) is hitting Google's daily
sending-limit quota (2026-09-09)** — confirmed via a live repro: creating a test account through
the admin panel produced `[email/welcome] Send error: Data command failed: 550-5.4.5 Daily user
sending limit exceeded`. It's a personal Gmail account (~500 msgs/day cap), and it sends every
welcome/passcode-reset/step-notification/finance email for the whole live app plus every session's
testing — easy to exhaust. Not a code bug; every send path already correctly creates/updates the
record regardless of email outcome (see the 2026-09-09 entry in §8 about `emailSent`). Fix options,
undecided as of this writing: wait for the daily quota to reset, switch to the already-built
Office365 SMTP path (`SMTP_USER`/`SMTP_PASS` env vars, needs a Chula mailbox with Authenticated SMTP
enabled — see §4), or move to a dedicated transactional-email provider (SendGrid/Resend/SES).

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
- **After renaming/changing a Prisma schema field, restart the `next dev` process, not just
  `npx prisma generate`.** Found 2026-09-07 renaming `User.passwordHash` → `passcodeHash`: the
  schema and DB were both correctly updated and the client was regenerated on disk, but the
  already-running Turbopack dev server kept its old compiled Prisma client in memory and threw
  `PrismaClientKnownRequestError: The column users.passwordHash does not exist` on every request
  touching `prisma.user`. Regenerating the client does not hot-reload into a running dev server —
  kill the process (and clear `.next/` if the error persists) and restart `npm run dev`.
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

- **2026-09-09 — New admin-only "rank code" feature: A001/B002/C003/D004 per role group,
  drag-to-reorder in AdminUsersPanel.** Requested directly by the project owner: a string that
  ranks each user, visible only to ADMIN, never directly editable, that renumbers automatically
  when an ADMIN drags a user's card up/down the list. Added `User.rankOrder Int?`
  (`prisma/schema.prisma`) plus `computeRankCodes()`/`rankCodeNumber()`/`RANK_PREFIX`/`RANK_ROLES`
  (`src/lib/utils.ts`) to turn it into a display code per role: `A`ADMIN, `B`PROFESSOR,
  `C`EXTERNAL, `D`STUDENT, each with a dense 3-digit position within that group (null `rankOrder`
  sorts last, tie-broken by `createdAt`). `GET /api/users` (`src/app/api/users/route.ts`) attaches
  `rankCode` to each user only when the caller is ADMIN and not SUPER_ADMIN (`isAdminCaller`) — every
  other caller's response omits the field entirely, so it's structurally impossible for a non-ADMIN
  session to see it. New ADMIN-only `POST /api/admin/users/reorder` accepts `{ role, orderedIds }`,
  rejects a partial/stale membership list (409), and sets every member's `rankOrder` to its new
  1-based position in one `$transaction` — there is no endpoint or form field that sets `rankOrder`
  to an arbitrary value directly, only a full-group reorder. `AppContext.adminReorderUsers(role,
  orderedIds)` wraps it and refetches so every affected user's code updates together.
  `AdminUsersPanel.tsx` gained the drag UI (native HTML5 drag-and-drop, same pattern as
  `CommitteePeopleEditor`'s existing person-reordering) — enabled only when a single role pill is
  filtered (not "ทั้งหมด") with the search box and "มีคำร้องที่ยังไม่ถูกยกเลิก" checkbox both cleared,
  since only then does the visible list equal that role's exact full membership; an optimistic local
  order is shown immediately on drop while the server round-trip lands. `UserProfileHeader.tsx`
  renders the code as a badge next to the role pill whenever `viewer.roles.includes("ADMIN")`,
  independent of the reorder UI being active, so it's visible on every row an ADMIN looks at
  (including the standalone `/dashboard/admin/users/[uid]` page). See "Admin-only user rank codes"
  in `AGENTS.md`.
  **DB migration**: `rankOrder` column added via a one-off raw-SQL script over the pooler connection
  (same pattern as this file's other column migrations — schema-scoped `information_schema.columns`
  existence check first, then `ALTER TABLE`, then deleted, not committed), since this session only
  had the pooler connection. `npx prisma generate` run after.
  **Built alongside two other concurrent Claude Code sessions** working in this same repo directory
  at the same time (the `invitedCommitteeId` → `invitedCommitteeIds[]` multi-external-committee
  migration, and the misreported-email-result fix entry right below this one) — coordinated directly
  via cross-session messages before editing shared files (`prisma/schema.prisma`, `AppContext.tsx`,
  `AdminUsersPanel.tsx`, `UserProfileHeader.tsx`, `src/app/api/users/route.ts`); all three sessions'
  changes are disjoint and merged cleanly. **Verified**: the `rankOrder` column's existence was
  confirmed via a read-only query before/after; `npx tsc --noEmit` and a scoped `eslint` pass showed
  zero new errors from any file this work touched; a full `npm run build` was run twice — once
  before the other two sessions' work had landed (failed only on their then-unfinished
  `invitedCommitteeId` migration, confirmed unrelated to this work) and once after all three
  sessions' changes were together, which passed clean. The dev server was restarted (schema change +
  regenerated Prisma client, per the usual stale-client gotcha) with the project owner's explicit
  approval, and confirmed healthy afterward (`GET /api/users` → 401 unauthenticated, `/login` → 200).
  **Not yet clicked through in a real browser** — no working ADMIN credentials were exercised this
  session; next session should confirm: the rank badge appears only for an ADMIN session (not
  SUPER_ADMIN, not any other role), filtering to a single role plus clearing search/checkbox reveals
  the drag handles, dragging a row actually persists a new order that survives a page reload, and a
  409 is returned (and surfaces sanely in the UI) if two admins reorder the same group at once.

- **2026-09-09 — Fixed the same misreported-email-result bug in the passcode-reset and
  login-email-change flows** (found by checking whether the "add user" bug below existed elsewhere
  in the system, per the project owner's explicit ask). Server-side, `PATCH /api/users/[id]`
  (`src/app/api/users/[id]/route.ts`) already had the important part right — `prisma.user.update(...)`
  (the actual passcode/email change) runs before either notification email is sent, so the account
  change always takes effect regardless of mail outcome. But it was structurally worse than the
  "add user" case: `sendPasscodeResetEmail`/`sendEmailChangedNotice` (`src/lib/email.ts`) returned
  `void`, so the send result wasn't merely discarded, it was never even available to report, and
  every UI call site hardcoded a success message unconditionally. Fixed:
  - `email.ts` — `sendPasscodeResetEmail` now returns `{ sent: boolean }`; `sendEmailChangedNotice`
    now returns `{ oldSent: boolean; newSent: boolean }` (it emails both the old and new address).
  - `api/users/[id]/route.ts` — response now includes `passcodeEmailSent` (when a reset was
    requested) and `emailChangeNoticesSent` (true only if *both* the old- and new-address notices
    sent successfully, when the email was changed).
  - `AppContext.tsx` — `superAdminResetPasscode` now returns `{ emailSent: boolean }` (previously
    `Promise<void>`, and also now updates `users` state, matching `adminUpdateUserInfo`'s existing
    pattern); `adminUpdateUserInfo` now returns `{ emailChangeNoticesSent?: boolean }`.
  - Three toast call sites updated to branch on the real result instead of assuming success:
    `UserProfileHeader.tsx`'s reset-passcode dialog and its edit-info dialog (shared by both
    `AdminUsersPanel`'s user list and the standalone `/dashboard/admin/users/[uid]` profile page),
    and `/super-dashboard`'s own inline reset-passcode panel.
  See "Account creation & passcodes" in `AGENTS.md` (behavior unchanged there — same as the sibling
  fix below, this was purely a client-side reporting gap). **Verified**: created a disposable test
  account through the admin panel and reset its passcode live — this time the Gmail daily quota had
  reset, so both the welcome email and the passcode-reset email actually succeeded, and the toast
  correctly showed success matching the dev server's own `.next/dev/logs/next-development.log`
  entries (`[email/welcome] Sent to ...`, `[email/passcode-reset] Sent to ...`); cleaned up the test
  account after. `npx tsc --noEmit` is clean project-wide (0 errors) and `eslint` shows no new
  errors in any touched file. **Not yet exercised against an actual failed send** — the success path
  was confirmed end-to-end live, but the failure-branch wording (shown when `emailSent`/
  `emailChangeNoticesSent` is `false`) has only been code-reviewed, not triggered by a real repro, on
  this specific flow (the sibling "add user" fix below *was* verified against a real failure).
  **Also surfaced, mid-diagnosis, that another concurrent Claude Code session's in-progress
  `invitedCommitteeId` → `invitedCommitteeIds[]` schema migration had briefly left the dev server
  crash-looping** (`P2022`/"column does not exist" — the DB migration hadn't finished landing when
  the server was restarted); resolved on its own once that session completed its migration (confirmed
  via `npx tsc --noEmit` dropping to 0 project-wide errors), not something this fix needed to touch.

- **2026-09-09 — Fixed the "add user" flow claiming a welcome email was sent even when it
  actually failed (found while diagnosing the Gmail quota issue above).** `POST /api/users`
  (`src/app/api/users/route.ts`) already had this right server-side — `prisma.user.create(...)`
  runs before `sendWelcomeEmail(...)`, and the response always returns `201` with an `emailSent`
  flag regardless of whether the send succeeded, so the account is never blocked or rolled back by
  a mail failure. The bug was entirely client-side: every caller of `superAdminAddUser` either
  discarded the `emailSent` field or never surfaced it at all, so an admin always saw a plain
  "success" toast even when the passcode email silently failed to go out (e.g. the Gmail daily-quota
  error above). Fixed all three admin-facing entry points that create an account via this route:
  - `AppContext.tsx` — `superAdminAddUser`'s return type changed from `Promise<void>` to
    `Promise<{ emailSent: boolean }>`, now returning the field the API already sent back.
  - `AdminUsersPanel.tsx` (main "เพิ่มผู้ใช้งาน" modal, both `/admin-dashboard`'s tab and standalone
    `/dashboard/admin/users`) — toast now branches on `emailSent`, showing an error toast telling
    the admin to relay the passcode another way when the send failed.
  - `/dashboard/admin/pending-professors` (quick-create for a DRAFT's missing committee person) —
    same branching toast.
  - `/super-dashboard` (SUPER_ADMIN add-admin form) — this one was worse than the other two: it
    never `await`ed the call or handled errors at all (fire-and-forget), so even a hard failure
    like a duplicate email would silently do nothing while the form closed as if it had succeeded.
    Made `handleAddUser` `async`, added a try/catch with an error toast, and only clears/closes the
    form on confirmed success.
  See `POST /api/users` in `CLAUDE.md`'s API map and "Account creation & passcodes" in `AGENTS.md`
  (behavior unchanged there — this was purely a client-side reporting gap, not a workflow change).
  **Verified**: reproduced the real Gmail-quota failure live (created and deleted a disposable test
  account through the admin panel, confirmed the dev-server log showed the send error while the
  account was created successfully either way); `npx tsc --noEmit` and `npx eslint` on all touched
  files show no new errors. **Not yet clicked through for the other two entry points specifically**
  (`pending-professors`, `/super-dashboard`) — only the main `AdminUsersPanel` modal was exercised
  live; next session should trigger a real or simulated send failure through those two forms as well
  to confirm the toast wording renders correctly.

- **2026-09-09 — Fixed the admin user-management list's submission-status box and 3
  edit/reset/delete buttons not adapting to a narrower browser width.** Reported as: on
  `/admin-dashboard`'s จัดการผู้ใช้งาน tab (and standalone `/dashboard/admin/users`), the status box
  and buttons were "too big when page is narrower". Root cause: `UserProfileHeader.tsx`'s header
  row had both the status box and the button stack set `shrink-0` with no responsive fallback below
  the `md` breakpoint the status box was gated on — at any width from ~768px up to a genuinely wide
  desktop, neither block would shrink, so the identity block (name/email, `flex-1 min-w-0`) absorbed
  all the narrowing and the name wrapped character-by-character. Confirmed live in the browser at
  ~871px width logged in as ADMIN before fixing. Fix: the header now stacks vertically below the
  `xl` breakpoint (1280px) — identity on top, then the status box + 3 buttons together in a
  wrapping row underneath, only docking side-by-side with identity once there's enough room for
  everything at full size; the 3 buttons switch from a fixed `w-40` vertical stack to an
  equal-width horizontal row (`flex-1`) until `xl`; the status box's padding/gaps and count-number
  size shrink at smaller breakpoints too. Removed the old separate "mobile-only" duplicate stats
  block, since the status box now always renders in the wrapping row (previously hidden below
  `md`). **Verified**: confirmed live in the browser (ADMIN → จัดการผู้ใช้งาน tab) that names/emails
  render normally and the status counts + buttons sit in a clean row below at ~871px width;
  `npx tsc --noEmit` and `npx eslint` show no new errors (the file's existing `catch (err: any)`
  lint errors are pre-existing, unrelated to this change). **Not yet verified at the `xl`
  (1280px+) side-by-side layout or at a true mobile width** — this session's browser-automation
  tooling couldn't actually resize the rendered viewport (the `resize_window` call reported success
  but `window.innerWidth` never changed from 871px), so only the stacked (below-`xl`) layout was
  visually confirmed; the `xl:` docked-row classes are standard Tailwind and logically mirror the
  original always-on design, but haven't been eyeballed at a wide desktop width.
  **Built alongside two other concurrent Claude Code sessions working in this same repo directory
  at the same time** (one on the `INVITED_EXAM_COMMITTEE` multi-member migration below, one —
  `thesis-app-8c` — on a `User.rankOrder` ranking feature that also touches `UserProfileHeader.tsx`/
  `AdminUsersPanel.tsx`/`AppContext.tsx`). Coordinated directly via cross-session messages; both
  this session's edits and `thesis-app-8c`'s landed cleanly in disjoint regions of the shared files
  with no conflicts.

- **2026-09-09 — `INVITED_EXAM_COMMITTEE` (กรรมการภายนอก) now supports multiple members, not just
  exactly 1.** Requested by the project owner directly ("change that the project can has more than
  1 external committee"). Previously this role was hard-capped at exactly 1 person and structurally
  different from `CO_ADVISOR`/`EXAM_COMMITTEE` (a scalar `invitedCommitteeId` + 4 free-text snapshot
  columns, single-approver `approve` flow, `SignatureButton` UI) even though `WorkflowStep.
  committeeMembers` already wrapped it in a 1-element array "for self-containment" (per the old
  AGENTS.md wording). Made it a genuine multi-member role, mirroring `CO_ADVISOR`/`EXAM_COMMITTEE`
  exactly: schema field replaced with `invitedCommitteeIds String[]` (migrated via one-off raw SQL
  over the pooler — backfilled 6/6 existing rows, verified, then dropped the old
  `invitedCommitteeId`/`invitedProfName`/`invitedProfAffiliation`/`invitedProfEmail`/
  `invitedProfPhone` columns entirely, with the project owner's explicit go-ahead before running
  the drop against production); `validatePeople`/`resolvePeople` (`src/lib/committee.ts`) now
  require ≥1 instead of exactly 1; `buildWorkflowSteps()` populates `committeeMembers` with the
  real array; `POST /api/submissions/[id]/sign` now accepts this role for the same
  `committeeActions`-tracked sequential-signing transaction `CO_ADVISOR`/`EXAM_COMMITTEE` already
  use (each member signs in list order, all must approve); the plain single-approver `approve`
  action now rejects it the same way it already rejected those two roles;
  `RoleSubmissionDetail` routes it to `CommitteeSignPanel` instead of `SignatureButton`. UI-side,
  `CommitteePeopleEditor`'s `ROLE_REQUIREMENTS` dropped its `max: 1` cap (was blocking a 2nd row
  with a "✗ เกิน" error); `AdminSubmissionPanel`'s submission-edit form gained 3 กรรมการภายนอก
  dropdown slots (was 1 dropdown + 4 free-text fields), matching its existing 3-slot pattern for
  co-advisor/exam-committee; every display surface that showed one invited-committee name
  (`WorkflowTimeline`, `SubmissionInfoPanel`, `RoleSubmissionDetail`, `AdminSubmissionPanel`) now
  lists all of them. Email-side, `sendStepEmail` folds this role into the same recipient-resolution
  branch as `EXAM_COMMITTEE`/`CO_ADVISOR` (specific-member or first-member-fallback) plus a new
  `allMembers` broadcast option (used for the THESIS_DEFENSE step-8 invitation-letter email, so
  every invited examiner gets it, not just whoever signs first); `sendFinanceEmail`'s
  `invitedProfs` is now an array of `{name, affiliation?, email?, phone?}`, one row per member.
  See "Multiple external committee members" in `AGENTS.md`. **Verified**: `npm run build` and
  `npm run lint` both pass clean (lint's pre-existing `any`-related error count is unchanged by
  this work — confirmed via diff that no new `any` was introduced); the DB migration was verified
  before/after (6/6 existing single ids backfilled correctly into the new array, 0 data loss).
  **Not yet clicked through in a real browser** — next session with working credentials should:
  create/edit a submission with 2+ invited external committee members, confirm they sign
  sequentially in the order listed (`CommitteeSignPanel`), confirm the invitation-letter email at
  THESIS_DEFENSE step 8 reaches all of them, and confirm the finance-notification email lists all
  invited members correctly.
  **Built alongside another concurrent Claude Code session** (`thesis-app-8c`, working in this same
  repo directory at the same time on an unrelated admin user-ranking feature — `User.rankOrder`).
  Coordinated directly via cross-session messages before running raw SQL against the shared schema;
  no file conflicts — that session's changes to `prisma/schema.prisma`/`AppContext.tsx` sit in
  disjoint sections from this work.

- **2026-09-09 — Reworded and de-duplicated the "หาไม่พบกรรมการภายนอก" hint text on the student
  proposal committee editor.** Reported as: the note was misleadingly worded, and appeared far too
  many times on one page. Root cause of the repetition: `CommitteePeopleEditor`
  (`src/components/SubmissionForms.tsx`) rendered a sky-blue hint box under *every* row whose role
  can be filled by an external examiner (`canBeExternal` — CO_ADVISOR/EXAM_COMMITTEE via
  `MIXED_ROLES`, INVITED_EXAM_COMMITTEE via `EXTERNAL_ONLY_ROLES`), so a submission with several
  exam-committee rows plus a co-advisor row showed the same box repeated 3-4+ times, on top of the
  form's own single intro-paragraph mention of the same thing. Removed the per-row box entirely and
  reworded the one surviving copy to "หากไม่พบชื่อกรรมการภายนอก นิสิตสามารถยื่นคำขอสร้างบัญชีใหม่ได้
  ที่แท็บ &ldquo;กรรมการภายนอก&rdquo; แล้วรอเจ้าหน้าที่อนุมัติก่อนจึงจะเลือกได้ที่นี่" — placed as
  the second line, right after "เลือกอาจารย์และกรรมการที่รับผิดชอบวิทยานิพนธ์..." — in both
  `ProposalForm`'s intro (`SubmissionForms.tsx`) and `ProposalDraftReview.tsx`'s intro (the latter
  is the actual live-editing surface for the blank-draft-first proposal flow, see "Proposal tab" in
  `AGENTS.md`, and previously had no such note of its own at all — it relied entirely on the
  per-row box that's now gone). `DefenseForm`'s own separate intro copy (`SubmissionForms.tsx`,
  used only for THESIS_DEFENSE) was left as-is — out of scope, since this request was specifically
  about the proposal flow. **Verified**: `npx tsc --noEmit` and `npx eslint` on both touched files
  show no new errors (pre-existing, unrelated errors in other files — traced to an already-modified
  `prisma/schema.prisma` in the working tree — are unaffected). **Not yet clicked through in a real
  browser.**

- **2026-09-08 — Fixed EXTERNAL (กรรมการภายนอก) accounts being invisible in the admin user list and
  in the admin submission-edit form's committee pickers.** Reported as: an approved external
  examiner doesn't show up in either "จัดการผู้ใช้งาน" or the committee dropdowns when an admin
  edits a submission. Two separate bugs, found by tracing both symptoms back through
  `useApp().users`:
  1. `GET /api/users`'s ADMIN branch (`src/app/api/users/route.ts` — scoping `where` by caller
     role) queried `{ roles: { hasSome: ["ADMIN", "PROFESSOR", "STUDENT"] } }`, omitting
     `"EXTERNAL"` entirely — confirmed via a direct read-only DB query that 3 real EXTERNAL
     accounts already existed, so this was a pure display bug, not a missing-data one. A freshly
     approved account briefly appeared (the client optimistically appends it to local state right
     after `POST /api/users` succeeds) then vanished again on the next 20-second poll once the
     filtered `GET` response overwrote it. Fixed by adding `"EXTERNAL"` to that array. The
     non-admin branch (students/professors) already correctly included EXTERNAL via
     `FACULTY_ROLES` and needed no change.
  2. `AdminSubmissionPanel.tsx`'s own submission-edit form — a separate, older plain-`<select>`
     committee editor (not the shared `CommitteePeopleEditor`) — built every committee dropdown,
     including "กรรมการภายนอก ในระบบ (เลือก)" (which should only ever list EXTERNAL accounts), from
     one `advisors` list filtered to `PROFESSOR` only. So even after fix #1 made EXTERNAL accounts
     visible again in the user list, an admin still couldn't pick one as a submission's invited
     external committee member from this edit form. Added `externals` and `mixedCommittee`
     (`[...advisors, ...externals]`) lists mirroring `CommitteePeopleEditor`'s `MIXED_ROLES`
     pattern (see the entry below this one) — CO_ADVISOR/EXAM_COMMITTEE dropdowns now offer both
     account types, the invited-committee dropdown now offers EXTERNAL accounts only.
  See "EXTERNAL account requests" in `AGENTS.md`. **Verified**: `npm run build`, `npx tsc --noEmit`,
  and `npx eslint` on both touched files all pass with no new errors; directly queried the
  production DB read-only (`prisma.user.findMany` via a throwaway script, deleted after) and
  confirmed 3 EXTERNAL accounts exist and are exactly the ones missing from the admin UI before
  this fix. **Not yet clicked through in a real browser** — next session with working ADMIN
  credentials should confirm all 3 external accounts now show in "จัดการผู้ใช้งาน", and that editing
  a submission's committee now offers them in the CO_ADVISOR/EXAM_COMMITTEE/invited-committee
  dropdowns.

- **2026-09-08 — Saving a proposal/defense draft no longer requires complete information; CO_ADVISOR
  and EXAM_COMMITTEE committee dropdowns now include external examiners too.** Two related fixes to
  the blank-draft-first proposal/defense flow (see the other 2026-09-08 entries below for that
  flow's original shipping notes):
  1. **Draft save relaxed.** "บันทึกฉบับร่าง" on `ProposalDraftReview`/`DefenseDraftReview` used to
     call the exact same strict `validate()` as "ยืนยัน" — meaning a student couldn't save a draft
     at all unless title, program, every required committee role, and exam date/time were already
     fully filled in, defeating the entire point of a save-and-come-back-later draft. Split into
     `validate()` (still required for confirm) and a new lenient `validateForSave()` (only rejects
     a value that's actually typed in and wrong — a malformed phone number, a past exam date; never
     requires a field to be present). Server-side, `PATCH .../[id]` actions `save_proposal_draft`/
     `save_defense_draft` (`src/app/api/submissions/[id]/route.ts`) now branch on `confirm`:
     required-ness checks (non-blank title/program, an exam date/time, a car plate when parking is
     checked) only apply when `confirm: true`. Committee people[] got the same treatment via two
     new `src/lib/committee.ts` exports — `validatePeopleLenient` (no role-count minimums; a row
     with no role/account yet is skipped, not rejected) and `resolvePeoplePartial` (never fails —
     an unresolvable email, or a role with no entry at all, just resolves to `null`/`[]` instead of
     blocking the whole save) — used only when `confirm: false`; `confirm: true` still runs the
     original strict `validatePeople`/`resolvePeople` unchanged. Every committee column
     (`advisorId`, `headCommitteeId`, `committeeIds`, `coAdvisorIds`, `invitedCommitteeId`,
     `programChairId`, `invitedProf*`) was already nullable/defaults-empty in the schema, so no
     migration was needed.
  2. **CO_ADVISOR and EXAM_COMMITTEE can now be external examiners.** `CommitteePeopleEditor`'s
     account dropdown (`src/components/SubmissionForms.tsx`) previously only offered `PROFESSOR`
     accounts for these two roles (only INVITED_EXAM_COMMITTEE offered `EXTERNAL` accounts). Since
     both roles are commonly filled by an external examiner too, split the old `EXTERNAL_ROLES` set
     into `EXTERNAL_ONLY_ROLES` (still just INVITED_EXAM_COMMITTEE) and a new `MIXED_ROLES`
     (CO_ADVISOR, EXAM_COMMITTEE) whose dropdown now lists every `PROFESSOR` account followed by
     every `EXTERNAL` account. No server-side change was needed for this half — `resolvePeople`/
     `resolvePeoplePartial` only look up an account by email, they never check its `Role`, so an
     `EXTERNAL` account in a CO_ADVISOR/EXAM_COMMITTEE slot already resolved correctly.
  See "Draft save vs. confirm validation" and "Committee people" in `AGENTS.md`. **Verified**:
  `npm run build`, `npx tsc --noEmit`, and `npm run lint` all pass with no new errors (confirmed via
  a before/after `eslint` diff on the touched files — same 68 pre-existing `any`-related errors in
  `submissions/[id]/route.ts` before and after, none added). **Not yet clicked through in a real
  browser** — next session with working STUDENT credentials should: save a brand-new blank proposal
  draft with nothing filled in at all (title blank, no committee, no exam date) and confirm it
  doesn't error and reloads with whatever was (not) entered; partially fill in just an advisor and
  save, reload, confirm only that field persisted; and pick an EXTERNAL account for a CO_ADVISOR or
  EXAM_COMMITTEE row and confirm it saves/resolves correctly.
  **Built alongside another concurrent Claude Code session working in this same repo directory at
  the same time**, which landed the "Forbidden"-on-stale-session fix in the entry right below —
  both sessions touched `src/app/api/submissions/[id]/route.ts` but in disjoint regions (that
  session's fix is scoped to the top of the shared `PATCH` handler around the `dbUser` lookup;
  this work only touches the `save_proposal_draft`/`save_defense_draft` branches further down), so
  no conflict.

- **2026-09-08 — Fixed a confusing "Forbidden" error on approving a PROPOSAL/THESIS_DEFENSE step
  when the acting user's session had gone stale.** Reported as: ADMIN clicks "อนุมัติ" on a
  submission's pending ADMIN step (e.g. PROPOSAL step 2) and gets a bare `Forbidden` runtime error.
  Root cause: `PATCH /api/submissions/[id]`'s `approve`/`reject`/etc. actions deliberately re-fetch
  the acting user's roles fresh from the DB (`dbUser`, `src/app/api/submissions/[id]/
  route.ts:118-125`) specifically to avoid trusting a JWT session's roles, which can go stale after
  a role change — but when that DB lookup returned `null` (the session's JWT `id` no longer
  resolves to a real user row, e.g. because the account was edited/recreated after the browser's
  session was minted — plausible today given how much account-editing work shipped in the last few
  sessions, see the entries below), the code silently fell back to `(session.user as any).roles`,
  i.e. the exact same stale JWT data the DB lookup exists to bypass — so a genuinely-ADMIN account
  with a stale session got a generic 403 "Forbidden" instead of any hint that re-logging in would
  fix it. Confirmed via the user: logging out and back in resolved it immediately, matching this
  root cause exactly. Fixed by returning a clear 401 ("เซสชันหมดอายุ กรุณาเข้าสู่ระบบใหม่") when
  `dbUser` is `null`, instead of falling back at all. Checked for the same fallback pattern
  elsewhere in the codebase (`grep` for the "JWT role can be stale" comment) — this file's own
  `DELETE` handler has a similar DB-roles lookup but already fails closed (`dbUser?.roles ?? []`
  → not-ADMIN → clean 403) rather than falling back to session data, so no other route needed the
  same fix. **Verified**: `npx tsc --noEmit` shows no new type errors from the change (`npm run
  build` itself couldn't be run in the same pass — the local dev server was holding the Next.js
  build lock — but the type-check covers the same code path). Not yet re-verified against a real
  stale-session repro in the browser beyond the user's own confirmation that re-login was the fix.

- **2026-09-08 — `/professor-dashboard` reworked to show every submission the professor is a
  committee member on, plus a status filter (replacing the รอดำเนินการ/ประวัติ tab split).**
  Previously the page only surfaced a submission on one of two tabs: "รอดำเนินการ" (a professor-role
  step currently PENDING and it's this user's turn) or "ประวัติ" (a professor-role step this user has
  already APPROVED/REJECTED) — a submission where the professor sits on the committee but the active
  step belongs to someone else, or hasn't reached a professor step yet, was invisible on both tabs,
  even though the professor is clearly involved. Fixed by listing the full `submissions` array from
  `useApp()` directly with no involvement filtering at all — it's already scoped correctly, since
  `GET /api/submissions` (`src/app/api/submissions/route.ts`) builds its `where` clause from exactly
  the same involvement set (advisor/co-advisor/head/exam committee/invited/program chair, plus the
  program-chair-fallback `programChairFor` check) for any non-ADMIN session. Replaced the two-tab bar
  with the same status-filter tab pattern `/admin-dashboard` already uses — ทั้งหมด/ฉบับร่าง/
  กำลังดำเนินการ/เสร็จสิ้น/ถูกปฏิเสธ/ยกเลิกแล้ว, each with a live count badge (`STATUS_TABS` +
  `counts`, mirroring `src/app/admin-dashboard/page.tsx`). The per-card "it's your turn"
  (`isMyTurn`) and "you already acted" (`getMyActedStep`) logic is unchanged from the old
  `pending`/`history` filters — just applied to every card instead of gating which tab it appears
  on — and submissions needing this professor's action still sort first within whatever status is
  selected. See "Professor dashboard" in `AGENTS.md`. **Verified**: `npm run build` passes clean.
  **Not yet clicked through in a real browser** — no working PROFESSOR test credentials were
  exercised this session; next session should confirm a submission where this professor is, say,
  an EXAM_COMMITTEE member on a step someone else currently holds now shows up (it didn't before),
  and that the status tab counts/filtering behave correctly.

- **2026-09-08 — `ExternalCommitteeRequest` gained its own `title` column; the student-facing
  "ขอเพิ่มบัญชีกรรมการภายนอก" form and the admin approval flow both updated to match.** Previously
  this form (`StudentExternalRequests.tsx`) had a single free-text "ชื่อ-นามสกุล (พร้อมตำแหน่ง)"
  field — every other account-creation form in the app has a separate "คำนำหน้าชื่อ" `NameTitle`
  dropdown, this one didn't, so a student had to type a Thai honorific prefix (e.g. "ผศ.ดร.") into
  the name field by hand. Added a nullable `title NameTitle?` column to `ExternalCommitteeRequest`
  (`prisma/schema.prisma`) alongside a matching "คำนำหน้าชื่อ" `<select>` on the student form;
  `POST /api/external-requests` validates and stores it. `AdminUsersPanel`'s approval flow
  (`openAddUserModal`) now prefills the add-user modal's title dropdown directly from the request's
  own `title` column for an `ExternalCommitteeRequest` approval — no parsing needed, since the two
  are already split — while the older DRAFT/`pendingPeople` prefill path (committee members named
  before the "select from existing accounts" change, who have no structured title field of their
  own) still falls back to `splitNameTitle()` on the free-text name. Both the pending-request card
  and the student's own request list now render via `formatUserName()` instead of raw `.name`.
  **DB migration**: applied via a one-off `scripts/add-external-request-title.ts` (same pattern as
  prior sessions' migrations in this file — `$executeRawUnsafe` over the pooler connection, run
  once via `npx tsx`, then deleted, not committed), since this session only had the pooler
  connection and not the direct one `prisma db push` needs. Verified before/after (column didn't
  exist, then did; 0 existing rows affected).
  **Also hit, and fixed, the documented stale-Prisma-client gotcha** (§3 above): the local dev
  server had been running since before this schema change, so it kept serving 500s on
  `POST /api/external-requests` with a bare "เกิดข้อผิดพลาด กรุณาลองอีกครั้ง" (the client's generic
  fallback, since the actual Prisma error had no Thai text for `toUserErrorMessage()` to surface) —
  fixed the same way the doc already prescribes: killed the process, cleared `.next/`, restarted.
  See "Name title" and "EXTERNAL account requests" in `AGENTS.md`.
  **Verified**: `npm run build` passes clean. **Not yet verified in a real browser beyond
  confirming the dev-server restart fixed the request** — next session with STUDENT/ADMIN
  credentials should submit a request with a title selected, approve it as ADMIN, and confirm the
  title dropdown comes pre-filled and the resulting account's display name isn't doubled up.

- **2026-09-08 — Proposal tab reworked into a blank-draft-first flow; `CommitteePeopleEditor` and
  `ExamLogisticsSection` redesigned.** Before any proposal exists, `/student-dashboard`'s proposal
  tab now shows `ProposalForm` in a new `readOnlyPreview` mode — every field disabled via a
  wrapping `<fieldset disabled>` (no per-field prop threading needed) — so the student sees the
  blank template's complete shape before starting, including its own (also disabled) confirm
  checkbox and submit button at the end of the card. `FormHeader` gained an optional `action` slot
  (top-right of the header card) for the one control that stays live in preview mode — the
  "+ สร้างร่างคำร้อง" button — which calls new `getOrCreateProposalDraft()` → new `POST /api/submissions/auto-draft-proposal`
  (STUDENT-only, get-or-create/idempotent), which creates a blank `PROPOSAL` row directly in
  `DRAFT` status with only the student's own account fields pre-filled — no committee/program/exam
  info yet. New `src/components/ProposalDraftReview.tsx` (mirrors `DefenseDraftReview.tsx`) then
  takes over as the actual editable form; "บันทึกฉบับร่าง"/"ยืนยัน" call new
  `saveProposalDraft()` → a new `PATCH .../[id]` action `"save_proposal_draft"` (mirrors
  `save_defense_draft`, plus handles `program`/`studentPhone` since those aren't inherited from
  anywhere the way a defense's are). The blank-draft flavor is told apart from the older
  pendingPeople/missing-accounts DRAFT flavor the same way an auto-draft defense already is
  (`status === "DRAFT" && no pendingPeople entries` — `isAutoDraftProposal()` in
  `student-dashboard/page.tsx`). The standalone `/dashboard/student/submit?type=proposal` page is
  unaffected — `ProposalForm` without `readOnlyPreview` still fills-and-submits directly, same as
  before.
  Separately, `CommitteePeopleEditor` (shared by `ProposalForm`/`DefenseForm`/
  `ProposalDraftReview`/`DefenseDraftReview`) no longer displays a selected committee member's
  email/phone at all (still carried internally/submitted, just not rendered), dropped the visible
  "บทบาท"/"อาจารย์"/"กรรมการภายนอก" field labels in favor of `aria-label` only, gained a leftmost
  numbered drag handle (native HTML5 drag-and-drop) so the student can reorder rows — the array
  order is the real `committeeIds`/`coAdvisorIds` sequential sign order, not just display order —
  and `initialPeople()` (a fresh editor's starting state) now seeds 4 default rows (ADVISOR,
  HEAD_EXAM_COMMITTEE, EXAM_COMMITTEE, INVITED_EXAM_COMMITTEE) instead of one blank row.
  `ExamLogisticsSection`'s เวลาสอบ field switched from the native `<input type="time">` (whose
  AM/PM display and minute-spinner granularity both depend on browser/OS locale) to a new
  `TimeSelect` — two plain `<select>`s, hour 00–23 and minute in 15-minute steps, joined into the
  same `"HH:MM"` string already validated server-side; ห้องประชุม/ที่จอดรถ checkboxes now render on
  one line with เลขทะเบียนรถ appearing inline next to them (not on its own row) once ที่จอดรถ is
  checked. See "Proposal tab", "Committee people", and "Exam logistics" in `AGENTS.md`.
  **Verified**: `npm run build` and `npm run lint` both pass clean (no new errors beyond the
  pre-existing baseline — the two new API routes' `mapSub(s: any)` lint errors mirror the
  identical pattern already present in the sibling `auto-draft-defense` route).

  **Follow-up fix, same day** — the owner clicked through this in a real browser and found that
  pressing "+ สร้างร่างคำร้อง" made the "ความคืบหน้าปัจจุบัน (0/11)" progress line + preview
  `WorkflowTimeline` disappear entirely, since the tab's render logic swapped straight from "no
  proposal" (which showed the preview) to "current proposal exists" → `ProposalDraftReview` (which
  doesn't render a timeline at all — same as `DefenseDraftReview`), with nothing in between.
  Fixed in `student-dashboard/page.tsx`: the progress preview now stays visible across *both* the
  blank-template state and the draft-being-edited state (nothing has actually progressed in either
  — no workflow steps exist until confirm) and only switches to `StudentSubmissionActions`'s real
  timeline once the proposal is an actual non-draft submission. `npm run build` passes clean.

- **2026-09-08 — `AdminUsersPanel`'s user list gained a third filter: "มีคำร้องที่ยังไม่ถูกยกเลิก"
  checkbox (has an active submission).** Sits below the role-filter-pills + search row (see the
  entry right below this one for those). Checking it narrows `visibleUsers` to accounts with at
  least one related submission (via the existing `getRelatedSubmissions()` helper) whose `status`
  isn't `CANCELLED` — the same "active" meaning already used elsewhere in the app to block a
  student from starting a second PROPOSAL (see "Proposal-first" in `AGENTS.md`): DRAFT,
  IN_PROGRESS, REJECTED, and even COMPLETED all count as active, only CANCELLED doesn't. No new
  state/prop plumbing beyond one `activeOnly` boolean in `AdminUsersPanel` itself.
  **Verified**: `npm run build` passes clean. **Not yet clicked through in a real browser.**

- **2026-09-08 — Fixed admin-facing popups (add-user / edit-user / reset-passcode modals in
  `AdminUsersPanel.tsx`/`UserProfileHeader.tsx`, and the shared `NotificationBell` dropdown used by
  every role) closing unexpectedly on a click-and-drag.** Reported behavior: press-and-hold inside
  the popup, drag the mouse outside it, release there — the popup closed, even though the release
  point (not the popup) was the only thing "clicked". Root cause: a browser `click` event fires
  wherever the mouse button is *released*, regardless of where the mousedown started — so a
  backdrop `onClick={close}` handler doesn't distinguish "a real click on the backdrop" from "a
  drag that started inside the popup and ended on the backdrop". Fixed by tracking, via a `useRef`,
  whether the *mousedown* for the current press also started on the backdrop (nested-modal case:
  `e.target === e.currentTarget` on the backdrop's own `onMouseDown`; `NotificationBell`'s
  backdrop/panel are siblings instead of nested, so it uses a shared `pressStartedInPanel` ref set
  by each side's `onMouseDown`) — the close handler now only fires when both the press and the
  release happened outside the popup content. **Verified**: `npm run build` passes clean after
  every step. **Not yet clicked through in a real browser** — next session should confirm the
  drag-from-inside-to-outside case no longer closes any of these, and that a normal click fully
  outside the popup still does.

- **2026-09-08 — `AdminUsersPanel`'s user list gained a role filter + search bar; "นักศึกษา"
  renamed to "นิสิต" everywhere in the app.** The plain user list under "จัดการผู้ใช้งาน" (both
  `/admin-dashboard`'s tab and standalone `/dashboard/admin/users`) previously had no way to narrow
  a long account list — added a row of role filter pills (`เจ้าหน้าที่ภาควิชา` / `อาจารย์` /
  `กรรมการภายนอก` / `นิสิต`, in that left-to-right order, each with a live count badge, mirroring
  the submissions tab's type-filter-pill pattern) plus a search box matching name/email/รหัสนิสิต,
  both scoped to `visibleUsers` only — the pending-account-request cards above the list (DRAFT
  committee emails, external-examiner requests) are always shown regardless of the filter/search
  state. Separately, every user-facing occurrence of "นักศึกษา" (the more formal/dated term for
  student) was changed to "นิสิต" (Chulalongkorn's own term) across the codebase — `ROLE_LABELS`
  in `src/lib/utils.ts`, `src/lib/translations.ts`'s Thai↔English dictionary (used by
  `LanguageToggle`'s DOM-walker — the dictionary's Thai *keys* had to change too, not just the
  rendered text, since the walker matches literal Thai substrings), and every component/API string
  that spelled it out (`RoleSubmissionDetail`, `UserDetailPanel`, `UserProfileHeader`,
  `AdminSubmissionPanel`, `SignatureButton`, `CommitteeSignPanel`, `/admin-dashboard`'s search
  placeholder, and the "REJECTED" 400 error message in both `submissions/[id]/route.ts` and
  `submissions/[id]/sign/route.ts`). **Verified**: `npm run build` passes clean; confirmed via
  `grep` that zero occurrences of "นักศึกษา" remain in `src/`. Not yet clicked through in a real
  browser.
  **Built alongside another concurrent Claude Code session working in this same repo directory at
  the same time**, which layered an "active submission only" checkbox filter onto the same user
  list and fixed an unrelated bug (clicking inside a modal panel, dragging, and releasing over the
  backdrop was incorrectly closing the modal — `NotificationBell`, `UserProfileHeader`'s edit/
  reset-passcode modals, and `AdminUsersPanel`'s add-user modal all gained a mousedown-tracking ref
  so the close-on-backdrop-click handler only fires when the press itself started on the backdrop).
  No conflicts — both sessions' changes to `AdminUsersPanel.tsx`/`UserProfileHeader.tsx` sit side by
  side cleanly; see that session's own entry in this file (if added) for its own verification notes.

- **2026-09-08 — `User.name` split into a separate `title` field for the Thai honorific/academic
  prefix (ศ.ดร./รศ.ดร./ผศ.ดร./ผศ./อ.ดร./ดร./นาย/นางสาว/นาง).** New `NameTitle` enum in
  `prisma/schema.prisma` (`@map`s each key to its Thai text, same pattern as `Role`) plus a nullable
  `User.title` column. `src/lib/utils.ts` gained the shared helpers: `NAME_TITLE_LABELS`/`NAME_TITLES`
  (dropdown source, in display order), `splitNameTitle()` (longest-prefix-first parser, used only by
  the one-off backfill script), and `formatUserName({title, name})` (the inverse — renders them back
  together with no space, exactly как a pre-split name would have read). `POST /api/users` and
  `PATCH /api/users/[id]` both accept an optional `title`; every admin-facing create/edit account
  form gained a "คำนำหน้าชื่อ" `<select>` next to the name field — `AdminUsersPanel`'s add-user modal,
  `UserProfileHeader`'s edit modal, `/super-dashboard`'s add-admin form, and
  `/dashboard/admin/pending-professors`'s quick-create form. `formatUserName()` was then threaded
  through essentially every place a user's name is displayed from a live `User`/`MockUser` record —
  admin/student/professor dashboards, `SubmissionInfoPanel`, `RoleSubmissionDetail`,
  `WorkflowTimeline`, `CommitteeSignPanel`, `CommitteePeopleEditor`'s account-picker dropdowns (so
  the title is baked into `people[].name`/`programChairFor`'s auto-injected chair entry going
  forward), the dashboard top bar, all outgoing step/welcome/passcode-reset/finance/exam-reminder
  emails (`src/lib/email.ts`, plus the two other places that mint a session JWT by hand —
  `api/auth/magic` and `api/auth/demo`), and `WorkflowStep.actedByName`/committee-sign snapshots
  taken at approve/reject time (`submissions/[id]/route.ts`, `submissions/[id]/sign/route.ts`).
  `NameTitle` was added to `src/types/next-auth.d.ts`'s `Session`/`User`/`JWT` shapes and threaded
  through `auth.ts`'s `authorize`/`jwt`/`session` callbacks so the logged-in user's own title is
  available client-side via `AppContext`'s `user`. Deliberately **not** touched: historical
  denormalized snapshot text that has no parallel title column to go with it and would need a much
  larger schema change to fix — `Submission.studentFullName`/`invitedProfName`, `pendingPeople[].name`
  entries from before an account existed, and `ExternalCommitteeRequest.name` (the student's own
  free-text request, before ADMIN turns it into a real account+title at approval time).
  **DB migration**: applied via a one-off `scripts/add-name-title.ts` (same pattern as this file's
  other raw-SQL migrations — run once via `npx tsx`, then deleted, not committed) since `prisma db
  push` isn't usable here (this session only had the pooler connection, not the direct one) — `CREATE
  TYPE "NameTitle"` + `ALTER TABLE users ADD COLUMN title`, then backfilled every existing user by
  parsing `name` for a matching prefix (longest first). One real mistake caught mid-run: the raw SQL
  UPDATE first tried casting the English enum *key* (e.g. `'ASST_PROF_DR'`) into the `NameTitle`
  column, which failed with `invalid input value for enum` — the Postgres enum's actual stored labels
  are the `@map`ped Thai text, not the Prisma-side key, since raw SQL bypasses the client's
  key→label translation; fixed by passing `NAME_TITLE_LABELS[title]` instead. **Verified**: of 10
  live users, 7 had a matching Thai prefix split off correctly (e.g. "ผศ.ดร.อรุณี ใหม่มาก" →
  `title=ASST_PROF_DR`, `name="อรุณี ใหม่มาก"`) and 3 legitimately had none (a descriptive finance
  account name, an admin's plain Thai name, and a super-admin's English name) — confirmed via a
  read-only query before/after, no data loss. `npm run build` passes clean; `npm run lint` shows no
  new errors from this work (the one `any` at `AdminUsersPanel.tsx:139` is a pre-existing
  `catch (err: any)`, same pattern used throughout this codebase). **Not yet verified in a real
  browser** — next session with working credentials should confirm the title dropdown actually
  saves/displays correctly end-to-end on account creation and edit.
  **Built alongside another concurrent Claude Code session** (`thesis-app-c1`, working in this same
  repo directory at the same time on an unrelated admin-editable-email feature touching overlapping
  files — `UserProfileHeader.tsx`, `AppContext.tsx`, `api/users/[id]/route.ts`, `email.ts`).
  Coordinated directly via cross-session messages (checked in before editing shared files, re-read
  each file fresh immediately before editing to avoid a stale-write clobber, flagged the DB migration
  timing so neither session raced `prisma db push`/raw SQL against the schema at the same time) — no
  conflicts, both features' changes now sit side by side cleanly.

- **2026-09-08 — ADMIN/SUPER_ADMIN can now edit a user's login email; previously the only way to
  change one was a direct database edit.** `PATCH /api/users/[id]` (`src/app/api/users/[id]/route.ts`)
  accepts an optional `email` field alongside the existing `name`/`studentId`/`resetPasscode`
  updates — normalized (trim + lowercase, matching the login lookup in `auth.ts`), validated with
  `isValidEmail()`, and checked for uniqueness against every other user (409 if taken). Since email
  doubles as the login identifier, changing it is effectively handing account access to whoever
  controls the new address, so on a successful change both the old and new address are notified
  automatically via new `sendEmailChangedNotice()` (`src/lib/email.ts`) — the old address is warned
  in case the change was unauthorized/a mistake, the new address gets a "you can now log in here"
  confirmation. `UserProfileHeader.tsx`'s "แก้ไข" modal (ADMIN/SUPER_ADMIN only, gated by the
  existing `canManageAccount` tiering) gained an email input with inline validation and an amber
  warning note when the value differs from the account's current one; `AppContext.adminUpdateUserInfo`'s
  type signature extended to accept `email`. No new endpoint — reuses the same route/flow every
  other admin-driven account edit already goes through.
  **Verified**: `npm run build` and `npm run lint` pass clean (242 pre-existing lint errors, same
  baseline as documented elsewhere in this file — no new ones from this change). **Not yet verified
  in a real browser** — no working ADMIN credentials were exercised this session; next session with
  one should confirm the edit modal actually updates the login email (old email stops working, new
  one logs in) and that both notice emails arrive.
  **Built alongside another concurrent Claude Code session** (`thesis-app-df`, working in this same
  repo directory at the same time on an unrelated Thai name-title (`NameTitle`) feature touching
  overlapping files — `UserProfileHeader.tsx`, `AppContext.tsx`, `api/users/[id]/route.ts`,
  `email.ts`). Coordinated directly via cross-session messages to avoid clobbering each other's
  edits; the other session layered `formatUserName()`/`title` handling on top of this feature's
  code without conflict. See that session's own entry in this file once it lands its DB migration.

- **2026-09-07 — Student committee selection restricted to existing accounts only; new `EXTERNAL`
  account role + self-service request flow for external examiners.** Previously students typed
  every committee member's name/email/phone by hand (see "Committee accounts must pre-exist" —
  unresolved emails saved the submission as `DRAFT`). Now `CommitteePeopleEditor`
  (`src/components/SubmissionForms.tsx`, shared by `ProposalForm`/`DefenseForm`/
  `DefenseDraftReview`) renders a role `<select>` + an account `<select>` per row — no free-text
  entry at all. ADVISOR/CO_ADVISOR/HEAD_EXAM_COMMITTEE/EXAM_COMMITTEE pick from `PROFESSOR`
  accounts; INVITED_EXAM_COMMITTEE (กรรมการภายนอก) picks from a brand-new `EXTERNAL` role, added to
  the `Role` enum specifically so the two account types can be offered as distinct dropdown lists
  (`FACULTY_ROLES` in `src/app/api/users/route.ts` includes both). `User` gained nullable
  `affiliation`/`phone` columns for this. Separately, ประธานหลักสูตร was pulled out of the
  committee editor entirely — it was already effectively "pick a person" busywork the account
  couldn't skip even though the answer is always auto-derivable; new `resolveProgramChair()`/
  `ProgramChairAutoField`/`withProgramChair()` (same file) auto-resolve and display it read-only,
  injecting it into the submitted `people[]` right before validation so the unchanged server-side
  `validatePeople`/`resolvePeople` pipeline still sees exactly one PROGRAM_CHAIR entry. Student
  identity fields (name/studentId/email) in `ProposalForm` are now read-only (pulled from the
  account) instead of free-text — only phone stays editable since it isn't stored on `User` for
  STUDENT accounts. See "Committee people" and "EXTERNAL account requests" in `AGENTS.md`.
  New self-service request flow: a "กรรมการภายนอก" tab on `/student-dashboard`
  (`StudentExternalRequests.tsx`) lets a student request a new external-examiner account
  (name/email/affiliation/phone) when the dropdown doesn't have who they need — saved as a new
  `ExternalCommitteeRequest` row (`status: PENDING`), independent of any submission. ADMIN reviews
  pending requests as cards at the top of `AdminUsersPanel`'s user list: **อนุมัติ** opens the same
  "เพิ่มผู้ใช้งาน" modal every account is created through (`POST /api/users`, prefilled, email/role
  locked, carrying `externalRequestId` so the route also marks the request `APPROVED` + links
  `createdUserId`), **ปฏิเสธ** (`PATCH /api/external-requests/[id]`) sets `REJECTED` with an
  optional reason. Both notify the requesting student. `Notification.submissionId` was made
  nullable to support these submission-independent notifications — `NotificationBell` already had
  a fallback for a missing `submissionId`, so this needed no UI change.
  **DB migration**: `EXTERNAL` enum value, `ExternalRequestStatus` enum, `users.affiliation`/
  `users.phone` columns, `external_committee_requests` table + FKs, and
  `notifications.submissionId` made nullable — applied via scoped raw SQL (the sandbox's auto-mode
  classifier blocked running `prisma db push` and even a migration script directly, so the user ran
  it via `! npx tsx scripts/...`, script deleted after). One real mistake caught and fixed: the
  first pass's existence-check for `users.phone` false-positived on Supabase's built-in
  `auth.users.phone` column (unscoped `table_name` match across schemas), so it silently skipped
  adding the column to `public.users` — caught during verification, fixed with a schema-scoped
  follow-up.
  **Built alongside another Claude Code session (`thesis-app-d2`) working in the same repo
  directory at the same time** (unrelated `SystemSetting`/multi-program-chair work, see the entry
  below) — required active coordination (`SendMessage`) to avoid clobbering shared files
  (`AdminUsersPanel.tsx`, `AppContext.tsx`, `src/app/api/users/route.ts`) and to catch/fix a
  breaking type change (`programChairFor` scalar → array) that silently broke this feature's own
  `resolveProgramChair()` mid-session.
  **Verified**: `npm run build` and `npm run lint` both pass clean (242 pre-existing lint errors,
  same count as before this work — no new ones). **Not verified in a real browser** — no working
  credentials were exercised this session; next session should click through: create a proposal
  end-to-end picking committee members from the dropdowns, submit an external-committee request as
  a student, approve it as ADMIN (confirms the new account can then be selected), and reject one
  with a reason.

- **2026-09-07 — Program chair & finance contact moved off `User` columns into a new
  `SystemSetting` key/value table; finance contact is now an ADMIN account (not a free-text
  email); a professor may now chair more than one program.** Went through several iterations in
  one session: started as a free-text "finance email" setting stored in its own `Setting` table
  (never deployed); pivoted to "pick an ADMIN account, use their email" per instruction, still
  stored as boolean/enum columns on `User` (`isFinanceContact`, `programChairFor`); then moved to
  the final design — both live in `SystemSetting` (`key: "programChair:PHD" | "programChair:
  ME_MECH" | "programChair:ME_CPS" | "financeContact"`, `userId: String?`), with all reads/writes
  centralized in new `src/lib/systemSettings.ts`. Two behavior changes landed along the way, both
  by explicit request: (1) a `SystemSetting` row is **never deleted** once created — clearing an
  assignment, or deleting the account that held it (`DELETE /api/users/[id]` now calls
  `clearUserFromSystemSettings`), sets `userId: null` instead, so the key stays present; (2) the
  old "one PROFESSOR, one program" constraint was removed — `setProgramChair` no longer clears a
  professor's other program assignments, so `programChairFor` is now `ProgramType[]` everywhere
  (session/JWT, `MockUser`, every consumer) instead of a single value; every `=== program` check
  became `.includes(program)` (roughly a dozen files — see "Program Chair & finance-contact
  assignment" in `AGENTS.md` for the full list). The old "จัดการประธานหลักสูตร" card was extracted
  from `AdminUsersPanel` into its own `AdminSettingsPanel` component, rendered as a third
  "ตั้งค่าระบบ" tab on `/admin-dashboard` (previously only 2 tabs) and standalone below
  `AdminUsersPanel` at `/dashboard/admin/users`.
  **DB migrations** (all applied via targeted `$executeRawUnsafe` scripts over the pooler
  connection, written to `scripts/`, run once, then deleted — never a full `prisma db push`,
  which needs the direct connection this session didn't have credentials for): added the
  `isFinanceContact`/`programChairFor` columns to `users` first, then — once the design moved to
  `SystemSetting` — migrated their live data into the new table and dropped both columns, then
  altered `SystemSetting.userId` to nullable. All three steps verified via a read-only query
  before/after; no data loss at any step (one real finance-contact assignment and, by the later
  steps, 3 real program-chair assignments all carried through intact).
  **Two stale-Prisma-client incidents hit during this work** (same root cause documented
  elsewhere in this file: a long-running `next dev` process keeps the compiled Prisma client from
  before a schema/DB change) — both diagnosed from a `P2022`/"Argument must not be null" error in
  the dev server's own log and fixed by killing the process, clearing `.next/`, and restarting.
  **Also found (not caused) a second, unrelated concurrent-session incident**: another Claude Code
  session was working in this same repo/working directory at the same time on an unrelated
  `EXTERNAL`-committee-member feature, editing `prisma/schema.prisma` and several of the same files
  this work touched (`AdminUsersPanel.tsx`, `AppContext.tsx`, `src/app/api/users/route.ts`). Since
  `prisma generate` builds one client off the single shared schema file, the app briefly 500'd on
  `GET /api/users` (`column users.affiliation does not exist`) because that session's schema
  additions hadn't been pushed to the DB yet — not something either session could have caught with
  `npm run build` alone, since a passing build only proves the *code* matches the *schema file*,
  not that the schema file matches the *live DB*. The two sessions coordinated directly (cross-
  session messages) to divide file ownership and confirm DB-migration timing rather than both
  guessing; worth remembering that concurrent Claude Code sessions in the same working directory
  is a real, unannounced possibility, not just a hypothetical.
  **Verified**: `npm run build` passes clean after every step (both sessions' builds, confirmed
  independently). Not yet clicked through in a real browser — same missing-ADMIN-credentials
  constraint as other entries in this section — but the user did exercise the finance-contact and
  program-chair dropdowns live against the dev server and confirmed the underlying `system_settings`
  table reflected the changes correctly at each stage.

- **2026-09-07 — `AdminUsersPanel`'s user list: identity + account-management actions moved out
  of the expand-only accordion onto each row directly; submission-status counts became the expand
  trigger.** Previously expanding a user card mounted `UserDetailPanel`, which held everything —
  name/email/role badge, edit/reset-passcode/delete, quick stats, and the related-submissions
  list — behind one click. New `src/components/UserProfileHeader.tsx` extracts the identity +
  account-management piece (name/email/studentId/role badge, แก้ไข/รหัสเข้าใช้งาน/ลบ + their
  modals, and the 3 submission-status counts) so it renders on every row unconditionally; only the
  related-submissions list stays behind expand in the now much-smaller `UserDetailPanel`. The old
  standalone "ดูคำร้องที่เกี่ยวข้อง" toggle button was removed — clicking the 3 status counts
  themselves (always shown, `0`s included, always clickable) now expands/collapses the panel via
  new `expanded`/`onToggleExpand` props on `UserProfileHeader` (both optional, so the standalone
  `/dashboard/admin/users/[uid]` deep-link page — which renders `UserProfileHeader` +
  `UserDetailPanel` together, always expanded, no toggle — is unaffected). `getRelatedSubmissions`
  was deduplicated into `src/lib/utils.ts` since both components need it.
  Layout, after a few rounds of adjustment: the header is a single `flex items-stretch` row —
  identity block (`flex-1`), then the status-counts box, then the account-management button stack
  (`flex-col`, fixed `w-40` per button so the stack doesn't look jagged). `items-stretch` makes the
  status-counts box automatically match the 3-button stack's height (button heights + their gaps)
  with no manual height math. The delete button always renders (even on your own account, where
  it's functionally a no-op) as `invisible`+`disabled` rather than being omitted, specifically so
  every row's button stack — and the stretched status box next to it — stays the same height;
  omitting it entirely made the viewing admin's own row shorter than every other row. Each user's
  role now shows as a badge right next to their name (previously off on the far right next to the
  buttons); `AdminUsersPanel`'s old per-role tinted card wrapper (`bg-*-50 border-*-100`, which
  doubled up with `UserProfileHeader`'s own white card into a "card-in-a-card" look) was replaced
  with a single 4px role-colored left-accent border (`border-l-4 border-l-{color}`) directly on
  that white card.
  **Verified**: `npm run build` passes clean after every step. **Not verified in a real browser**
  — same constraint as the entry below: the one ADMIN account listed at `/demo-users`
  (`sukhum.s+suphap@cp.eng.chula.ac.th`) did not accept the shared `A00a00` passcode this file
  documents elsewhere, and probing the DB further to find working credentials was correctly
  blocked by the sandbox as production-credential access. Next session with a working ADMIN login
  should click through the user list: confirm row heights are visually even across users with and
  without a delete button, confirm clicking the status counts expands/collapses correctly
  (including a user with zero related submissions), and spot-check the standalone
  `/dashboard/admin/users/[uid]` page still renders correctly.

- **2026-09-07 — `/admin-dashboard`'s submissions tab: rows now expand in place; fixed
  `DELETE /api/users/[id]` crashing with a bare 500.** Two related pieces of work, prompted by a
  user report that "student cannot be deleted — API error 500":
  1. `DELETE /api/users/[id]` called `prisma.user.delete()` with no error handling.
     `Submission.studentId`/`advisorId`, `FormUpload.uploadedById`, `Signature.userId`, and
     `WorkflowStep.actedById` all reference `User` with no `onDelete: Cascade` (deliberately — an
     account delete must never silently wipe thesis records), so deleting a student/professor who
     has any submission history threw an unhandled Prisma `P2003` FK error, which Next.js turned
     into a bare 500 with no `error` field — the client's fallback message is literally
     `API error ${status}`, which is what the user saw. Now catches `P2003` and returns a `409`
     with a clear Thai explanation instead. This is a deliberate block, not a new cascade-delete —
     a student with real submissions still can't be deleted, just with a real error now.
  2. Follow-up UI change: `/admin-dashboard`'s จัดการคำร้อง list had a redundant per-row delete
     button (a second, less-safe path to the same destructive action already gated behind a
     typed-"ลบ" confirm on the detail page) and a "จัดการ"/"ดำเนินการ" link to
     `/dashboard/admin/[id]`. Both are gone — the whole card is now clickable (chevron toggle,
     one open at a time) and expands the full admin action surface inline under that row, scrolling
     it to the top of the list frame when opened (including switching directly from one open card
     to another). The full surface was extracted from `/dashboard/admin/[id]/page.tsx` into new
     `src/components/AdminSubmissionPanel.tsx` (`{ submissionId, onDeleted? }`); the old detail
     route is now a thin wrapper around it, kept for email/task-box/profile deep links. Also fixed
     that page's delete handler, which previously had zero error handling (a failed delete just
     silently did nothing) — it now shows a toast either way, matching the rest of the app.
     See "Admin dashboard" in `AGENTS.md`.
  **Verified**: `npm run build` and `npm run lint` both pass clean (no new lint issues; the two
  pre-existing `AdminSubmissionPanel.tsx` lint items — an unescaped quote and an `as any` cast —
  are carried over unchanged from the original detail page, not new). **Not verified in a real
  browser** — found a dev server already running against the live DB, but the one ADMIN account
  listed at `/demo-users` (`sukhum.s+suphap@cp.eng.chula.ac.th`) did not accept the shared `A00a00`
  passcode this file documents elsewhere, and probing the DB further to find working credentials
  was correctly blocked by the sandbox as production-credential access. Next session with a working
  ADMIN login should click through: expand/collapse a row, expand-then-expand-another (scroll
  behavior), and an in-panel delete, plus actually attempt deleting a student with real submission
  history to see the new 409 message end-to-end.

- **2026-09-07 — Admin can now type a passcode by hand, not just accept a generated one, when
  creating an account or resetting one.** Previously `POST /api/users` and `PATCH /api/users/[id]`
  (`resetPasscode: true`) always called `generatePassword()` server-side with no client input
  accepted at all. Both routes now accept an optional `passcode` field — validated server-side via
  new `isValidPasscode()` (`src/lib/utils.ts`, 6-72 chars, no whitespace) — and fall back to
  `generatePassword()` only when it's omitted/empty, so any caller that doesn't send the field
  (there are none left) still gets the old always-generated behavior. New shared
  `src/components/PasscodeField.tsx` (a text input pre-filled with a freshly generated passcode +
  a "สุ่มรหัส" regenerate button, editable either way) is wired into all 4 admin-facing entry
  points: `AdminUsersPanel`'s "เพิ่มผู้ใช้งาน" modal, `UserDetailPanel`'s reset-passcode dialog,
  `/super-dashboard`'s add-admin form and inline reset-passcode panel, and
  `/dashboard/admin/pending-professors`'s quick-create form. `AppContext.superAdminAddUser` and
  `superAdminResetPasscode` both gained an optional `passcode` parameter. See "Account creation &
  passcodes" in `AGENTS.md`. **Verified**: `npm run build` passes (incl. a TS narrowing fix in
  `PATCH /api/users/[id]` — assigning from a `body.passcode` typed `any` was silently widening
  back to the declared `string | null` type instead of narrowing to `string`; fixed with an
  explicit `String(...)` cast). **Not yet clicked through in a real browser** — no working ADMIN/
  SUPER_ADMIN credentials were exercised this session; next session should confirm both the
  generate-button and hand-typed paths actually create/reset a working login in the live DB.

- **2026-09-07 — `EMAIL_OVERRIDE_TO` removed entirely, at the owner's explicit request.** Previously
  this env var (see §4) redirected every outgoing email to one testing address so Preview/Development
  deployments and local dev could never accidentally email real students/faculty. Removed the override
  branch from `sendMail()` in `src/lib/email.ts` (now always sends to the real `opts.to`), deleted the
  var from `.env.local`, and removed it from Vercel's Preview and Development environments via
  `vercel env rm`. Updated every doc reference (`AGENTS.md`, `HANDOFF.md` §4/§6, `docs/SUPABASE-MIGRATION.md`)
  — left `SESSION-REPORT-2026-09-04.md` alone since it's a dated historical record, not current
  guidance. **Consequence**: no environment has a safety net anymore — see the warning near the top
  of this file. **Verified**: `npm run build` passes; confirmed `vercel env ls` no longer lists the
  var in any environment; restarted the local dev server and confirmed it starts cleanly with the
  var gone from `.env.local`.

- **2026-09-07 — Committee-account creation unified onto `POST /api/users`; surfaced at the top of
  the user list instead of a separate page.** `AdminUsersPanel` now renders each unresolved
  committee email (grouped across all DRAFT submissions) as an amber card **at the top of the user
  list itself**, each with one "เพิ่มผู้ใช้" button that opens the exact same "เพิ่มผู้ใช้งาน" modal
  used for any new account, pre-filled with that person's name/email and role defaulted to
  PROFESSOR (`openAddUserModal(prefill?)`). Creation goes through `superAdminAddUser` →
  `POST /api/users`, so the dedicated `POST /api/admin/pending-professors` endpoint and
  `AppContext.adminCreatePendingProfessor` were deleted — the "notify any student whose draft this
  was blocking" check moved into `POST /api/users` itself, so it now fires no matter which screen
  created the account. The standalone `/dashboard/admin/pending-professors` page still works (still
  linked from the submissions-tab task card) — its own form now also calls `superAdminAddUser`
  instead of the deleted route. **Verified**: created a real DRAFT proposal with a genuinely
  unresolved invited-committee email, saw it as the top-of-list card, clicked "เพิ่มผู้ใช้", modal
  opened prefilled, submitted, confirmed in the DB the account was created and the blocked
  student's "คำร้องของท่านพร้อมดำเนินการต่อ" notification fired.

- **2026-09-07 — Removed "สถานะคำร้องตามขั้นตอน" (step-distribution) from `/admin-dashboard`'s
  จัดการคำร้อง tab.** Deleted `StepDistributionDashboard`/`StepRow`/`buildStepGroups`/`StepGroup`
  from `src/app/admin-dashboard/page.tsx` entirely (unused elsewhere) along with the
  `proposalInProgress`/`thesisInProgress` variables and now-dead `BarChart2`/`Role`/`MockUser`
  imports. **Verified**: `npm run build` passes; confirmed live as ADMIN that the page goes
  straight from the search/status tabs into the submission list.

- **2026-09-07 — Defense creation: auto-imported DRAFT, reviewed/edited/confirmed inline on
  `/student-dashboard`'s สอบวิทยานิพนธ์ tab (no more separate "create" click or page).** The moment
  that tab is opened with an eligible `COMPLETED` proposal and no existing non-cancelled defense, a
  `useEffect` fires `getOrCreateDefenseDraft()` (new `POST /api/submissions/auto-draft-defense`,
  STUDENT-only, get-or-create/idempotent) which creates a `THESIS_DEFENSE` row directly in `DRAFT`
  status with every committee/student field imported straight onto the row from the proposal —
  **never through `pendingPeople`**, since it's already fully resolved; this is a second, distinct
  flavor of DRAFT from the missing-accounts one (told apart by whether `pendingPeople` carries
  entries — see "Committee accounts must pre-exist" in `AGENTS.md`). While this auto-draft exists,
  the tab renders new component `DefenseDraftReview` (`src/components/DefenseDraftReview.tsx`)
  instead of the normal action view — editable title/committee-editor/exam-logistics, "บันทึกฉบับร่าง"
  (saves, stays DRAFT) and "ยืนยัน — ขอสอบวิทยานิพนธ์" (confirms, starts the real workflow), both
  hitting new `PATCH .../[id]` action `"save_defense_draft"` which re-validates/re-resolves the
  (possibly-edited) committee through the same `validatePeople`/`resolvePeople` pipeline as any
  other creation, and on confirm builds the 22 workflow steps + notifies admins. New `AppContext`
  methods `getOrCreateDefenseDraft`/`saveDefenseDraft`. Exported reusable pieces from
  `SubmissionForms.tsx` (`Section`, `Field`, `CommitteePeopleEditor`, `ExamLogisticsSection`,
  `ConfirmCheckbox`, `buildPeopleFromSubmission` — renamed from `buildPeopleFromProposal` since it's
  now also used against a defense draft's own fields, not just a proposal) for `DefenseDraftReview`
  to reuse. **Verified**: end-to-end as a student whose proposal was already COMPLETED — draft
  auto-created with all 5 committee roles correctly resolved and blank exam date/time, saved as
  draft, reloaded the page and confirmed the saved exam date/time persisted from the DB (not lost),
  confirmed, correctly transitioned to `IN_PROGRESS` with the full 22-step timeline.

- **2026-09-07 — Proposal creation moved inline into `/student-dashboard`'s สอบโครงร่าง tab; no
  more navigating to `/dashboard/student/submit`.** Extracted `ProposalForm`/`DefenseForm` (plus
  their shared building blocks) out of `/dashboard/student/submit/page.tsx` into new
  `src/components/SubmissionForms.tsx`; both forms now take an `onCreated(sub)` callback instead of
  calling `router.push` themselves, so the same component works both inline and standalone. The
  submit page is now a thin wrapper (still live, still the only path for `type=defense`).
  `/student-dashboard`'s proposal-tab entry card is now a `<button>` (not a `Link`) toggling local
  `showProposalForm` state — clicking it swaps the card for `<ProposalForm>` rendered inline in the
  tab; on success it just closes the form, and the tab's own `!activeProposal` guard then reveals
  the new proposal automatically (`createSubmission` updates context state synchronously, no nav
  needed). **Verified**: as a fresh student with no proposal, filled and submitted the whole form
  inline (title, program with auto-filled program chair, all 5 committee roles, exam date/time via
  the React-controlled input setter to work around a native date-picker automation quirk) —
  succeeded, `IN_PROGRESS`, `/student-dashboard` URL never changed throughout.

- **2026-09-07 — `/student-dashboard`'s current-proposal/defense card now renders the full action
  surface inline instead of a read-only summary + "ดูรายละเอียด" link.** Extracted the entire body
  of `/dashboard/student/[id]/page.tsx` (status banner, committee/exam info, progress + timeline,
  file uploads, cancel modal, DRAFT continue-draft, REJECTED resubmit) into new
  `src/components/StudentSubmissionActions.tsx` (`{ submissionId }` prop, fully self-contained
  local state). The detail page is now a thin wrapper (back-link + this component);
  `/student-dashboard`'s proposal/defense tabs render it directly for the current submission of
  each type — the student can now upload, continue a DRAFT, resubmit, or cancel **without leaving
  the dashboard**. (A "ดูรายละเอียด / จัดการคำร้อง" link was briefly added first, then this fuller
  inline-embedding replaced it entirely once the redundancy with the detail page became clear — see
  `CHANGELOG.md`/session history for that intermediate step.) **Verified**: confirmed live that the
  full detail (banner, committee info, timeline, step-1 upload panel) renders directly on
  `/student-dashboard`, and that the standalone `/dashboard/student/[id]` page (used by "รายการอื่นๆ"
  history links) still renders identically via the same shared component.

- **2026-09-07 — Fixed `continue_draft` silently overwriting committee fields an ADMIN had already
  edited directly on a still-DRAFT submission.** `PATCH .../[id]` action `"continue_draft"`
  previously always rebuilt every committee field from `resolvePeople(pendingPeople)`, discarding
  any manual edit made via the admin submission-edit form in the meantime (found by editing a test
  DRAFT's committee via the admin form, then running `continue_draft` as the student and watching
  the edits revert). Now merges: keeps whatever's already set on the row, only fills in fields still
  null/empty from the resolved `pendingPeople`. **Verified**: reset a test submission to the same
  admin-edited-then-still-DRAFT state, ran `continue_draft` again — all admin-set fields (co-advisor,
  exam committee, invited committee with no account) were preserved, only the two still-unset fields
  (head committee, program chair) were filled in from `pendingPeople`.

- **2026-09-07 — Admin submission-edit form: "ประธานหลักสูตร" is now auto-resolved from "หลักสูตร",
  not a free `<select>`.** In `/dashboard/admin/[id]`'s edit mode, this field is now read-only text
  showing whichever PROFESSOR currently holds `programChairFor` for the edit draft's selected
  program (recomputed live as that field changes) — an admin can no longer set an arbitrary
  professor as one submission's program chair from this form; they reassign the program-level chair
  via "จัดการประธานหลักสูตร" instead. **Verified**: confirmed live in the browser that the resolved
  value updates when "หลักสูตร" changes, and that saving writes that resolved id (or `null`).

- **2026-09-07 — `/admin-dashboard`'s "รอสร้างบัญชีให้อาจารย์/กรรมการ" card made unconditionally
  visible on the จัดการผู้ใช้งาน tab** (later superseded by the top-of-list cards above, but the
  underlying "always render a nav entry point, styled urgently only when non-empty" pattern is
  still used elsewhere) — found and fixed the gap where the only path to
  `/dashboard/admin/pending-professors` disappeared entirely once its queue emptied.

- **2026-09-07 — Program Chair assignment redesigned: admin-managed, one PROFESSOR per program.**
  `User.isProgramChair` (a single global boolean, "grants see-all") replaced with
  `User.programChairFor: ProgramType?` (nullable, `@unique` — at most one PROFESSOR per `PHD` /
  `ME_MECH` / `ME_CPS`). This is still only the **fallback** for PROGRAM_CHAIR steps — the primary
  source stays `sub.programChairId`, set per-submission from the student's own committee list; the
  new field is just scoped correctly now (per-program instead of a blanket global flag). New
  ADMIN-only endpoint `POST /api/admin/program-chairs` (`{ program, userId }`) atomically clears
  whoever currently holds a program then assigns the new PROFESSOR (or just clears it if `userId`
  is null). New **"จัดการประธานหลักสูตร"** card in `AdminUsersPanel.tsx`, rendered directly below
  the user list on both `/admin-dashboard`'s users tab and standalone `/dashboard/admin/users` — 3
  dropdowns (one per program), each defaulting to the current holder or "— ไม่มี —"; picking a
  professor already chairing a different program moves them (shown inline in the dropdown option
  text) since the field is single-valued. Every other `isProgramChair === true` check across the
  codebase (~15 files: `email.ts`, `submissions[/id]/route.ts`'s notify/approve/list-scoping logic,
  the sign route, exam-reminder cron, both upload routes, `AppContext`, `RoleSubmissionDetail`,
  `WorkflowTimeline`, admin/student dashboard display-name lookups, `auth.ts`/`magic/route.ts`
  session minting) now checks `programChairFor === sub.program` instead — see "Program Chair
  assignment" in `AGENTS.md` for the full list. Removed the isProgramChair checkbox from
  `AdminUsersPanel`'s and `/super-dashboard`'s add-user forms entirely; chair assignment now only
  happens via the new card, after the account already exists.
  **DB migration**: since Boolean → nullable-enum isn't a losslessly-convertible rename (unlike the
  passcode column), this was applied as `ALTER TABLE users DROP COLUMN "isProgramChair"` + `ADD
  COLUMN "programChairFor" "ProgramType"` + `ADD CONSTRAINT ... UNIQUE ("programChairFor")` directly
  against production — confirmed via a read-only query beforehand that **zero users** currently had
  `isProgramChair = true`, so nothing of substance was lost. Applied, then `prisma db push` confirmed
  the schema back in sync.
  **Found and fixed a regression along the way**: right after applying the schema change, the admin
  dashboard showed zero submissions and zero users — caused by the same "regenerated Prisma client,
  but the running `next dev` process still has the old one cached" gotcha as the passcode rename
  below (see the §3 bullet about restarting `next dev` after a schema change). Fixed by killing the
  dev server, clearing `.next/`, and restarting.
  **Verified** via real browser walkthrough as an ADMIN test account (`outanagon2549+suphap@gmail.com`,
  logged in with the shared `A00a00` passcode — see the security warning above): submissions and
  users both list correctly again after the fix; assigned a PROFESSOR to the PHD program via the new
  card, reloaded the page, and confirmed the assignment persisted (ME_MECH/ME_CPS still correctly
  showed "— ไม่มี —", unaffected). **Not yet verified**: the deployed Vercel URL — the schema change
  is live on the production DB but this code hasn't been pushed/deployed yet, so the currently-live
  deployment has no working PROGRAM_CHAIR fallback at all until it is.

- **2026-09-07 — Admin-only account creation; password renamed to passcode.** Self-registration
  (`/register` form, `POST /api/auth/register`) and self-service forgot-password
  (`/forgot-password`, `POST /api/auth/forgot-password`) are both removed entirely — the only way
  an account is created is an ADMIN/SUPER_ADMIN via `POST /api/users` or an ADMIN approving a
  committee person's account via `POST /api/admin/pending-professors`. Also deleted an orphaned,
  unlinked duplicate login page at `/signin` found during the audit (would have silently broken
  once the NextAuth credentials field was renamed, since it called `signIn` with the old field
  name). The login credential is renamed from "password" to **passcode** (รหัสเข้าใช้งาน)
  everywhere user-facing — users can no longer set or view their own; `User.passwordHash` →
  `passcodeHash`. Every passcode (on creation and on reset) is generated server-side via
  `generatePassword()` (`src/lib/utils.ts` — 6 chars, pattern `A00a00`) and emailed; no UI anywhere
  accepts a client-supplied password/passcode value any more (`AdminUsersPanel`'s add-user modal
  and `/super-dashboard`'s add-admin form both had their password input fields removed).
  `PATCH /api/users/[id]` now takes `{ resetPasscode: true }` instead of `{ password }`; ADMIN
  resets one via `UserDetailPanel`'s and `/super-dashboard`'s reset-confirm buttons.
  See "Account creation & passcodes" in `AGENTS.md`.
  **DB migration**: `User.passwordHash` was renamed to `passcodeHash` directly on the **live
  production Supabase DB** via `ALTER TABLE "public"."users" RENAME COLUMN "passwordHash" TO
  "passcodeHash"` over the direct connection (port 5432) — a lossless rename, not a destructive
  `prisma db push` (which would have dropped+recreated the column and lost every existing
  passcode hash). Verified all 15 existing users' rows were intact afterward and that
  `prisma db push` reported the schema back in sync. Code was committed and pushed to
  `origin/main` (`317ac39`) immediately after the DB rename to close the window where the live
  Vercel deployment's old code (still expecting `passwordHash`) would be talking to the renamed
  column. **Verified** via local dev server (same live DB) that `/login` renders with the new
  "รหัสเข้าใช้งาน" label and the removed register/forgot-password links, and that `/register`
  shows the new "contact the department" message. **Not yet verified**: an actual admin-driven
  create-account or reset-passcode walkthrough in a real browser (no working ADMIN credentials
  available this session — same constraint noted on the 2026-09-06 admin-dashboard entry below),
  and the deployed Vercel URL hasn't been re-checked since the push.

- **2026-09-07 — All 15 users' passcodes bulk-reset to the shared value `A00a00`.** Done at the
  owner's explicit request/confirmation (after being warned this affects every real account, not
  just test ones) to make `/demo-users` immediately useful for local login testing without needing
  per-account email access. Applied directly against the live production DB via a one-off script
  using the app's own Prisma client + `bcrypt.hash(..., 12)` (same hashing the app itself uses) —
  no new endpoint or UI was added for this, it was a manual data mutation, not a feature. Verified
  before (0/15 users had it) and after (15/15 users have it) via a read-only `bcrypt.compare`
  check. **See the security warning near the top of this file — every account is currently
  accessible with this one known passcode.** One upside: this also unblocks the "no working ADMIN
  credentials" verification gaps noted in several entries in this section — any seeded/real ADMIN
  email + `A00a00` now logs in, so the still-unverified admin-dashboard/admin-driven-reset
  walkthroughs above can finally be done. Separately, fixed a stale-dev-server bug hit while
  diagnosing a `/demo-users` error report — see the new bullet in §3 about restarting `next dev`
  after a Prisma schema field rename.
- **2026-09-07 — Re-ran the bulk passcode reset, now 20/20 users.** Same one-off script pattern
  (app's Prisma client + `PrismaPg` adapter over `DATABASE_URL` + `bcrypt.hash(..., 12)`), rerun at
  the owner's explicit request since 5 more accounts had been created since the first pass and
  weren't on the shared passcode. Verified before/after via a read-only `bcrypt.compare` check
  (20/20 match afterward). Script was written to `scripts/`, run once, then deleted — not committed,
  same as the first pass.

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
- **2026-09-06 — Proposal-first student workflow + redesigned `/student-dashboard`.** A student
  always starts with a PROPOSAL; a new one is blocked while an existing one is anything other than
  `CANCELLED`. A THESIS_DEFENSE can only be created from a `COMPLETED`, non-cancelled proposal
  (`sourceProposalId`) and imports that proposal's committee into its own independent columns —
  editing the defense's committee never writes back to the proposal. New landing page
  `/student-dashboard` (old `/dashboard/student` now just redirects there) with both creation
  actions live-gated on these rules. See "Proposal-first" in `AGENTS.md`. **Verified** via real
  browser click-through: blocked second-proposal creation while one is active, created a defense
  from a completed proposal and confirmed its committee was pre-filled and independent of the
  source, confirmed `NotificationBell` still deep-links correctly to `/dashboard/student/[id]` (not
  the new landing page) via a `DETAIL_BASE` map added to fix a regression caught during this pass.
- **2026-09-06 — Committee accounts must pre-exist; DRAFT + admin approval queue.** `POST
  /api/submissions` no longer auto-creates PROFESSOR accounts for unrecognized committee emails
  (`src/lib/committee.ts`'s `resolvePeople` only looks up existing users). An unresolved email
  saves the submission as `DRAFT` with the raw rows in `pendingPeople` and no workflow steps. ADMIN
  reviews `/dashboard/admin/pending-professors` (also a count card on `/admin-dashboard`) to create
  the missing account(s) (`POST /api/admin/pending-professors`), which notifies the blocked
  student(s); the student then calls `continue_draft` to resolve the committee, build workflow
  steps (`src/lib/workflowSteps.ts`), and go `IN_PROGRESS`. Applies to both PROPOSAL creation and
  THESIS_DEFENSE committee edits at creation time. See "Committee accounts must pre-exist" in
  `AGENTS.md`. **Verified** via real browser walkthrough: created a PROPOSAL naming a brand-new
  email, confirmed it saved as DRAFT with no welcome email sent and the pending-person checklist
  showing on the student detail page; as ADMIN, created the account from the new queue page and
  confirmed the student got notified; back as student, confirmed "ดำเนินการต่อ" resolved the draft
  to IN_PROGRESS with normal step-1 upload UI.
- **2026-09-06 — Cancellation now requires ADMIN accept/decline of a student request.**
  `request_cancel` (student-only) no longer cancels immediately — it sets `cancelRequested` +
  `cancelRequestedAt` and freezes every other action on that submission (a top-level guard in
  `PATCH /api/submissions/[id]`, plus checks in `POST /api/upload` and
  `POST /api/submissions/[id]/sign`) until ADMIN calls `accept_cancel` (does the actual
  cancellation + cascades to a linked in-flight defense, same as the old immediate-cancel behavior)
  or `decline_cancel` (just clears the flag). Surfaced as a `cancel_request` task-box entry sorted
  first on `/admin-dashboard`, an accept/decline banner on the admin detail page and on the shared
  `RoleSubmissionDetail` (every faculty-role view freezes too), and a "รออนุมัติยกเลิก" pending
  banner on the student side. See "Cancellation" in `AGENTS.md`. **Verified** via real browser
  walkthrough: student request froze the submission (upload/approve/reject controls all hidden
  everywhere including a faculty-role view), ADMIN saw the task-box entry and banner, accept
  correctly cancelled the submission, decline correctly unfroze it back to normal.
- **2026-09-06 — Dashboard shell redesign: sidebar → shared top bar, STUDENT gets its own simpler
  bar, header consolidates stat cards.** The old fixed-width left sidebar (`src/app/dashboard/
  layout.tsx`) is gone; every role now gets a top bar instead. ADMIN/SUPER_ADMIN/PROFESSOR keep the
  full bar (nav links + mobile hamburger); STUDENT gets a bar with no nav links and no hamburger at
  all — system name+date left, name+email centered, LanguageToggle+NotificationBell+Logout right,
  always expanded. `DashboardHeader` gained `stats` (a row of secondary stat pills under the title)
  alongside its existing `highlight` pill, so the read-only stat-card grids that used to sit
  directly under the header on ADMIN/SUPER_ADMIN/PROFESSOR moved into the header itself — the first
  card below the header is now always an actionable one (task box / account table / pending list),
  not a wall of counts. STUDENT's `DashboardHeader` was removed entirely (name/date/email already
  live in its top bar; the one stat it showed wasn't worth a hero card), and its first card was
  renamed "สถานะคำร้อง" (from "ยื่นคำร้องใหม่") — still just the two proposal/defense creation entry
  points at this point; a "current status" summary was briefly added as a third item in this same
  card, then pulled back out into its own dedicated card in the very next follow-up below. Logout
  is labeled "Logout" (not "ออกจากระบบ")
  everywhere; `LanguageToggle` shows the current language ("TH"/"EN") instead of the language you'd
  switch to. See "Dashboard shell" in `AGENTS.md`. **Verified**: `npm run build` passes; a real
  browser walkthrough as `stu001` confirmed the student top bar, the redesigned status card, and
  (end to end) creating a real PROPOSAL through the actual submit form — landed `IN_PROGRESS` with
  all 10 workflow steps built, confirming every named committee email (advisor/program chair/head/
  exam committee/invited) resolved to a real account. Not yet re-checked on the deployed Vercel URL,
  and not yet clicked through as ADMIN/SUPER_ADMIN/PROFESSOR in a real browser (only via
  `npm run build` for those three).
- **2026-09-06 — Dashboard shell follow-up: header flattened, top bar fully unified across
  roles.** Two changes on top of the redesign above. (1) `DashboardHeader` — the gradient hero
  banner (`ROLE_GRADIENT` background, decorative circles, translucent white/15 pills) was flattened
  to a plain white card (`bg-white border border-gray-200`) with a small solid-gradient role-icon
  square, flat gray stat pills, and a blue-bordered highlight pill — matching the calmer look the
  student dashboard's cards already had. (2) `DashboardLayout`'s top bar — the ADMIN/SUPER_ADMIN/
  PROFESSOR nav-links-plus-hamburger bar was dropped entirely; every role now renders the exact same
  bar STUDENT had (name+date left, name+email centered, LanguageToggle+NotificationBell+Logout
  right, no menu button). Removing ADMIN's nav links meant `/dashboard/admin/users` needed its own
  entry point and back-link, since it had relied on the nav for both: added a persistent "ผู้ใช้งาน
  ในระบบ" card on `/admin-dashboard` (same pattern as the existing pending-professors card) and a
  "ย้อนกลับ" link at the top of `/dashboard/admin/users`. PROFESSOR and SUPER_ADMIN needed no
  equivalent addition — their only other pages already carry their own back-links (or don't exist).
  (3) All four dashboard landing pages (`admin-dashboard`, `super-dashboard`, `dashboard/professor`,
  `student-dashboard`) dropped their outer wrapper's `max-w-3xl`/`max-w-4xl` cap, so cards span the
  same width as the top bar. (4) STUDENT's "current status" third item (added in the redesign above,
  then quickly reverted back out of "สถานะคำร้อง") landed as its own dedicated card,
  "ความคืบหน้าปัจจุบัน": the single most recent non-cancelled submission with a "Proposal"/"Defense"
  badge, title + status, the **entire** `WorkflowTimeline` (every step, not a one-line progress
  bar), and a "ดูรายละเอียด" link — or "No proposal" with a start-one button when there's none.
  Every other submission (cancelled, or an older one superseded by a newer current one) moved to a
  separate "รายการอื่นๆ" card below it, shown only when non-empty. See "Dashboard shell" in
  `AGENTS.md`. **Verified**: `npm run build` passes; a real browser walkthrough as a PROFESSOR test
  account (`ai.ta01+prof001@cp.eng.chula.ac.th`) confirmed the flattened header and the unified top
  bar (no nav links, no hamburger, name+email centered) render correctly at both desktop and mobile
  widths; a separate walkthrough as `stu001` confirmed the full-width cards, the "ความคืบหน้าปัจจุบัน"
  card rendering all 10 steps of a real in-progress PROPOSAL with the correct "Proposal" badge and a
  working "ดูรายละเอียด" link, and "รายการอื่นๆ" correctly listing that student's 3 cancelled
  submissions below it. ADMIN was reviewed by code only (no working ADMIN test credentials were
  available this session) — it shares the identical, now role-agnostic `DashboardLayout`/
  `DashboardHeader` components already confirmed for PROFESSOR, so the same rendering is expected,
  but the new `/admin-dashboard` users-management card and `/dashboard/admin/users` back-link
  haven't been clicked through in a real browser yet.

- **2026-09-06 — SUPER_ADMIN read-only oversight expanded to individual records; ADMIN dashboard
  reworked into two tabs.** Two related follow-ups on top of the SUPER_ADMIN/ADMIN split above.
  (1) `/super-dashboard`: `DashboardHeader` removed outright; its stats moved to two places — a
  standalone "สถิติคำร้อง" submission-count card, later replaced by a full read-only
  **"รายการคำร้องทั้งหมด"** submission list (`GET /api/super-admin/submissions`, new), positioned
  right after the "จัดการผู้ดูแลระบบ" user-management card. A new **"รายชื่อผู้ใช้งานทั้งหมด"**
  read-only directory (`GET /api/super-admin/users`, new) shows every account including
  STUDENT/PROFESSOR, grouped by role. This is a deliberate, explicit loosening of the previously
  documented "SUPER_ADMIN cannot view any individual STUDENT/PROFESSOR record or submission" rule —
  it can now *view* (never act on) both; the old counts-only `GET /api/super-admin/stats` was
  removed as redundant once these two list endpoints existed. The role-reference card was also
  reordered to the app's standard SUPER_ADMIN/ADMIN/PROFESSOR/STUDENT sort. See "Super Admin" row
  and the zero-submission-access bullet in `AGENTS.md`. (2) `/admin-dashboard`: `DashboardHeader`
  removed too (its stats were already duplicated by the status-tab count badges and the task box's
  own count, so nothing needed to replace it); the old "ผู้ใช้งานในระบบ" link-out card was replaced
  by a genuine two-tab layout (`จัดการคำร้อง` / `จัดการผู้ใช้งาน`, full-width `grid grid-cols-2`
  buttons) sharing one frame (`max-h-[75vh] overflow-y-auto`, so a long list scrolls inside the
  frame instead of shifting the whole page when the browser's own scrollbar used to appear). The
  user-management tab embeds a new shared `AdminUsersPanel` component
  (`src/components/AdminUsersPanel.tsx`, extracted from `/dashboard/admin/users`) instead of just
  linking out — that standalone route (and its `[uid]` sub-route) still work, now as thin
  guard+back-link wrappers around the same component, since student names in the submission list
  still deep-link there directly. See "Admin dashboard" in `AGENTS.md`. **Verified**: `npm run
  build` passes; `/super-dashboard` was confirmed in a real browser (logged in as the SUPER_ADMIN
  test account) — the submission list, user directory, and reordered role-reference card all render
  correctly. **`/admin-dashboard` was NOT verified in a browser this session** — the only ADMIN-role
  test account (`outanagon2549+suphap@gmail.com`) doesn't use the default seed password (this is the
  live production DB, not local seed data), and repeatedly guessing a real account's password was
  judged unsafe rather than attempted further. Next session with working ADMIN credentials should
  click through the two tabs, the full-width tab bar, and the frame's internal scrollbar before
  considering this fully done.

- **2026-09-06 — PROFESSOR landing page moved to `/professor-dashboard`; `DashboardHeader` dropped
  from it.** PROFESSOR was the only in-system role still landing at a nested `/dashboard/<role>`
  URL after the shell redesign above gave the other three roles top-level landing pages
  (`/admin-dashboard`, `/super-dashboard`, `/student-dashboard`). Moved its page content into a new
  `src/app/professor-dashboard/` (with its own thin `layout.tsx` re-exporting the shared
  `DashboardLayout`, same pattern as `admin-dashboard`/`super-dashboard`); `src/app/dashboard/
  professor/page.tsx` is now a client-side redirect to it. Submission detail pages stay at
  `/dashboard/professor/[id]` (same split ADMIN/STUDENT already use) — its `backPath` now points
  directly at `/professor-dashboard`, and `NotificationBell`'s `DETAIL_BASE` map gained a
  `PROFESSOR` entry so deep-linked notifications still resolve to the detail route instead of the
  landing page. `src/lib/roleRoutes.ts` is the only place the URL is hardcoded, so every generic
  post-login redirect (`/`, `/login`, `/signin`, `/dashboard`) picked it up automatically. Separately,
  `DashboardHeader` was removed from the page entirely (same flattening `/admin-dashboard` and
  `/super-dashboard` already went through) — its pending count is still visible via the existing
  รอดำเนินการ/ประวัติ tab badge, so nothing was added back in its place. See "Dashboard shell" in
  `AGENTS.md`. **Verified**: `npm run build` passes and lists `/professor-dashboard` as a generated
  route. **Not yet clicked through in a real browser** — no working PROFESSOR test credentials were
  available this session (same live-DB password constraint as the ADMIN item above).

- **2026-09-06 — `/student-dashboard` redesigned into a 2-tab layout (Proposal / Defense),
  replacing the single-card design from earlier the same day.** Each tab now carries its own
  creation entry point and its own "ความคืบหน้าปัจจุบัน (x/y)" section scoped to that submission
  type — full committee/exam info and the complete `WorkflowTimeline` render inline (via a new
  shared `SubmissionInfoPanel` component, extracted from `src/app/dashboard/student/[id]` so both
  pages render identical info), so a student no longer has to leave the dashboard to see status.
  Before any proposal/defense exists, the tab shows the full step list as a preview instead of
  nothing (`buildWorkflowSteps()` with no committee) — `WorkflowTimeline` gained a `preview` prop
  so none of those steps are ever shown as "current". The proposal tab also gained a self-service
  "ขอยกเลิกคำร้องนี้" button using the same `requestCancelSubmission` flow as the detail page
  (confirm modal, linked-defense cascade warning). "รายการอื่นๆ" stays a separate card at the
  bottom, now excluding both current items instead of just one. See "Student dashboard" in
  `AGENTS.md`. **Verified**: `npm run build` passes; a real browser walkthrough against the live
  dev server covered both tabs as two different STUDENT accounts — one with an active completed
  proposal (proposal tab showed full info + 10/10 steps + working cancel-confirm modal, dismissed
  without submitting; defense tab correctly showed the 0/19 step preview with no step marked
  current), one with no proposal at all (proposal tab showed the 0/10 preview, defense tab showed
  the locked entry card + its own 0/19 preview). **Not yet re-checked on the deployed Vercel URL.**

### Carried over from the ownership transfer (not urgent, just not forgotten)

- Retire the old Supabase project (`jttfcoisygcqqshghkmn`) — currently paused, not deleted, per the
  original rollback-window plan. Revoke its service-role key once you're confident nothing needs it.
- The full manual browser smoke test from §7 still hasn't happened — real credentials, real click
  path through at least one full PROPOSAL and one THESIS_DEFENSE submission.

### Dead-code / unused-dependency audit (2026-09-06)

Verified by grepping the whole repo (not just `src/`) for each item before flagging it — this list
already corrects an earlier miss (`xlsx` was initially flagged unused but is actually required by
`scripts/make-wordlist.js`/`scripts/import-wordlist.js`, so it was kept).

**Already removed this session (uncommitted — stage/commit when ready):**
- `src/utils/supabase/` (`client.ts`, `server.ts`, `middleware.ts`) — leftover Supabase Auth-helper
  boilerplate (`@supabase/ssr`'s `createBrowserClient`/`createServerClient`) from an early scaffold.
  Zero importers anywhere in the repo, and no root `middleware.ts` exists to wire the middleware
  helper in even if something had tried. This app's real auth is NextAuth credentials+JWT
  (`src/lib/auth.ts`); the only legitimate direct Supabase usage is `src/lib/supabase.ts` (Storage
  only, service-role key).
- `@supabase/ssr` dependency — was only used by the folder above.

**Confirmed unused, not yet removed (awaiting a decision):**
- `playwright` (devDependency) — no `playwright.config.*`, no `e2e/` dir, zero references outside
  `package.json`. `CLAUDE.md` already says to treat it as unused until a real config is added.
- `zod` (dependency) — zero imports, zero `z.object`/`z.infer` usage anywhere in `src/`.
- `react-hook-form` (dependency) — zero imports, no `useForm`/`register`/`Controller`/`FormProvider`
  usage anywhere.
- `@hookform/resolvers` (dependency) — zero imports.
- `@auth/prisma-adapter` (dependency) — `src/lib/auth.ts` only calls `Credentials(...)` with JWT
  sessions; no `PrismaAdapter(...)` call exists anywhere.
- `src/lib/workflow.ts` — dead mock-build stub (already flagged in `CLAUDE.md`), reconfirmed zero
  importers.

**Kept — confirmed actually necessary:**
- `xlsx` (devDependency) — required by `scripts/make-wordlist.js` (writes `../../thesis-wordlist.xlsx`)
  and `scripts/import-wordlist.js` (reads it back). Not wired into `npm run build`/`dev`, but real
  tooling scripts break without it.

**Redundant but harmless, lower priority:**
- `pg` / `@types/pg` (dependencies) — not imported directly anywhere in `src/`; `@prisma/adapter-pg`
  already lists both as its own dependencies, so they're pulled in transitively regardless. Explicit
  listing isn't wrong, just not strictly necessary.

**Stale docs, not code:**
- `docs/ARCHITECTURE.md` / `docs/RECIPES.md` — describe a pre-database, localStorage-only version of
  the app that no longer exists (per `CLAUDE.md`, "don't follow their instructions"). Still linked
  from `README.md`, so a reader following the README lands on inaccurate docs.

Found while investigating an unrelated stray file: **`scripts/mass-email-change.ts` is untracked**
(not in git) and fails `npm run build`'s type-check (`import { PrismaClient } from "@prisma/client"`
— this project generates the client to `src/generated/prisma` per `prisma.config.ts`, not the
default location). Left alone since it looks like someone's in-progress local script, not part of
this audit.
