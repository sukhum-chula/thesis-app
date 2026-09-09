# Changelog

Dated, human-readable record of notable changes to the Thesis Management System. Newest first.
This starts from 2026-09-06 — for anything earlier, see `git log` and `SESSION-REPORT-2026-09-04.md`
(the ownership-transfer session). Not every commit needs an entry here — skip pure typo/formatting
fixes; do write one for anything that changes behavior, permissions, routes, or schema.

## 2026-09-09

- **Removed magic-link auto-login entirely**, at the project owner's request, after flagging that
  the token was never single-use and never expired quickly (48h, deliberately not consumed on
  click for Office365 SafeLinks prefetch safety) — a forwarded or leaked notification email let
  anyone log in as that user for up to 48h with no passcode needed. Deleted `GET /api/auth/magic`
  (`src/app/api/auth/magic/route.ts`) and the `MagicToken` Prisma model (`magic_tokens` table now
  orphaned in the live DB, not yet dropped — see below). `sendStepEmail()`'s per-recipient link
  (`src/lib/email.ts`) no longer creates a token; every step-notification and rejection email now
  links to a plain `/login` instead of an auto-login URL, with the existing "log in with your email
  and passcode" caption unchanged. The exam-reminder email's link was never actually a magic link
  (no token, always required manual login) — only renamed its `magicLink` variable to
  `reminderLink` for clarity, no behavior change. Login by email + passcode is unaffected; this only
  removes the one-click email shortcut. **Follow-up the same day**: dropped the now-orphaned
  `magic_tokens` table itself from the live production DB (93 stale rows), via the usual one-off
  `scripts/`-then-delete pooler-script convention, with the project owner's explicit go-ahead —
  existence confirmed before (true) and after (false). Verified: `npx tsc --noEmit`
  clean except one stale `.next/types/validator.ts` entry referencing the deleted route (a dev-server
  cache artifact from the live dev server that was running at the time — not a real error, clears on
  the server's next full recompile/restart); `npx eslint` on `src/lib/email.ts` shows only the two
  pre-existing `any` errors this change didn't touch. `AGENTS.md` updated (Stack & deployment, Auth,
  the name-title JWT-minting note, and the `attachSystemSettings` comment) to drop magic-link
  mentions.
- **Admin-only user rank codes (A001/B002/C003/D004), drag-to-reorder.** New `User.rankOrder Int?`
  plus `computeRankCodes()`/`rankCodeNumber()` (`src/lib/utils.ts`) compute a dense per-role display
  code — `A`=ADMIN, `B`=PROFESSOR, `C`=EXTERNAL, `D`=STUDENT — visible only to ADMIN (never
  SUPER_ADMIN), never directly editable. New ADMIN-only `POST /api/admin/users/reorder`
  (`{ role, orderedIds }`) rejects a stale/partial membership list (409) and sets every member's
  `rankOrder` in one transaction. `AdminUsersPanel` gained drag-and-drop reordering, enabled only
  when a single role filter is active with search/checkbox cleared. See "Admin-only user rank codes"
  in `AGENTS.md`. Verified live in the browser: correct dense codes across all 4 role groups, a real
  drag-drop swap persisted through a page reload.
- **`INVITED_EXAM_COMMITTEE` (กรรมการภายนอก) now supports multiple members**, not just exactly 1 —
  brought in line with `CO_ADVISOR`/`EXAM_COMMITTEE`. Schema: the `invitedCommitteeId` scalar + 4
  free-text snapshot columns were replaced with `invitedCommitteeIds String[]` (migrated, 6/6
  existing rows backfilled and verified, old columns dropped). `validatePeople`/`resolvePeople`,
  `buildWorkflowSteps()`, the sequential-signing `POST /api/submissions/[id]/sign` transaction, and
  email recipient resolution (`sendStepEmail`'s new `allMembers` broadcast, `sendFinanceEmail`'s
  `invitedProfs` array) all treat it identically to the other multi-member roles now. UI:
  `CommitteePeopleEditor` dropped its `max: 1` cap; `AdminSubmissionPanel` gained 3 กรรมการภายนอก
  dropdown slots. See "Multiple external committee members" in `AGENTS.md`. **Not yet exercised in
  a real browser** with 2+ invited members signing in sequence.
