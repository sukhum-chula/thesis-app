# Changelog

Dated, human-readable record of notable changes to the Thesis Management System. Newest first.
This starts from 2026-09-06 — for anything earlier, see `git log` and `SESSION-REPORT-2026-09-04.md`
(the ownership-transfer session). Not every commit needs an entry here — skip pure typo/formatting
fixes; do write one for anything that changes behavior, permissions, routes, or schema.

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
