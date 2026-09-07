# Changelog

Dated, human-readable record of notable changes to the Thesis Management System. Newest first.
This starts from 2026-09-06 — for anything earlier, see `git log` and `SESSION-REPORT-2026-09-04.md`
(the ownership-transfer session). Not every commit needs an entry here — skip pure typo/formatting
fixes; do write one for anything that changes behavior, permissions, routes, or schema.

## 2026-09-07

- **Removed `EMAIL_OVERRIDE_TO` entirely.** This env var used to redirect every outgoing email to
  one testing address so Preview/Development deployments and local dev could never accidentally
  email real students/faculty. Removed the override branch from `sendMail()`
  (`src/lib/email.ts`), deleted the var from `.env.local` and from Vercel's Preview/Development
  environments, and updated `AGENTS.md`/`HANDOFF.md`/`docs/SUPABASE-MIGRATION.md`. No environment
  has a safety net anymore — see the warning near the top of `HANDOFF.md`.

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
  scoping, and full create/update/delete on every account type — see `HANDOFF.md` §8. Found and
  fixed one real bug along the way — a `router.replace()`-during-render React error on the ADMIN
  submission-detail guards.
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