- **Fixed silent-failure email reporting in three more admin flows** (passcode reset, login-email
  change, add-user), same root cause each time: the API always applied the account change before
  sending a notification email, but the UI never surfaced whether the email actually sent, so an
  admin saw "success" even when a message silently failed (e.g. hitting the Gmail daily quota).
  `sendPasscodeResetEmail`/`sendEmailChangedNotice` now return real send results; `PATCH
  /api/users/[id]` responses include `passcodeEmailSent`/`emailChangeNoticesSent`; `AppContext`'s
  `superAdminAddUser`/`superAdminResetPasscode`/`adminUpdateUserInfo` surface them; toast call sites
  in `UserProfileHeader.tsx`, `AdminUsersPanel.tsx`, `/dashboard/admin/pending-professors`, and
  `/super-dashboard` (whose add-admin handler previously wasn't even `await`ed) now branch on the
  real result. Verified live against both a real Gmail-quota failure and a real successful send.
- **Fixed admin approve/reject/return-to-prev buttons giving no feedback while a request was in
  flight**, letting a double-click fire a duplicate PATCH that failed. `AdminSubmissionPanel.tsx`'s
  main action panel now shares one `actionBusy` state across all three actions — buttons disable
  immediately, the approve button shows a spinner + "กำลังดำเนินการ...", and a failure now shows a
  toast instead of failing silently. Not yet re-confirmed with a live double-click repro.
- **Fixed the admin user-list header not adapting below the `xl` breakpoint** — the submission-status
  box and the 3 edit/reset/delete buttons stayed full-size at any width from ~768px up, forcing the
  name/email column to wrap character-by-character. `UserProfileHeader.tsx` now stacks vertically
  (identity, then status box + buttons in a wrapping row) below `xl` (1280px), only docking
  side-by-side once there's room. Confirmed live at ~871px; the `xl:`+ layout and true mobile widths
  weren't visually confirmed (viewport-resize tooling limitation this session).
- **Reworded and de-duplicated the "external examiner not found" hint** on the student proposal
  committee editor — was repeating once per eligible row (3-4+ times on one page); now appears once,
  in both `ProposalForm`'s and `ProposalDraftReview`'s intro text.

## 2026-09-08

- **`User.name` split into a separate `title` field** for the Thai honorific/academic prefix
  (ศ.ดร./รศ.ดร./ผศ.ดร./ผศ./อ.ดร./ดร./นาย/นางสาว/นาง) — new `NameTitle` enum, nullable `User.title`.
  `formatUserName({title, name})` (`src/lib/utils.ts`) is now used everywhere a live user's name is
  displayed (dashboards, emails, workflow-step snapshots, committee pickers); a one-off backfill
  split all 10 then-existing accounts (7 matched a prefix, 3 legitimately had none). Deliberately
  not touched: historical denormalized name snapshots with no parallel title column
  (`Submission.studentFullName`, `pendingPeople[].name`). See "Name title" in `AGENTS.md`.
- **ADMIN/SUPER_ADMIN can now edit a user's login email** (previously only fixable via a direct DB
  edit). `PATCH /api/users/[id]` accepts an optional `email` (normalized, validated,
  uniqueness-checked); since email doubles as the login identifier, both the old and new address get
  an automatic notice (`sendEmailChangedNotice`). `UserProfileHeader.tsx`'s edit modal gained the
  input with an amber warning when changed.
