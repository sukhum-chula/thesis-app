# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

@AGENTS.md
@HANDOFF.md

## Commands

```bash
npm run dev          # dev server (localhost:3000)
npm run build        # prisma generate && next build — run before committing non-trivial changes
npm run lint         # eslint (flat config, eslint-config-next core-web-vitals + typescript)
npm run db:migrate   # prisma migrate dev (see note below — this repo has no migrations dir)
npm run db:seed      # tsx prisma/seed.ts — NEVER against production (real faculty names, shared passcode; see HANDOFF.md)
npm run db:studio    # prisma studio
```

There is no test runner (no Jest/Vitest/Playwright, no test files). Verify changes by running
`npm run build` and exercising the flow manually (dev server + browser), not by writing tests.

**Migrations**: `prisma/migrations/` does not exist — the schema is managed with `prisma db push`.
`npm run db:migrate` / `prisma migrate deploy` against a fresh database creates nothing; use
`npx prisma db push` (direct connection, port 5432). See `docs/SUPABASE-MIGRATION.md` for the
project-to-project migration procedure if you're touching database/env config.

## Architecture

Next.js 16 App Router, one Postgres database (Supabase), server-fetched state — **not** a SPA with
client-only state. The behavioral spec (workflow steps, roles, email rules, upload gating, UI
conventions) is `AGENTS.md` (imported above); this section is only the map of *where* things live.

```
src/app/api/                 all business logic — route handlers are the source of truth
  submissions/route.ts         GET list (scoped to the caller's involvement), POST create
                               (proposal-first gate; unresolvable committee email → 400)
  submissions/[id]/route.ts    GET/DELETE; PATCH actions — approve/reject/resubmit/return_to_prev/
                               request_cancel/accept_cancel/decline_cancel/save_proposal_draft/
                               save_defense_draft/admin_update/admin_override_step/admin_reset
  submissions/[id]/sign/       POST — sequential multi-member signing (CO_ADVISOR/EXAM_COMMITTEE/
                               INVITED_EXAM_COMMITTEE)
  submissions/[id]/finance-attach/  POST — ADMIN generates FINANCE_ATTACH at step 2
  submissions/[id]/cover-memo/      POST — ADMIN generates the memo .docx (not stored)
  submissions/auto-draft-proposal/  POST — STUDENT get-or-create of a blank DRAFT PROPOSAL
  submissions/auto-draft-defense/   POST — STUDENT get-or-create of the DRAFT THESIS_DEFENSE
                               imported from a completed proposal
  upload/route.ts              POST — upload gate (who may upload which form at which step,
                               file format, per-member B3); upload/[uploadId]/signed-url GET
  users/route.ts, users/[id]/  account create (the one route every account goes through, incl.
                               approving an EXTERNAL request) / edit / reset passcode / delete
  admin/                       department-chair, program-chairs, finance-contact, users/reorder
  external-requests/           STUDENT requests a new EXTERNAL account; ADMIN rejects via [id]
  super-admin/                 users, submissions — read-only lists for SUPER_ADMIN
  notifications/               bell notifications
  cron/exam-reminders/         daily bell reminders (CRON_SECRET-guarded, see vercel.json)
  auth/[...nextauth]/          NextAuth
src/app/<role>-dashboard/    landing pages: admin-, super-, student-, professor-dashboard
                             (src/lib/roleRoutes.ts maps each account role to one)
src/app/dashboard/           layout.tsx is the shared top bar (re-exported by every landing page);
                             old /dashboard/<role> paths redirect to the landing pages; detail pages
                             are thin wrappers: admin/[id] → AdminSubmissionPanel,
                             professor/[id] → RoleSubmissionDetail, student/[id] →
                             StudentSubmissionActions, student/submit → SubmissionForms;
                             admin/users (+ [uid]) → AdminUsersPanel / UserDetailPanel
src/app/demo-users/          local-only account picker for testing (not in production)
src/components/              the shared UI every dashboard is built from:
  AdminSubmissionPanel         the ADMIN's whole per-submission surface (action card, override,
                               edit form, cancel accept/decline, delete)
  RoleSubmissionDetail         faculty view of a submission → SignatureButton / CommitteeSignPanel
  StudentSubmissionActions     the student's whole per-submission surface
  SubmissionForms              ProposalForm/DefenseForm + CommitteePeopleEditor, ExamLogisticsSection,
                               ProgramChairAutoField, validators
  ProposalDraftReview, DefenseDraftReview   the editable DRAFT forms
  FileUploader                 upload slots + the action-card building blocks (ACTION_CARD,
                               SectionLabel, DownloadRow, NotesField, ActionError, PRIMARY_BUTTON,
                               postUpload, …) every "your turn" card is made of
  B1Checklist, ExamResultPicker, FileList, WorkflowTimeline, SubmissionInfoPanel, StatusBadge
  AdminUsersPanel, UserDetailPanel, UserProfileHeader, AdminSettingsPanel, PasscodeField
  StudentExternalRequests, NotificationBell, LanguageToggle, Providers
  DashboardHeader              unused — no page renders it
src/context/AppContext.tsx   client state cache; polls the API, exposes actions (approveCurrentStep,
                             committeeSign, adminOverrideStep, getOrCreateProposalDraft,
                             saveProposalDraft, getOrCreateDefenseDraft, saveDefenseDraft,
                             requestCancelSubmission, adminAcceptCancel, adminDeclineCancel, ...)
src/context/ToastContext.tsx toasts
src/lib/
  prisma.ts                  Prisma singleton (globalThis-cached — see AGENTS.md, do not "fix")
  auth.ts                    NextAuth v5 config (credentials + JWT session)
  accountScope.ts            account-management tiers — who may manage/grant which account type
  email.ts                   nodemailer step/finance/account emails
  supabase.ts                storage helpers (private `thesis-files` bucket, service-role key);
                             getSignedUrl mints the 1h URLs served by upload/[uploadId]/signed-url
  committee.ts               validatePeople/validatePeopleLenient/resolvePeople(Partial) — account
                             lookup only, never creates one; validateCommitteeAccountRoles and the
                             resolved-committee checks used by admin_update
  systemSettings.ts          the only code touching the SystemSetting table (department chair,
                             program chairs, finance contact). NOTE: attachSystemSettings' computed
                             flags only reach the client if also listed in the mapUser() whitelists
                             in api/users/route.ts and api/users/[id]/route.ts
  workflowSteps.ts           PROPOSAL_ROLES/THESIS_ROLES, PROPOSAL_STEP/THESIS_STEP (named
                             stepOrders — branch on these, never bare numbers), financeStepOf,
                             buildWorkflowSteps, committeeRoster/PER_MEMBER_FORMS,
                             previousActiveStep, planCommitteeStepSync/currentTurn
  stepNumbering.ts           stepNumbering() — the step numbers users SEE (PROPOSAL 5.x and
                             THESIS 8.x sub-steps); never derive a displayed number from an index
  financeDoc.ts              buildFinanceDocx() — fills templates/finance-attach-{proposal,thesis}.docx
  coverMemoDoc.ts            buildCoverMemoDocx() / buildDefenseResultMemoDocx() — fill
                             templates/cover-memo-proposal.docx and cover-memo-defense-result.docx
  uploadVersions.ts          keepOnlyLatestVersion() — single-version form types delete the old
                             row + storage object on a new copy
  docxText.ts                docxText() — body text of a .docx, for "did the content change" checks
  utils.ts                   getStepName, ROLE_LABELS/ROLE_GRADIENT/ROLE_EMOJI, formatUserName,
                             degreeOfProgram/committeeRoleScope/accountFitsScope, the checklists
                             (B1_CHECKS, SIGN_CHECKS, …), formFileKind/checkFormFile,
                             freshUploadCutoff, isHiddenFromStudent, isSingleVersionForm,
                             previewFile/downloadFile, …
  roleRoutes.ts              landing page per account role (EXTERNAL → /professor-dashboard)
  translations.ts            Thai→English dictionary for the EN toggle — hand-maintained, edit it
                             directly (the wordlist spreadsheet is gone; see AGENTS.md "English toggle")
  config.ts                  DEMO_MODE (NEXT_PUBLIC_DEMO_MODE)
  workflow.ts, fileStore.ts  dead leftovers from the pre-database mock build — ignore them
prisma/schema.prisma         DB schema — source of truth for models/enums
templates/                   the department's .docx forms the generators fill
```

