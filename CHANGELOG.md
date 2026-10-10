# Changelog

Dated record of notable changes to the Thesis Management System. Newest first.

Only changes that are **still in effect** are kept. Intermediate designs that were later replaced
(e.g. the parallel บ.3 committee step, the 19–23-step defense layouts, `pendingPeople` drafts, the
student picking the exam result) were pruned on 2026-10-10 — see `git log` for that history. `AGENTS.md` is the current spec; this
file says when and why things changed.

Write an entry for anything that changes behavior, permissions, routes or schema; skip pure
typo/formatting fixes. When a change replaces an earlier entry, edit or remove that entry rather
than leaving both.

## 2026-10-10

- **A committee member's rejection reason now shows on the progress cards.** `POST /sign` with
  `REJECTED` stored the note only in `committeeActions`, so the admin's step card, the timeline and
  the student's rejected box (all read `step.notes`) showed no reason. It now also sets `step.notes`
  (cleared on `resubmit`, as before).
- **Defense step 12 (stepOrder 15) is one combined PDF.** The student uploads a single `B4` file:
  บ.4 → the thesis's first 5 iThesis pages → iThesis's 2-page "DOCUMENTS FOR SUBMISSION OF
  COMPLETE THESIS" (student + advisor signed), instead of separate `B4` + `THESIS` files. New
  checklist items for the iThesis pages and the file order; the admin check (step 13) adds one; the
  department chair (step 14) is told to sign only the บ.4 page and upload the whole file back.
  `THESIS` is no longer required or offered; older submissions keep theirs. No step rows changed.
- **The student's action card says why ส่งต่อ is disabled** (missing file vs. unticked checklist) —
  the faded button alone looked like it didn't respond.
- **English (EN) version fixed, student screens first.** About 46% of student-facing Thai strings
  came out untranslated or half-translated (`สอบProposal`, `ถึงคิวของmember(s)`), and short
  dictionary words were replaced inside other words and inside names (`เท่านั้น` → `เmember(s)ั้น`,
  `ตั้งใจดี` → `ตั้งใจGood`). Now: ~280 new dictionary entries (student UI, checklists, API errors
  and notifications); the toggle sorts keys longest-first and lets keys under 8 characters match only
  as standalone tokens; user data is marked `translate="no"`; and text nodes React adds later are
  translated too (a TreeWalker never visits its own root, so an added text node used to stay Thai).
  Admin/professor screens also improved (379 → 463 of 649 strings fully English).
- **Committee signing order changed (new submissions only).** PROPOSAL 5.x (stepOrder 5–9) is now
  advisor → co-advisors → exam committee → head → external; THESIS_DEFENSE 8.x (stepOrder 8–11)
  is co-advisors → exam committee → head → external. The proposal head's ผ่าน/ไม่ผ่าน picker is keyed
  on the step's role. Existing submissions keep their old rows (both existing proposals are
  COMPLETED and were left alone).
- **A sent-back signer keeps their earlier upload.** `SignatureButton` shows a copy uploaded after
  the previous step's approval as the slot's current file (with เปลี่ยนไฟล์) and counts it as ready,
  so the signer doesn't have to re-pick the same files.
- **THESIS_DEFENSE step 13 (admin checks บ.4 + thesis) lists both files** under ① download
  (`ADMIN_STEP_FORMS`).
- **External-committee request form shows an iThesis notice** (the member must already be approved
  in iThesis). Display only.

## 2026-10-08

- **Exam-reminder emails removed.** `/api/cron/exam-reminders` still creates the in-app bell
  notifications; `sendExamReminderEmail` is gone.

## 2026-10-06

- **PROPOSAL grows to 14 steps (shown 1–10).** Step 8 (stepOrder 12): the admin generates the
  cover memo (`POST /api/submissions/[id]/cover-memo`, `src/lib/coverMemoDoc.ts`, the department's
  letterhead template — memo date, name, code, program, title, department chair; not stored),
  converts it to PDF and uploads it as `COVER_PAGE`. New step 9 (stepOrder 13, `DEPARTMENT_CHAIR`)
  signs it (newer than step 8). New step 10 (stepOrder 14, ADMIN) delivers to the Faculty and
  uploads `LESSPAPER_RECEIPT` (new `FormType`, single version for a proposal). The department chair
  is now involved in every submission. The one in-flight proposal was backfilled with PENDING rows
  13–14.