- **Fixed `EXTERNAL` (กรรมการภายนอก) accounts being invisible in two places.** `GET /api/users`'s
  ADMIN-caller branch was missing `"EXTERNAL"` from its role filter, so an approved external
  examiner would briefly appear (client-side optimistic update) then vanish on the next poll.
  Separately, `AdminSubmissionPanel`'s own (older, non-shared) committee editor built its "กรรมการ
  ภายนอก ในระบบ" dropdown from a PROFESSOR-only list, so an admin could never actually pick an
  external examiner there either. Both fixed; confirmed via a direct DB read that 3 real EXTERNAL
  accounts existed the whole time.
- **Draft save no longer requires complete information; CO_ADVISOR/EXAM_COMMITTEE can now be
  external examiners too.** "บันทึกฉบับร่าง" on `ProposalDraftReview`/`DefenseDraftReview` used to
  run the exact same strict validation as "ยืนยัน" — a student couldn't save an empty draft at all.
  New lenient `validatePeopleLenient`/`resolvePeoplePartial` (`src/lib/committee.ts`) skip unfilled
  rows and never fail on an unresolvable email; `PATCH .../[id]` actions `save_proposal_draft`/
  `save_defense_draft` branch strict-vs-lenient on a `confirm` flag. Separately,
  `CommitteePeopleEditor`'s `MIXED_ROLES` (CO_ADVISOR, EXAM_COMMITTEE) now offer both PROFESSOR and
  EXTERNAL accounts, not PROFESSOR-only. See "Draft save vs. confirm validation" and "Committee
  people" in `AGENTS.md`.
- **Proposal tab reworked into a blank-draft-first flow.** Before any proposal exists,
  `/student-dashboard`'s proposal tab shows the blank `ProposalForm` template (`readOnlyPreview`,
  disabled via `<fieldset>`) with a "+ สร้างร่างคำร้อง" button (`POST
  /api/submissions/auto-draft-proposal`, STUDENT-only, get-or-create) that creates a blank DRAFT row;
  new `ProposalDraftReview.tsx` (mirrors `DefenseDraftReview.tsx`) then becomes the editable form.
  `CommitteePeopleEditor` redesigned alongside this: no longer shows a selected member's
  email/phone, gained a drag handle for reordering (the real sign order), and `initialPeople()` now
  seeds 4 default rows. `ExamLogisticsSection`'s time field switched from a native
  `<input type="time">` to a locale-independent two-`<select>` `TimeSelect`. Same-day follow-up:
  fixed the progress-preview/timeline disappearing between the blank-template state and the
  draft-being-edited state.
- **`ExternalCommitteeRequest` gained its own `title` column**, matching every other account form's
  "คำนำหน้าชื่อ" dropdown instead of requiring the student to type a Thai honorific into the name
  field by hand. ADMIN's approval flow prefills the add-user modal's title directly from it.
- **`/professor-dashboard` reworked to show every submission the professor is a committee member
  on**, not just ones with a professor-role step currently pending or already acted on. Replaced the
  old รอดำเนินการ/ประวัติ tab split with the same status-filter tab bar `/admin-dashboard` uses. See
  "Professor dashboard" in `AGENTS.md`.
- **Fixed a stale-session "Forbidden" error on approving a step.** `PATCH /api/submissions/[id]`'s
  actions silently fell back to the JWT session's (possibly stale) roles when the fresh DB lookup
  (`dbUser`) came back `null` — now returns a clear 401 ("เซสชันหมดอายุ กรุณาเข้าสู่ระบบใหม่") instead,
  confirmed by the reporting admin that re-login fixed it.