**Files are never served by public URL** — `FormUpload.fileUrl` stores a bare storage path (the
bucket is private). Any preview/download must go through `GET /api/upload/[uploadId]/signed-url`;
see `previewFile`/`downloadFile` in `src/lib/utils.ts`.

**Two role systems, don't conflate them**: `User.roles: Role[]` (`SUPER_ADMIN | ADMIN | STUDENT |
PROFESSOR | EXTERNAL`) is the literal account type in the DB/session (`src/types/index.ts`).
`EXTERNAL` (กรรมการภายนอก) accounts behave exactly like `PROFESSOR` — tagged separately so committee
pickers can tell internal faculty from external examiners (`FACULTY_ROLES` in
`src/app/api/users/route.ts` includes both). Per submission, accounts additionally play
*contextual* roles (`ADVISOR`, `CO_ADVISOR`, `PROGRAM_CHAIR`, `HEAD_EXAM_COMMITTEE`,
`EXAM_COMMITTEE`, `INVITED_EXAM_COMMITTEE`, `DEPARTMENT_CHAIR`) — plain strings on
`WorkflowStep.role` / submission fields, not part of the `Role` enum. The step sequences that use
them are `PROPOSAL_ROLES` / `THESIS_ROLES` in `src/lib/workflowSteps.ts`.

**`docs/ARCHITECTURE.md` and `docs/RECIPES.md` are stale** — they describe a pre-database version
(all state in `AppContext` + `localStorage`). Don't follow them; `AGENTS.md` is current.