- **THESIS_DEFENSE result memo generated in the system.** At step 9 (stepOrder 12) the admin
  generates "ขอส่งผลสอบวิทยานิพนธ์" (`buildDefenseResultMemoDocx`) and uploads it as `COVER_PAGE`; the
  department chair signs it with ใบรายงานผล at step 10. Steps 4, 11 and 15 (stepOrders 4, 14, 18)
  upload a LessPaper receipt instead of a cover page; step 13 (stepOrder 16) is a plain check. A
  defense's LessPaper copies share one slot with history.
- **THESIS_DEFENSE steps 6–7: the advisor picks the exam result.** The student uploads signed
  แบบรายงานฯ, a blank ใบรายงานผล and `VERY_GOOD_EVAL` (always; filled only for ดีมาก). The advisor picks
  ดีมาก/ดี/ผ่าน/ไม่ผ่าน (note line `ผลการสอบ:`, server-required at step 7), fills in and signs
  ใบรายงานผล, and both files must be newer than step 6. The admin's result check shows a ดีมาก note.
- **The department chair signs บ.4 only** at step 14 (stepOrder 17), not the thesis.
- **The student uploads only the first 5 pages of the thesis** from iThesis (covers, committee
  signature page, abstracts), barcoded and not edited since download (`DEFENSE_STEP15_CHECKS`).

## 2026-10-05

- **"ใบปะหน้า" renamed "บันทึกข้อความ" in the UI** (enum `COVER_PAGE` unchanged).
- **PROPOSAL step 4's name says the proposal exam must already be done.**
- **A proposal with any linked defense can't be deleted** (409, any defense status) — deleting it
  used to null the defense's `sourceProposalId`.
- **`/super-dashboard` lists EXTERNAL accounts** (they were fetched but never rendered).

## 2026-10-01

- **THESIS_DEFENSE restructured to 20 steps (shown 1–17).** Advisor and head sign บ.2 on paper
  before upload (`DEFENSE_STEP1_CHECKS`); admin finance check is step 2 (`financeStepOf` = 2 for
  both types); step 5 is confirm-only (the admin forwards the Faculty's email, no uploads, no
  invitation email); ใบรายงานผล is signed by the committee and the department chair only (no
  program-chair step), shown as 8.1–8.x; new admin result check / department chair / admin send
  steps (stepOrders 12–14); the committee signs the thesis outside the system; after the student's
  บ.4 + thesis come admin check, department chair, admin send, admin forward of the Dean-signed
  documents, and the student's iThesis confirmation (the last step). The department chair
  (`SystemSetting` `departmentChair`) became a workflow actor (`DEPARTMENT_CHAIR`). The test defense
  `cmuoyo8l…` was rebuilt to this layout.
- **Admin steps: อนุมัติ + ส่งกลับ only.** `reject` on an ADMIN step returns 400; the override card is
  อนุมัติ + ส่งกลับ on every step. Shared `previousActiveStep()`. A send-back to the student no longer
  doubles the bell notification.
- **One design for every "your turn" card**, built from `FileUploader.tsx`'s shared pieces (fixed
  order ① download → ② sign → ③ upload → checklist → notes → button). Picked files upload on the
  primary button; errors show inline; the rejected-fix card starts empty; the admin card gained ①
  download (`ADMIN_STEP_FORMS`); pickers and notices live inside the signer card.
- **Checklist wording made consistent** (rules in `AGENTS.md`), and every signing step got an
  own-signature checklist.
- **Fixes**: the department chair couldn't open a defense; "ถึงคิวของท่านแล้ว" showed for every
  committee member instead of the one in turn; the override card's choice was frozen at mount and
  could send back an approved step; the professor dashboard's "ท่านอนุมัติแล้ว" showed while it was
  their turn again.
- **The file list sits last** in every submission view's right-hand column.

## 2026-09-30

- **Defense step 1: one signed บ.3 per committee member**, collected outside the system and uploaded
  per member (`committeeRoster()`, new nullable `FormUpload.memberId`, added live). The admin
  generates the defense finance form (`templates/finance-attach-thesis.docx`), hidden from the
  student and single-version. `THESIS_STEP` constants replace bare defense step numbers.
- **Student dashboard lands on the defense tab** when a non-cancelled defense exists.
- **New `COVER_PAGE` form type** (`ALTER TYPE ... ADD VALUE`, live); missing-upload errors name forms
  in Thai (`FORM_SHORT`). PROPOSAL step 6 asks the admin to rename the title to match บ.วศ.1ง.

## 2026-09-29