- **`AdminUsersPanel`'s user list gained a role filter + search bar, and an "มีคำร้องที่ยังไม่ถูก
  ยกเลิก" (active-submission-only) checkbox filter** (same "any non-CANCELLED submission counts as
  active" rule as the proposal-first gate). Every user-facing "นักศึกษา" was also renamed to "นิสิต"
  (Chulalongkorn's own term) across the app, including the Thai↔English translation dictionary's
  keys.
- **Fixed admin popups (add/edit-user, reset-passcode, `NotificationBell`) closing on a
  click-and-drag out of the panel.** A browser `click` fires wherever the mouse is released, not
  where it was pressed — backdrop close-handlers now track whether the *press* also started on the
  backdrop before treating a release there as a real outside click.

## 2026-09-07

- **Program chair & finance contact moved from `User` columns into a new `SystemSetting`
  key/value table; finance contact is now an admin-designated ADMIN account; a professor may
  now chair more than one program.** New `src/lib/systemSettings.ts` centralizes all reads/writes
  (`getProgramChairUserId`/`getProgramChairsOfUser`/`setProgramChair`,
  `getFinanceContactUser`/`setFinanceContact`, `clearUserFromSystemSettings`,
  `attachSystemSettings`). Rows are never deleted — clearing an assignment, or deleting the
  account that held it, sets `userId: null` instead so the key stays present. The old "one
  PROFESSOR, one program" rule was removed, so `programChairFor` is now `ProgramType[]`
  everywhere it appears (session/JWT, `MockUser`, ~a dozen consumer files) instead of a single
  value. The old "จัดการประธานหลักสูตร" card was extracted from `AdminUsersPanel` into a new
  `AdminSettingsPanel` component (`src/components/AdminSettingsPanel.tsx`), now its own
  "ตั้งค่าระบบ" tab on `/admin-dashboard` (3 tabs total) and standalone at `/dashboard/admin/users`.
  `sendFinanceEmail()` now prefers the designated contact's email over the `FINANCE_EMAIL` env
  var, which is now only a fallback. See "Program Chair & finance-contact assignment" in
  `AGENTS.md`.
- **Admin submissions tab: rows expand in place instead of linking to a detail page.**
  `/admin-dashboard`'s จัดการคำร้อง list no longer has a "จัดการ"/"ดำเนินการ" link or a per-row
  delete button — the whole card is clickable (toggling a chevron), and clicking one renders the
  full admin action surface directly under that row, one open at a time. That surface — header,
  edit form, cancellation accept/decline, step-by-step controls, timeline, upload panels, file
  list, and the typed-"ลบ" delete confirm — was extracted from what used to be all of
  `/dashboard/admin/[id]/page.tsx` into new `src/components/AdminSubmissionPanel.tsx`
  (`{ submissionId, onDeleted? }`), the same "extract the page body into a component" pattern
  already used for `StudentSubmissionActions`. `/dashboard/admin/[id]` is now a thin
  guard+back-link wrapper around it, kept because emails, the task box, and student-profile pages
  still deep-link there directly. Expanding a card — including switching straight from one open
  card to another — smoothly scrolls it to the top of the list's scrolling frame. Also fixed that
  page's delete handler, which previously had no error handling at all (a failed delete just
  silently did nothing); it now shows a success/error toast like the rest of the app.
- **Fixed `DELETE /api/users/[id]` crashing with a bare 500 instead of a real error.** Deleting a
  STUDENT/PROFESSOR who has ever submitted, uploaded a file, signed something, or acted on a
  workflow step threw an unhandled Prisma foreign-key error (`P2003`) — none of those relations
  cascade-delete, by design, since deleting an account must never silently destroy thesis records.
  The route now catches that and returns a `409` with a clear Thai message instead. No schema or
  behavior change, just surfacing the existing constraint as a real error.
- **Removed `EMAIL_OVERRIDE_TO` entirely.** This env var used to redirect every outgoing email to
  one testing address so Preview/Development deployments and local dev could never accidentally
  email real students/faculty. Removed the override branch from `sendMail()`
  (`src/lib/email.ts`), deleted the var from `.env.local` and from Vercel's Preview/Development
  environments, and updated `AGENTS.md`/`HANDOFF.md`/`docs/SUPABASE-MIGRATION.md`. No environment
  has a safety net anymore — see the warning near the top of `HANDOFF.md`.
- **Admin-only account creation; password renamed to passcode.** Self-registration
  (`/register`, `POST /api/auth/register`) and self-service forgot-password are both removed
  entirely — every account is now created by an ADMIN/SUPER_ADMIN via `POST /api/users`, including
  the account for a DRAFT submission's missing committee person. `User.passwordHash` was renamed
  to `passcodeHash` directly on the live DB (a lossless column rename, not a `prisma db push`,
  which would have dropped every existing hash). See "Account creation & passcodes" in `AGENTS.md`.