- **PROPOSAL uses one combined `B1` file (บ.วศ.1ก–ง, PDF) throughout.** Step 1 uploads only `B1`
  with a 5-item checklist; step 4 re-uploads it with 1ค + 1ง filled (`freshUploadCutoff()` — must be
  newer than step 3); steps 3 and 5–11 sign it. Form formats via `formFileKind()` (magic-byte
  checked). `BW1A`/`BW1B` renamed `B1A`/`B1B` (live enum). Blank forms link to the department site.
- **The admin generates the proposal's finance form at step 2** (`POST
  /api/submissions/[id]/finance-attach`, `src/lib/financeDoc.ts`, new dependency `jszip`): editable
  and re-uploadable, single-version (`keepOnlyLatestVersion`), with a content-differs warning
  (`docxText`). Approving step 2 needs a 6-item checklist and **sends the finance email**. Steps 3+
  have no finance content; step 4's admin FINANCE_DOC gate was removed. Proposal finance documents
  are hidden from the student (`isHiddenFromStudent()`).
- **Checklists at proposal steps 3, 4, 5.x, 6 and 7.**
- **Step numbering 5.1–5.x** (`src/lib/stepNumbering.ts`) on every screen; internal stepOrder
  unchanged.
- **Admin submission edit uses the student's editor** (`CommitteePeopleEditor`,
  `ProgramChairAutoField`, `ExamLogisticsSection` with `allowPastDate`) — the old fixed 3-slot
  dropdowns silently dropped a 4th member.
- **An admin committee edit re-syncs open steps** (`planCommitteeStepSync()`), re-derives status and
  notifies whoever's turn it now is; `admin_reset` re-snapshots member lists.
- **`admin_update` checks role counts** on a non-DRAFT (`validateResolvedCommitteeCounts()`).
- **A COMPLETED submission can't be cancelled.**
- **One person, one committee role** (PROGRAM_CHAIR excepted) — `findDuplicateCommitteeMember()`,
  enforced in validation, `admin_update` and the editor.

## 2026-09-15

- **Committee composition is degree-dependent and enforced server-side.** `committeeRoleScope()` /
  `degreeOfProgram()` / `accountFitsScope()` in `utils.ts` are the one rule (PHD head must be
  EXTERNAL; กรรมการสอบ PROFESSOR only); `validateCommitteeAccountRoles()` on create, confirm, draft
  save and `admin_update`.
- **`pendingPeople` drafts removed.** Students can only pick existing accounts, so `DRAFT` now means
  only "still being filled in". Removed the column, `continue_draft`, the pending-account cards and
  the `/dashboard/admin/pending-professors` page. An unresolved email is a plain 400.
- **Drafts heal unusable members on re-open** (`buildPeopleFromSubmission`, `Person.invalid`,
  `rowInvalidReason`), and both save and confirm refuse while one remains (client
  `validateNoInvalidRows`, server `requireAccount: true`).
- **Department chair setting** (`SystemSetting` `departmentChair`), first section of "ตั้งค่าระบบ".
  Computed flags must also be listed in both `mapUser()` whitelists to reach the client.
- **User delete explains what blocks it** (`describeDeleteBlockers()`, 409 with counts). Only
  `Submission.studentId` and `FormUpload.uploadedById` block; `advisorId`/`actedById` are SET NULL.
  `ExternalCommitteeRequest.requestedById` is now `onDelete: Cascade` (it used to make any requester
  undeletable). Toasts wrap wider and stay 8s.
- **Dead `Signature` model removed; live DB now has exactly the 7 schema tables** (`signatures`,
  `rate_limits`, `magic_tokens` dropped). `prisma db push` won't drop a removed model's table — drop
  it deliberately. `scripts/migrate-supabase.mjs` / `docs/SUPABASE-MIGRATION.md` updated to the 7
  tables.
- **Known, unresolved**: the storage bucket held ~405 orphaned objects (data cleared outside
  `DELETE /api/submissions/[id]`); committee id columns aren't FKs, so deleting a professor can leave
  dangling ids.

## 2026-09-09

- **Magic-link login removed** (tokens never expired quickly or were single-use). Emails link to
  plain `/login`.
- **Dead code removed**: the 9 `/dashboard/<contextual-role>` routes, `/demo` + `/api/auth/demo`,
  `RolePendingList`, `src/lib/rateLimit.ts`, `STEP_NAMES`, and 5 unused dependencies.
- **Admin-only rank codes (A/B/C/D###)** with drag-to-reorder (`User.rankOrder`,
  `POST /api/admin/users/reorder`).
- **INVITED_EXAM_COMMITTEE supports multiple members** (`invitedCommitteeIds String[]`, migrated;
  snapshot columns dropped), signing sequentially like the other multi-member roles.
- **Email send results are reported** for passcode reset, login-email change and add-user
  (`passcodeEmailSent` / `emailChangeNoticesSent`), instead of always claiming success.
- **Admin action buttons disable while in flight** (no duplicate PATCH on double-click).
- **Admin user-list header stacks below `xl`.**

## 2026-09-08

- **`User.title` split out of `name`** (`NameTitle` enum, `formatUserName()` everywhere); also on
  `ExternalCommitteeRequest`.
- **ADMIN/SUPER_ADMIN can change a user's login email**; old and new addresses are notified.
- **EXTERNAL accounts were missing from the ADMIN's `GET /api/users`** — fixed.
- **Draft save may be incomplete** (`validatePeopleLenient` / `resolvePeoplePartial`, `confirm`
  flag on `save_*_draft`); only confirm enforces requirements.
- **Proposal tab is blank-draft-first** (`POST /api/submissions/auto-draft-proposal`,
  `ProposalDraftReview`); `CommitteePeopleEditor` got drag-to-reorder (= sign order) and 4 default
  rows; exam time uses the locale-independent `TimeSelect`.
- **`/professor-dashboard` shows every involved submission** with status tabs.
- **Stale session returns 401** instead of falling back to stale JWT roles.
- **`AdminUsersPanel` filters**: role pills, search, active-submission checkbox. "นักศึกษา" → "นิสิต"
  app-wide.
- **Popups no longer close on a drag that ends outside the panel.**

## 2026-09-07

- **`SystemSetting` table** for program chairs and finance contact (`src/lib/systemSettings.ts`;
  rows never deleted, only nulled); a professor may chair several programs (`programChairFor` is an
  array); "ตั้งค่าระบบ" tab (`AdminSettingsPanel`); finance email prefers the designated contact.
- **Admin submission rows expand in place** (`AdminSubmissionPanel`); `/dashboard/admin/[id]` is a
  thin wrapper.
- **Admin-only account creation; "password" renamed "passcode"** (`User.passcodeHash`, renamed live).
  Self-registration and forgot-password removed. Admins may type or generate a passcode
  (`PasscodeField`, `isValidPasscode()`).
- **`EMAIL_OVERRIDE_TO` removed** — every environment sends real email.
- **Student creates and acts on submissions inside `/student-dashboard`** (auto-drafted defense,
  `DefenseDraftReview`, `StudentSubmissionActions`).
- **User delete returns 409 instead of a bare 500** when FK-blocked.
- **All live accounts' passcodes were bulk-reset to `A00a00`** for testing — an unresolved security
  issue (see `HANDOFF.md`).

## 2026-09-06

- **SUPER_ADMIN and ADMIN split** (`src/lib/accountScope.ts`): SUPER_ADMIN manages SUPER_ADMIN/ADMIN
  accounts with zero workflow access; ADMIN owns the workflow and manages ADMIN/PROFESSOR/STUDENT.
  New landing pages `/super-dashboard` and `/admin-dashboard`.
- **Users list sorted by role then rank/studentId; rows expand in place** (`UserDetailPanel`).
- **`/demo-users`** — local-only account picker for testing.
- **Proposal-first workflow** (`sourceProposalId`; defense imports an independent copy of the
  committee). **Committee people must already have accounts** — no auto-create.
- **Cancellation requires ADMIN accept/decline** (`request_cancel` freezes the submission).
- **`/student-dashboard` tabbed layout** with inline progress, `SubmissionInfoPanel`, and
  `WorkflowTimeline`'s `preview` prop.

## 2026-09-04 — ownership transfer

- **Moved to the new owner's accounts**: GitHub `sukhum-chula/thesis-app`, Vercel `sukhums-4319`
  (env vars set — the project previously had none), Supabase `tluqclmgbnciymxzknhh` (schema via
  `prisma db push` over the direct connection; all tables and 399 storage files copied and verified
  with `scripts/migrate-supabase.mjs`). The old project `jttfcoisygcqqshghkmn` was paused, not
  deleted.
- **Storage bucket made private.** It had been public, so every uploaded document was reachable
  by URL. `FormUpload.fileUrl` now stores a bare path, served via 1h signed URLs from
  `GET /api/upload/[uploadId]/signed-url`; existing rows were rewritten.
- **Email via Gmail SMTP**; the unused Resend integration and its orphaned routes were removed.
  `CRON_SECRET` set.
- `CLAUDE.md`, `HANDOFF.md`, `docs/SUPABASE-MIGRATION.md` and the migration script committed.