- **Admin can now type a passcode by hand instead of only accepting a generated one**, on both
  account creation and reset — new shared `PasscodeField` component, server-side
  `isValidPasscode()` (6-72 chars, no whitespace).
- **Committee-account creation unified onto `POST /api/users`.** The dedicated `POST
  /api/admin/pending-professors` endpoint was deleted; an unresolved committee email now surfaces
  as an amber card at the top of `AdminUsersPanel`'s user list (in addition to the standalone
  `/dashboard/admin/pending-professors` queue page, which still works as an alternate entry
  point), and clicking it opens the same "เพิ่มผู้ใช้งาน" modal used for any account.
- **THESIS_DEFENSE and PROPOSAL creation moved inline into `/student-dashboard`'s tabs** — a
  defense is auto-drafted the moment its tab opens (`POST /api/submissions/auto-draft-defense`),
  reviewed/edited via `DefenseDraftReview`, and confirmed without ever navigating to a separate
  page; the full submission action surface (`StudentSubmissionActions.tsx`, extracted from the old
  `/dashboard/student/[id]` page body) renders directly in the dashboard tabs too.
- **Fixed `continue_draft` silently overwriting committee fields an ADMIN had already edited** on
  a still-DRAFT submission — it now merges (fills only still-unset fields) instead of always
  rebuilding every field from `pendingPeople`.
- **All 20 live accounts' passcodes bulk-reset to a single shared value** (`A00a00`) for local
  testing convenience, at the project owner's explicit request. **This is a known,
  currently-unresolved security issue** — see the warning at the top of `HANDOFF.md`.

## 2026-09-06

- **Split SUPER_ADMIN and ADMIN responsibilities into dedicated dashboards.**
  SUPER_ADMIN is now account/user management only — manages SUPER_ADMIN + ADMIN accounts, has
  **zero submission-workflow access** (cannot view, approve, reject, or override any submission).
  ADMIN owns the entire submission workflow exclusively, plus account management for
  ADMIN/PROFESSOR/STUDENT accounts. Tiered rules live in `src/lib/accountScope.ts`.
  New landing pages: `/super-dashboard` (SUPER_ADMIN — read-only system-wide oversight numbers via
  `GET /api/super-admin/stats`, plus SUPER_ADMIN/ADMIN account management) and `/admin-dashboard`
  (ADMIN — the submissions overview, moved from `/dashboard/admin`). Old
  `/dashboard/super-admin` and `/dashboard/admin` now redirect to the new routes.
  Click-tested end-to-end with real SUPER_ADMIN and ADMIN accounts: navigation guards, account-tier
  scoping, and full create/update/delete on every account type. Found and fixed one real bug along
  the way — a `router.replace()`-during-render React error on the ADMIN submission-detail guards.
- Users list (`/dashboard/admin/users`) now sorts SUPER_ADMIN → ADMIN → PROFESSOR → STUDENT, with
  professors ordered by academic rank (parsed from the ศ./รศ./ผศ./อ. title prefix on `name`) then
  name, and students by `studentId` ascending. Clicking a row expands it in place
  (`UserDetailPanel`, shared with the `/dashboard/admin/users/[uid]` page) instead of navigating to
  a separate page.
- ADMIN can now manage STUDENT/PROFESSOR accounts directly (edit info, reset password, delete) —
  previously SUPER_ADMIN-only. Added a password-reset modal and delete-confirm flow to the user
  detail view.
- Added `/demo-users` — a local-only (gated on `NODE_ENV !== "production"`) read-only page listing
  all users' name/email/roles/studentId, sorted SUPER_ADMIN → ADMIN → PROFESSOR → STUDENT (same
  `sortUsersByRole()` helper as `/dashboard/admin/users`), for picking which account to log in as
  while testing. Does not touch the login/auth system.
- Added `CHANGELOG.md` (this file) and expanded `HANDOFF.md` with an ongoing "active development"
  section, since there was previously no running record of day-to-day changes.
- Added `WORKFLOW.md` — the PROPOSAL/THESIS_DEFENSE step tables and workflow behavior rules,
  extracted from `AGENTS.md` into a standalone human-readable reference (`AGENTS.md` stays the
  authoritative source; keep this in sync with it, not the other way around).
- **Proposal-first student workflow, redesigned `/student-dashboard`.** A student always starts
  with a PROPOSAL; creating a new one is blocked while an existing one is anything other than
  `CANCELLED`. A THESIS_DEFENSE can only be created from a `COMPLETED`, non-cancelled proposal
  (new `sourceProposalId` self-relation) and imports that proposal's committee into its own
  independent columns — editing the defense's committee never writes back to the proposal. New
  landing page `/student-dashboard` (old `/dashboard/student` redirects there) with both creation
  actions gated live on these rules.
- **Committee people must already have an account — no more silent auto-create.** `POST
  /api/submissions` used to find-or-create a PROFESSOR account for any unrecognized committee
  email; it no longer does (`src/lib/committee.ts`). An unresolved email now saves the submission
  as `DRAFT` (new `pendingPeople` JSON column, no workflow steps yet) instead. ADMIN reviews unmet
  requests on a new `/dashboard/admin/pending-professors` queue (also a count card on
  `/admin-dashboard`) and creates the missing account(s) there (`POST
  /api/admin/pending-professors`), which notifies the blocked student; the student then calls the
  new `continue_draft` action to resolve the committee, build workflow steps
  (`src/lib/workflowSteps.ts`), and move to `IN_PROGRESS`. Applies both to PROPOSAL creation and to
  editing a THESIS_DEFENSE's imported committee at creation time.
- **Cancellation now requires ADMIN accept/decline of a student request**, replacing the old
  immediate self-service cancel. `request_cancel` (student-only) sets new `cancelRequested` /
  `cancelRequestedAt` fields and freezes every other action on that submission (a top-level guard
  in `PATCH /api/submissions/[id]`, plus checks added to `POST /api/upload` and `POST
  /api/submissions/[id]/sign`) until ADMIN calls `accept_cancel` (does the actual cancellation,
  cascading to a linked in-flight defense same as before) or `decline_cancel` (clears the flag,
  submission continues normally). Surfaced as a `cancel_request` task-box entry sorted first on
  `/admin-dashboard`, an accept/decline banner on the admin detail page and on the shared
  `RoleSubmissionDetail` (every faculty-role view freezes too), and a "รออนุมัติยกเลิก" pending
  banner on the student side.
- **`/student-dashboard` redesigned into a 2-tab layout** (Proposal / Defense), replacing the old
  single-card design. Each tab gets its own creation entry point and its own
  "ความคืบหน้าปัจจุบัน (x/y)" section for that submission type only — full committee/exam info
  (`SubmissionInfoPanel`, new shared component extracted from `src/app/dashboard/student/[id]`) and
  the full `WorkflowTimeline` render inline, so viewing status no longer requires navigating to the
  detail page. Before any proposal/defense exists, the tab instead shows the full step list as a
  preview (built from `buildWorkflowSteps()` with no committee) — `WorkflowTimeline` gained a
  `preview` prop so none of those steps are ever shown as "current"/in-progress. The proposal tab
  also gained a self-service "ขอยกเลิกคำร้องนี้" button (same `requestCancelSubmission` flow as the
  detail page). "รายการอื่นๆ" stays a separate card, now excluding both current items instead of
  just one. See "Student dashboard" in `AGENTS.md`. Verified via `npm run build` and a real browser
  walkthrough (dev server, live DB) as two different STUDENT accounts — one with an active
  completed proposal, one with none — covering both tabs, the preview state, and the cancel-request
  modal (dismissed without submitting).
