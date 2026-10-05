<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

# Project: ระบบจัดการวิทยานิพนธ์ (Thesis Management System)

A role-based thesis approval workflow app. **Fully live** — Next.js 16 App Router, Prisma ORM → Supabase PostgreSQL, NextAuth v5 (credentials login), file uploads to Supabase Storage. UI is in Thai.

## Stack & deployment
- **DB**: Prisma + `@prisma/adapter-pg` → Supabase PostgreSQL. Client in `src/lib/prisma.ts` (singleton always cached on `globalThis` — both dev and Vercel production).
- **Auth**: NextAuth v5, credentials only (email + passcode, bcrypt against `User.passcodeHash`). `src/lib/auth.ts`. Login email is trimmed + lowercased before lookup. There is no self-registration and no self-service password reset — see "Account creation & passcodes" below. (Magic-link auto-login, `/api/auth/magic`, was removed 2026-09-09 — see "Magic-link login removed" below.)
- **Email**: SMTP via nodemailer in `src/lib/email.ts` (shared `sendMail()` helper) — `sendStepEmail()` on every step advance, `sendFinanceEmail()` at step 2 (ADMIN approve) of PROPOSAL and THESIS_DEFENSE (called directly, not via HTTP). Emails go to real recipients. Sender: Office365/generic SMTP when `SMTP_USER`/`SMTP_PASS` are set (default host smtp.office365.com:587), else Gmail via `GMAIL_USER`/`GMAIL_APP_PASSWORD`. Each recipient gets a plain link text (no styled button) to `/login`, plus a reminder to sign in with their email + passcode — there is no auto-login link (magic-link login was removed 2026-09-09; it never expired quickly enough and was never single-use, so a forwarded/leaked notification email let anyone log in as that user for up to 48h with no passcode).
- **Storage**: Supabase Storage bucket `thesis-files` — **private**, not publicly readable. `POST /api/upload` stores the object's storage path (not a public URL) on `FormUpload.fileUrl`; previews/downloads resolve a 1h signed URL on demand via `GET /api/upload/[uploadId]/signed-url` (gated by the same submission-involvement check used elsewhere in the API). See `src/lib/supabase.ts`. Do not store or serve a public URL directly — the bucket was briefly public before 2026-09-04 and every uploaded document was reachable by anyone with the link; that was a bug, not the design.
- **Deploy**: Vercel (`thesis-app` project, account `sukhums-4319`), auto-deploys on push to `main` (GitHub: `sukhum-chula/thesis-app`).

### Required env vars (Vercel + local `.env.local`)
```
DATABASE_URL          # Supabase pooler in TRANSACTION mode (port 6543, host aws-*-...pooler.supabase.com).
                      # Session mode (:5432) has a 15-client cap and caused EMAXCONNSESSION under real traffic.
                      # Note: `prisma db push` needs the DIRECT connection (port 5432) instead — the
                      # transaction pooler doesn't support the prepared statements the migration engine uses.
AUTH_SECRET           # NextAuth v5 naming — NOT "NEXTAUTH_SECRET"
NEXTAUTH_URL          # Production only; leave unset on Preview/Development so the VERCEL_URL fallback works
GMAIL_USER            # Gmail address used as SMTP sender (fallback when SMTP_USER unset)
GMAIL_APP_PASSWORD    # Google App Password (16 chars, requires 2FA enabled on that account)
SMTP_USER             # optional: Office365/generic SMTP sender, takes priority over Gmail
SMTP_PASS             # password for SMTP_USER — mailbox needs "Authenticated SMTP" enabled
SMTP_HOST             # optional, default smtp.office365.com
SMTP_PORT             # optional, default 587 (STARTTLS)
NEXT_PUBLIC_SUPABASE_URL
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY  # or NEXT_PUBLIC_SUPABASE_ANON_KEY (either name works, src/lib/supabase.ts)
SUPABASE_SERVICE_ROLE_KEY             # server-side only; storage admin ops + signed URLs
FINANCE_EMAIL         # fallback recipient for finance notifications — only used when no ADMIN is
                      # designated as finance contact (SystemSetting key "financeContact", set via
                      # the "ตั้งค่าระบบ" tab); see "Program Chair & finance-contact assignment"
CRON_SECRET           # guards /api/cron/exam-reminders; unset makes the endpoint publicly callable.
                      # Vercel's own Cron scheduler (see vercel.json) sends the matching Bearer header
                      # automatically when this is set in the project.
NEXT_PUBLIC_DEMO_MODE # "true" enables the demo reset tools card in AdminUsersPanel; unset in production
```

---

## Key facts

- **All API logic is in `src/app/api/`**. State is server-fetched; client state lives in `AppContext` which polls the API.
- Two submission types: **PROPOSAL** (12 steps, shown as 1–4, 5.1–5.x, 6–8) and **THESIS_DEFENSE** (20 steps, shown as 1–7, 8.1–8.x, 9–17). Step arrays: `PROPOSAL_ROLES` / `THESIS_ROLES` in `src/lib/workflowSteps.ts`. The two proposals created before step 12 existed were backfilled with a PENDING step-12 row on 2026-09-30 (insert-only); a PROPOSAL that somehow lacks it would still just finish after the chair's signature, since every rule treats "no PENDING step left" as completion.
- **Step names**: `PROPOSAL_STEP_NAMES` / `THESIS_STEP_NAMES` in `src/lib/utils.ts`. Always call `getStepName(stepOrder, submissionType)` — never access the maps directly.
- **EXAM_COMMITTEE, CO_ADVISOR, and INVITED_EXAM_COMMITTEE steps** track per-member decisions in `committeeActions` (JSON on `WorkflowStep`). All assigned members must approve, signing sequentially in list order, before the step advances. CO_ADVISOR steps are auto-SKIPPED at creation when `coAdvisorIds` is empty.
- **Required uploads gate**: Before a STUDENT step can advance, the student must upload specific form types. Enforced server-side in `PATCH /api/submissions/[id]` (action `"approve"`) and client-side in the student detail page.
  ```
  PROPOSAL:       step 1 → [B1],  step 2 (ADMIN) → [FINANCE_ATTACH, generated],  step 4 → [B1 (new copy, after step 3)],  step 12 (ADMIN) → [COVER_PAGE]
  THESIS_DEFENSE: step 1 → [B2, one B3 per committee member],  step 2 (ADMIN) → [FINANCE_ATTACH, generated],  step 4 (ADMIN) → [COVER_PAGE],  step 6 → [SIGNED, EXAM_RESULT],   step 14 (ADMIN) → [COVER_PAGE, a new copy after step 13],   step 15 → [B4, THESIS],   step 16 (ADMIN) → [COVER_PAGE, a new copy after step 15]
  ```
  PROPOSAL needs no finance document at step 4 or later (removed 2026-09-29) — the proposal's only finance paperwork is the FINANCE_ATTACH the ADMIN generates at step 2. Step 4 is a plain student step: the student's own submit advances it. (THESIS_DEFENSE's Faculty-returned FINANCE_DOC is unrelated and unchanged.)
- **Tailwind class names in lookup maps must be whole static strings** (no interpolation).
- UI text is Thai; use Sarabun font (already global). Keep UI large and calm — target users include older faculty.

---

## Workflow behaviour — critical rules

### Proposal-first: one active proposal, defense imports its committee
A student always starts with a **PROPOSAL**. `POST /api/submissions` blocks creating a new PROPOSAL
while the student already has one with `status !== "CANCELLED"` (any other status — DRAFT,
IN_PROGRESS, REJECTED, even COMPLETED — counts as active). To start over, the existing one must be
cancelled first (see below).

A **THESIS_DEFENSE** can only be created from an existing, `COMPLETED`, non-cancelled PROPOSAL
(`sourceProposalId`), and only one non-cancelled defense may exist per proposal at a time. Creating
one **imports** the committee (advisor/co-advisors/head/exam committee/invited/program chair) from
that proposal into the new submission's own `people[]` editor — the student can then change it
before submitting. The defense's committee fields are its own independent columns, never a live
reference to the proposal's row, so editing them **never writes back to the proposal**. Student
info (name/code/program/email/phone) is still copied verbatim from the proposal and isn't editable
at defense creation.

### Account creation & passcodes — admin-only, admin-chosen or generated (2026-09-07, unified onto one route 2026-09-07; hand-entry added 2026-09-07)
There is **no self-registration** — `/register` is a static "contact the department" page, and
`POST /api/auth/register` / `POST /api/auth/forgot-password` no longer exist. **Every** account —
including one created to resolve a DRAFT submission's missing committee person — goes through the
same `POST /api/users` route (`AppContext.superAdminAddUser`); the earlier dedicated
`POST /api/admin/pending-professors` endpoint was deleted once `AdminUsersPanel` started calling
`superAdminAddUser` directly (see "Committee accounts must pre-exist" below).

The credential is called a **passcode** (รหัสเข้าใช้งาน) everywhere user-facing, not a password —
end users still cannot set or change their own; `User.passcodeHash` (renamed from `passwordHash`)
is the only field. But an ADMIN/SUPER_ADMIN setting one on someone's behalf (creating an account,
or resetting one) may either **type a passcode by hand or click "สุ่มรหัส" to fill the field with
a generated one** (still `generatePassword()`, `src/lib/utils.ts` — 6 chars, pattern `A00a00`) and
then edit it before submitting — the shared `PasscodeField` component (`src/components/
PasscodeField.tsx`) renders this input + generate-button pair and is reused by `AdminUsersPanel`'s
add-user modal, `UserDetailPanel`'s and `/super-dashboard`'s reset-passcode dialogs, and the
and `UserDetailPanel`'s reset dialog. The field is pre-filled with a freshly
generated value each time a modal opens, so "just click submit" still reproduces the old
always-generated behavior — typing over it is what's new.

`POST /api/users` accepts an optional `passcode` field; `PATCH /api/users/[id]`'s `{
resetPasscode: true }` accepts an optional `passcode` alongside it. Server-side validation
(`isValidPasscode()`, `src/lib/utils.ts` — 6-72 chars, no whitespace) applies to a client-supplied
value; omitting the field (or sending `""`/`null`) still falls back to server-generated via
`generatePassword()` — used by any caller that doesn't surface the field (there is none left, but
the fallback is intentionally kept as defense-in-depth for future callers of these two routes).
Either way the resulting passcode is hashed with bcrypt and emailed via `sendWelcomeEmail` /
`sendPasscodeResetEmail` (renamed from `sendForgotPasswordEmail`, reworded since the reset is now
always admin-initiated rather than user-requested) exactly as before — the admin seeing/choosing
the value doesn't change that it's still emailed to the account owner. `AppContext`'s
`superAdminAddUser(userData)` takes an optional `passcode` field on `userData`, and
`superAdminResetPasscode(userId, passcode?)` takes an optional second argument.

### Name title (คำนำหน้าชื่อ) — split out of `User.name` into `User.title` (2026-09-08)
Every account's Thai honorific/academic prefix is its own nullable field, `User.title`, typed as
the `NameTitle` enum (`prisma/schema.prisma`) — **not** part of the free-text `name` anymore. The
enum's 9 values (`PROF_DR` ศ.ดร., `ASSOC_PROF_DR` รศ.ดร., `ASST_PROF_DR` ผศ.ดร., `ASST_PROF` ผศ.,
`LECTURER_DR` อ.ดร., `DR` ดร., `MR` นาย, `MISS` นางสาว, `MRS` นาง) `@map` each English key to its
Thai text, same pattern as `Role` — client code only ever sees/sends the English key.

`src/lib/utils.ts` is the only place this mapping is defined:
- `NAME_TITLE_LABELS` / `NAME_TITLES` — the key→Thai-label map and its keys, in dropdown order.
- `formatUserName({ title, name })` — renders `title + name` back together with no space, exactly
  as a pre-split name would have read (e.g. `{title: "ASST_PROF_DR", name: "อรุณี ใหม่มาก"}` →
  `"ผศ.ดร.อรุณี ใหม่มาก"`). Loosely typed (`title?: string | null`) so API-response shapes typed as
  plain strings don't need a cast at the call site. **Always use this to display a person's name**
  — never concatenate `title`/`name` inline, and never render bare `.name` for a `User`/`MockUser`.
- `splitNameTitle(fullName)` — the inverse parser (longest-prefix-first, so "ผศ.ดร." matches before
  "ผศ."); used only by the one-off backfill script that performed the original migration, not by
  any runtime code path (there's no "paste a full name and auto-split" UI).

`POST /api/users` and `PATCH /api/users/[id]` both accept an optional `title` (validated against
`NAME_TITLES`, nullable to clear it). Every admin-facing account create/edit form has a
"คำนำหน้าชื่อ" `<select>` (values from `NAME_TITLES`, defaulting to "— ไม่มี —") next to the name
field: `AdminUsersPanel`'s add-user modal, `UserProfileHeader`'s edit modal, `/super-dashboard`'s
add-admin form.

`formatUserName()` is threaded through every surface that displays a name from a live `User`
record: all dashboards, `SubmissionInfoPanel`, `RoleSubmissionDetail`, `WorkflowTimeline`,
`CommitteeSignPanel`, and `CommitteePeopleEditor`'s account-picker `<select>` — picking an account
there writes `formatUserName(account)` into that row's `Person.name`, so the title is baked into
`people[]`/the auto-injected `PROGRAM_CHAIR` entry exactly as it would have been
before the split. It also covers every outgoing email (`src/lib/email.ts`'s recipient/greeting
names, `sendWelcomeEmail`/`sendPasscodeResetEmail`/`sendFinanceEmail`/`sendExamReminderEmail`) and
`WorkflowStep.actedByName`/committee-sign-action snapshots taken at approve/reject time
(`submissions/[id]/route.ts`, `submissions/[id]/sign/route.ts`). The logged-in user's own title
flows through the same NextAuth session/JWT pipeline as `roles`/`studentId` (`src/lib/auth.ts`,
`src/types/next-auth.d.ts`) into `AppContext`'s `user`.

**Deliberately not touched** — historical denormalized text snapshots that have no parallel title
column to go with them, so fixing this properly would mean new schema columns, not a display-layer
change: `Submission.studentFullName` (student-info snapshot taken at submission-creation time), and
(The invited-committee
snapshot fields this bullet used to also list — `invitedProfName`/`invitedProfAffiliation`/
`invitedProfEmail`/`invitedProfPhone` — were removed 2026-09-09 when `INVITED_EXAM_COMMITTEE` moved
to multi-member support; see "Multiple external committee members" below.)

`ExternalCommitteeRequest` is **no longer** in that "deliberately not touched" bucket (fixed
2026-09-08) — it gained its own nullable `title` column (same `NameTitle` enum) instead of relying
on the requester typing a prefix into the free-text `name`. See "EXTERNAL account requests" below.

### Program Chair & finance-contact assignment — SystemSetting table (redesigned 2026-09-07)
Both of these admin-designated single-holder-per-key assignments live in one generic key/value
table, `SystemSetting` (`prisma/schema.prisma`: `key String @id`, `userId String?`,
`updatedAt`) — **not** columns on `User` (an earlier `User.programChairFor ProgramType? @unique` /
`User.isFinanceContact Boolean` design was replaced the same day once account records started
carrying too much system-configuration state). All reads/writes go through
`src/lib/systemSettings.ts` — nothing else touches this table directly:
- `getProgramChairUserId(program)` / `getProgramChairUser(program)` — who chairs a given program.
- `getProgramChairsOfUser(userId)` — every program a given user chairs (an **array** — see below).
- `getAllProgramChairs()` — full program→userId map (rows with no holder are excluded).
- `setProgramChair(program, userId | null)` — upserts `programChair:<program>`.
- `getFinanceContactUserId()` / `getFinanceContactUser()` / `setFinanceContact(userId | null)` —
  the `financeContact` key.
- `clearUserFromSystemSettings(userId)` — called from `DELETE /api/users/[id]` after a successful
  delete, so a deleted account never leaves a dangling reference.
- `attachSystemSettings(users)` — decorates a list of DB user rows with computed
  `programChairFor: string[]` / `isFinanceContact: boolean` fields for the API response; used by
  `GET /api/users`, `PATCH /api/users/[id]`, and `auth.ts`'s `authorize()`.

**Rows are never deleted, only nulled.** Clearing an assignment (or deleting the account that held
it) sets `userId: null` on that key's row rather than removing it — the key (`programChair:PHD`,
`programChair:ME_MECH`, `programChair:ME_CPS`, `financeContact`) always stays present in the table.

**A professor may chair more than one program at once.** Each `programChair:<program>` key still
holds at most one user (a program has one chair), but assigning a professor to a program no longer
clears any other program they already hold — this was a deliberate relaxation of the original
"one PROFESSOR, one program" rule. Correspondingly, `programChairFor` is an **array** everywhere it
appears client-side (`MockUser.programChairFor: ProgramType[]`, the NextAuth session/JWT field) —
every place that used to compare `=== program` now does `.includes(program)` (`AppContext.tsx`'s
`needsMyAction`/`getPendingCount`, `RoleSubmissionDetail.tsx`, `WorkflowTimeline.tsx`,
`StudentSubmissionActions.tsx`, both dashboard pages' step-assignee resolvers,
`AdminSubmissionPanel.tsx`, `AdminSettingsPanel.tsx`). Server-side, `getProgramChairsOfUser` is the
one place this fan-out happens (`findMany` instead of `findFirst`).

Either assignment is purely a **fallback** — the primary source of PROGRAM_CHAIR truth is always
`sub.programChairId` (per-submission, set from the student's `people[]` list); a program's
designated chair is only consulted when `programChairId` is unset. Likewise `sendFinanceEmail()`
(`src/lib/email.ts`) prefers the designated finance-contact user's email over the legacy
`FINANCE_EMAIL` env var, which is now only a fallback for when no contact has been set.

**Department chair (หัวหน้าภาควิชา) — a third key in the same table** (added 2026-09-15):
`SystemSetting` key `departmentChair`, one PROFESSOR account for the whole department (not
per-program, so there is no `:<program>` suffix). Read/written only through
`getDepartmentChairUserId`/`getDepartmentChairUser`/`setDepartmentChair` in
`src/lib/systemSettings.ts`, cleared by the same `clearUserFromSystemSettings` on account delete,
and surfaced to the client as a computed `isDepartmentChair: boolean` by `attachSystemSettings`
(alongside `programChairFor`/`isFinanceContact`). Since 2026-10-01 it is a **workflow
actor**: THESIS_DEFENSE stepOrders 13 and 17 have role `DEPARTMENT_CHAIR` (sign ใบรายงานผลการสอบ, then บ.4 + the thesis), routed to
this user for notifications, email, approve authorization and every client "whose turn" check; the
holder is also treated as involved in **every** THESIS_DEFENSE (list scoping in `GET
/api/submissions`, submission GET/reject, uploads, signed URLs). With nobody assigned, that step
has no one who can approve it.

ADMIN manages all three from one **"ตั้งค่าระบบ"** tab on `/admin-dashboard` (third tab, alongside
"จัดการคำร้อง"/"จัดการผู้ใช้งาน") and standalone below `AdminUsersPanel` at
`/dashboard/admin/users` — both render `AdminSettingsPanel`
(`src/components/AdminSettingsPanel.tsx`, extracted 2026-09-07 from what used to be a card inside
`AdminUsersPanel`), top to bottom: one department-chair `<select>` row (dropdown of every
PROFESSOR — **first section on the panel**, above everything else); 3 program-chair `<select>` rows
(one per `ProgramType`, each a dropdown of every PROFESSOR — picking one already assigned elsewhere
shows "(เป็นประธานหลักสูตร X ด้วย)" as information, not a warning, since it doesn't move them); and
one finance-contact `<select>` row (dropdown of every ADMIN account). Changing a row calls
`POST /api/admin/department-chair` (`{ userId }`), `POST /api/admin/program-chairs`
(`{ program, userId }`) or `POST /api/admin/finance-contact` (`{ userId }`), all three ADMIN-only
and all three rejecting a target whose account role doesn't match the row (PROFESSOR for the two
chair rows, ADMIN for the finance row). `AppContext.adminSetDepartmentChair(userId | null)` /
`adminSetProgramChair(program, userId | null)` / `adminSetFinanceContact(userId | null)` wrap these
and refresh the user list.

On the admin submission-edit form (`src/app/dashboard/admin/[id]/page.tsx`, edit mode), "ประธาน
หลักสูตร" is **not** a free `<select>` — it's a read-only value auto-resolved from whichever
professor chairs the edit draft's currently-selected "หลักสูตร" field, recomputed live as that field
changes. An admin can no longer set an arbitrary professor as one submission's program chair from
this form; to change it they reassign the program-level chair via "ตั้งค่าระบบ" instead. Saving the
edit writes that resolved id (or `null` if the program has no chair assigned) as `programChairId`.

### Committee accounts must pre-exist — and can no longer be named before they do (2026-09-15)
Every person in `people[]` must already have an account, and **the student can no longer name one
that doesn't**: `CommitteePeopleEditor` offers existing accounts only, and the single way a new
committee account comes into being is a STUDENT's EXTERNAL-account request (see "EXTERNAL account
requests" below), which an ADMIN approves. A student cannot request a `PROFESSOR` account —
internal faculty accounts are created by an ADMIN out of band.

Validation/resolution lives in `src/lib/committee.ts` (`validatePeople` for shape/role-count
checks, `resolvePeople` for the account lookup — it never creates a user). An email that doesn't
resolve now means one thing only: the account was **deleted between page load and submit**. That is
reported as a plain 400 naming the emails.

**The `pendingPeople` DRAFT flavor is gone** (removed 2026-09-15). A submission naming a
committee person with no account used to be saved as `status: "DRAFT"` with the raw entries in a
`pendingPeople` JSON column and no workflow steps, all admins notified; an ADMIN then created the
account from an amber card at the top of `AdminUsersPanel`, or from a standalone
`/dashboard/admin/pending-professors` page, and the student finalized it with
`action: "continue_draft"`. All of it — the column, the action, `AppContext.continueDraft`, the
amber cards, the `/admin-dashboard` count card, the standalone page, and the
notify-students-whose-draft-is-unblocked pass in `POST /api/users` — was removed once a student
could no longer produce that state. Two defects died with it: the account-creation modal defaulted
every such person to `PROFESSOR` even when they were named as กรรมการภายนอก, and `continue_draft`
resolved and finalized a committee **without re-checking account types**, so a submission could
reach `IN_PROGRESS` violating the degree rule (see "Committee composition by degree" below).

**`DRAFT` now has exactly one meaning**: a submission the student is still filling in — a blank
PROPOSAL (`POST /api/submissions/auto-draft-proposal`) or a defense imported from a completed
proposal (`POST /api/submissions/auto-draft-defense`). Both route to their editable review
component (`ProposalDraftReview` / `DefenseDraftReview`), never to a "waiting for accounts" banner.
`isAutoDraftProposal`/`isAutoDraftDefense` in `student-dashboard/page.tsx` are now just
`status === "DRAFT"`, kept as named predicates for readability.

### Re-opening a draft heals an unusable committee member (2026-09-15)
A draft can sit for weeks, so a committee member stored on it may stop being usable — the account
was deleted (committee id columns are not FKs, so the id simply dangles), or the หลักสูตร was
switched and the account no longer satisfies the degree rule. On re-open, `buildPeopleFromSubmission`
(`src/components/SubmissionForms.tsx`) **clears that account off its row** and marks the row
`invalid: "MISSING" | "SCOPE"` (`Person.invalid`). The row keeps its role, shows an empty picker
and a red explanation, and the student re-picks or deletes it.

The same thing can happen **without** re-opening: switching the หลักสูตร mid-edit can make an
already-picked row illegal (moving to PHD outlaws an internal ประธานกรรมการสอบ). That case is
*derived*, not stored — `rowInvalidReason(person, program, users)` returns the row's stored
`invalid` marker if it has one, else re-checks the live program — so it tracks the selector with no
effect writing back into state. The account is still on the row there, so the picker keeps it
listed marked "(ไม่ตรงตามเงื่อนไข)" rather than going blank with no clue who must be replaced.

While any row is marked, **both buttons refuse** — `validateNoInvalidRows(people, program, users)` is called by the draft
components' strict `validate()` *and* their lenient `validateForSave()`. This is a deliberate
exception to "a plain save is allowed to be incomplete" (see "Draft save vs. confirm validation"
below): an unusable member is a mistake, not an omission, and it used to be **dropped silently on
save**, shrinking the committee without telling anyone. Editing a row's role or account clears the
marker.

Server-side the same rule is enforced by `validateCommitteeAccountRoles(people, program,
{ requireAccount: true })` on both `save_proposal_draft` and `save_defense_draft`'s `confirm: false`
branches — a filled-in row whose account has vanished, or no longer fits the degree, is a 400
rather than a silent drop by `resolvePeoplePartial`. Rows with no role or no account picked yet are
still skipped, so a genuinely incomplete draft still saves.

**Guard**: `buildPeopleFromSubmission` marks nothing while `users` is still empty (the app's first
fetch hasn't landed) — an empty account list is indistinguishable from "every account was deleted",
and flagging there would block saving a perfectly good draft for the length of the fetch.

### Cancellation — student requests, ADMIN accepts or declines
`action: "request_cancel"` (student-only) no longer cancels immediately — it sets
`cancelRequested: true` + `cancelRequestedAt` and notifies all admins. The submission's own
`status` is untouched. **A `COMPLETED` (or `CANCELLED`) submission can't be cancelled** (2026-09-29)
— `request_cancel` refuses it, `accept_cancel` refuses it too as a backstop, and
`StudentSubmissionActions` no longer shows the cancel button once a submission is complete. While a
request is pending, **every other action is frozen**: a top-level
guard in `PATCH /api/submissions/[id]` rejects anything except `accept_cancel`/`decline_cancel`,
and both `POST /api/upload` and `POST /api/submissions/[id]/sign` reject too.

- `action: "accept_cancel"` (ADMIN-only) does the actual cancellation — skips remaining PENDING
  steps, sets `status: "CANCELLED"`, clears the request flag, notifies the student — and cascades
  to a linked in-flight defense exactly like the old direct-cancel behavior (a defense that's
  already `COMPLETED` or `CANCELLED` is left alone).
- `action: "decline_cancel"` (ADMIN-only) just clears the flag and notifies the student; the
  submission continues exactly as before the request.

Surfaced in the UI: a `cancel_request` task type at the top of the ADMIN dashboard's "งานที่ต้อง
ดำเนินการ" box; an accept/decline banner on the admin detail page and on the shared
`RoleSubmissionDetail` (every faculty-role view); a "รออนุมัติยกเลิก" pending banner (student) that
replaces the old immediate "ยกเลิกแล้ว".

### Proposal steps 1–2 — student uploads one บ.วศ.1 file, ADMIN generates the finance form (2026-09-29)
บ.วศ.1ก–ง are physically **one document**, so PROPOSAL step 1 takes exactly **one** upload box:
`B1` (the combined file, **PDF only**; the blank form is on the department site,
https://me.eng.chula.ac.th/download/, which the upload box links to — the app serves no copy). The
system can't inspect the PDF, so `StudentSubmissionActions` shows a required checklist before
ส่งต่อ unlocks: บ.วศ.1ก filled, บ.วศ.1ข filled, and 3 signatures — student in 1ก, student in 1ข,
advisor in 1ก (`B1_CHECKS` in `src/lib/utils.ts`, rendered by the shared `B1Checklist` component).
At step 2 the ADMIN must tick the same 5 items plus one committee check (`ADMIN_B1_EXTRA_CHECKS`)
before อนุมัติ unlocks, and at step 3 the PROGRAM_CHAIR ticks one box, their own บ.วศ.1ก signature
(`CHAIR_B1_CHECKS`, via `SignatureButton`'s `checklist` prop, which also shows a note that
ส่งต่อ emails the finance form) — client-side attestations, like the student's. Step 3 still
downloads the latest `B1`, and the chair uploads the signed copy as a new `B1` version (PDF only). The student screen offers no optional early-upload boxes for later
steps' forms. `B1A`/`B1B` stay in the `FormType` enum only so older uploads still display.

The PROPOSAL's `FINANCE_ATTACH` (เอกสารการเงินแนบกรรมการสอบ) is **no longer a student upload** —
ADMIN generates it at step 2 with the "สร้างเอกสารการเงินแนบกรรมการสอบ" card in
`AdminSubmissionPanel` → `POST /api/submissions/[id]/finance-attach` (ADMIN-only, PROPOSAL-only,
only while step 2 is current). `src/lib/financeDoc.ts` fills
`templates/finance-attach-proposal.docx` — an unmodified copy of the department's form, shipped with
the route via `outputFileTracingIncludes` in `next.config.ts` — with the student name, student code,
สาขาวิชา (rewritten only for ME_CPS, at 11pt so it fits) and one committee row per member in the
form's order (head → advisor → co-advisors → externals → exam committee), numbered 1..n; a role with
nobody in it gets no row. วันที่, หน่วยกิต, ลงนาม, รวมเงิน and จ่ายเช็คในนามของ are deliberately left
blank. The generated file appears in the card's upload box: the ADMIN can download it, edit it in
Word, and upload the edited copy ("เปลี่ยนไฟล์"). Only the ADMIN, only at step 2, may upload the
PROPOSAL's `FINANCE_ATTACH` (`POST /api/upload` rejects anyone else). It is **single-version**:
every new copy — generated or uploaded — deletes the previous row + storage object
(`keepOnlyLatestVersion`, `src/lib/uploadVersions.ts`), so there is no ประวัติ for it. Picking a
replacement compares its body text with the current file (`docxText`, `src/lib/docxText.ts` — text,
not bytes, since Word rewrites the package on every save) and shows a warning when they differ,
because the current file will not be kept. Step 2's approve is gated on the file server-side
(`REQUIRED_UPLOADS.PROPOSAL[2]`) and client-side on the file plus all 6 checks. **Approving step 2
is what sends the finance email** (with the current FINANCE_ATTACH attached) — the admin's approve
card says so; nothing from step 3 on involves finance (moved from the step-3 PROGRAM_CHAIR approval
2026-09-29). If the
department replaces the form, swap the template and re-check `financeDoc.ts`'s anchors (they throw
when not found).

`FINANCE_ATTACH` is **.docx only** wherever it's uploaded — for both types it is now the ADMIN's
step-2 file (generated, optionally edited and re-uploaded; the student never sees it). The format rule is `formFileKind()` in `src/lib/utils.ts`, used by both
`FileUploader` pickers and by `POST /api/upload`, which checks magic bytes (PDF `%PDF`; DOCX = ZIP
containing `word/document.xml` + a `.docx` name). Every other form type keeps the legacy
PDF/JPEG/PNG rule.

**Step 4 uses the same combined file.** The student downloads the latest `B1` (the chair-signed
copy from step 3), fills บ.วศ.1ค + 1ง, and re-uploads it as a new `B1` version. The checklist is
`B1_STEP4_CHECKS`: the program chair's บ.วศ.1ก signature is in the file (contact the admin if not);
1ค filled + committee names filled with signature areas blank + all dates blank; 1ง filled +
committee names filled + the thesis topic matches the committee's comments (it is sent to the
Faculty and registered in Chula's official system as written) + all dates blank; and everything confirmed with the main advisor and in
line with the committee's comments at the proposal exam meeting. Because a `B1` already exists, step 4 only counts a copy
uploaded **after step 3 was approved** — `freshUploadCutoff()` (`src/lib/utils.ts`) is the one rule,
used by the approve gate and the student's
upload box/checklist. Steps 5–11 download and sign that same `B1` (`STEP_SIGN_FORMS`). `B1C`/`B1D`
stay in the enum for display of older uploads only.

**The student never sees the PROPOSAL's finance documents** (`FINANCE_ATTACH`, and any legacy `FINANCE_DOC`) —
`isHiddenFromStudent()` (`src/lib/utils.ts`) drops them from every submission payload sent to the
submission's own student (`mapSub` in `api/submissions/route.ts` and `api/submissions/[id]/route.ts`)
and `GET /api/upload/[uploadId]/signed-url` refuses them to that student. Step 4's student screen no
longer shows the admin's finance row/status; the wait after submitting just reads
"รอเจ้าหน้าที่ดำเนินการ". THESIS_DEFENSE is unaffected (its student uploads FINANCE_ATTACH).

### Step display numbering — sub-steps 5.1–5.x (2026-09-29)
Internal `stepOrder` never changes (1–11 PROPOSAL / 1–22 THESIS_DEFENSE — every gate, email,
`STEP_SIGN_FORMS` entry and DB row keys off it). **What users see** comes from `stepNumbering()`
(`src/lib/stepNumbering.ts`): a PROPOSAL's committee-signing run, stepOrder 5–9 (head → advisor →
co-advisors → external → exam committee), is shown as one step with sub-steps **5.1–5.x** — dense,
since SKIPPED steps are hidden and never numbered — so the admin check (stepOrder 10) reads as
**step 6**, the program chair's final signature (stepOrder 11) as **step 7**, and the admin's
final recheck + Faculty cover page (stepOrder 12) as **step 8**. The "X/Y ขั้น"
progress counts and bars count top-level steps (a sub-step group counts once, when all of it is
approved). Used by `WorkflowTimeline`, `AdminSubmissionPanel` (step cards, status, progress),
`RoleSubmissionDetail`, `StudentSubmissionActions`, `/admin-dashboard`, `/student-dashboard`,
`UserDetailPanel`, and the admin-override notification text. Never compute a displayed step
number from a step's index — call `stepNumbering(...).label(stepOrder)`. THESIS_DEFENSE has one
group: the committee's ใบรายงานผลการสอบ signatures after the advisor (stepOrder 8–11: co-advisors → head →
exam committee → external) read as **8.1–8.x**, so the student's บ.4 + thesis upload
(stepOrder 15) reads as **step 12** and the student's iThesis confirmation (stepOrder 20, the last
step) as **step 17** — 17 top-level steps with or without a co-advisor (the co-advisor sits inside 8.x).

Each 5.x signer ends with a one-box checklist, "ท่านลงนามใน บ.วศ.1ค แล้ว (1 ตำแหน่ง)" — every committee
member signs exactly one place, on บ.วศ.1ค (`PROPOSAL_SIGN_CHECKS` in `src/lib/utils.ts`, which also
holds step 3's chair check). `SignatureButton` and `CommitteeSignPanel` both take the `checklist`
prop, so single- and multi-member steps behave the same.

### Step 1 is NOT auto-approved
When a submission is created, **step 1 starts as PENDING**. The student must upload the required documents and click submit. Step 2's email notification fires automatically when the student's submit action (approve) completes.

### Rejection stays on the step — student must resubmit
`PATCH action "reject"` and `POST /sign decision "REJECTED"`: the current PENDING step is marked `REJECTED` and the submission status becomes `REJECTED`. The workflow does NOT move. While `REJECTED`, both `approve` and a second `reject` return 400 ("รอนักศึกษายืนยันการแก้ไขก่อน"). The student fixes documents and calls `action "resubmit"` (student-only) — this resets **only the rejected step** to PENDING (clears actedAt/notes/committeeActions), sets status `IN_PROGRESS`, and the same reviewer re-reviews from the same step. Any involved role can reject **except on an ADMIN step** — those offer only อนุมัติ + ส่งกลับ (see "Admin steps: approve or send back, never reject" below); an ADMIN rejecting any other step must give a notes comment (API).

### Send-back (ส่งกลับ) goes back ONE step — admin only
`PATCH action "return_to_prev"` (ADMIN only — SUPER_ADMIN has no submission access): resets **both the current PENDING step and the nearest preceding non-SKIPPED step** to `PENDING` (clear actedAt/notes/committeeActions), status stays `IN_PROGRESS`, and the previous role is notified to act again (when that role is the STUDENT, they get exactly one bell notification — the extra "student always hears about it" notification is skipped there so it isn't doubled). The reason is optional and reaches the bell notifications only, not the email. Returns 400 on the first step. The previous step is `previousActiveStep()` (`src/lib/workflowSteps.ts`) — the one rule shared by the API and the admin UI.

### Admin steps: approve or send back, never reject (2026-10-01)
Every ADMIN step's action card in `AdminSubmissionPanel` has exactly two actions — **อนุมัติ** and
**ส่งกลับ** — and `PATCH action "reject"` on a step whose role is `ADMIN` returns 400
("ขั้นตอนนี้ใช้การส่งกลับแทนการปฏิเสธ"). Reason: where the previous step is the student's own
(PROPOSAL step 2, THESIS_DEFENSE step 2), ปฏิเสธ and ส่งกลับ both just handed it back to the
student, and at the other admin steps ส่งกลับ is the one the admin needs. Consequence: at an
admin step whose previous step is a signer (e.g. PROPOSAL step 6 → the last 5.x signer), the
admin can't hand a problem straight to the student — it goes back one step at a time, or the
admin reopens an earlier step with the override card's "ส่งกลับมาขั้นนี้". When the previous step
is the student's, the send-back form reads "ส่งกลับ — นิสิตต้องแก้ไขและส่งต่อใหม่".

The per-step **override card** ("จัดการ" on each step in "จัดการแต่ละขั้นตอน") follows the same
rule — อนุมัติ + ส่งกลับ, no ปฏิเสธ, on every step, whoever owns it:

| Step state | อนุมัติ | ส่งกลับ |
|---|---|---|
| APPROVED | — | "ส่งกลับมาขั้นนี้": `admin_override_step` `REJECTED` — resets this step and everything after it to PENDING |
| Current PENDING | `admin_override_step` `APPROVED` (this step and every earlier one) | `return_to_prev` — back one step; hidden on the first step |
| Future PENDING | same as above | — |
| REJECTED (awaiting resubmit) | same as above | — (it waits on the student) |

Non-admin reviewers (professors/committee) keep ปฏิเสธ on their own signing steps.

**Critical**: the sent-back current step must be reset to `PENDING`, never `REJECTED` — the approve flow only advances through PENDING steps, so a step left `REJECTED` here gets skipped forever once the previous role re-approves (bug found and fixed 2026-07-14 via E2E test).

### Reject button (ปฏิเสธ)
The reject button is embedded directly inside `SignatureButton` and `CommitteeSignPanel` — **no separate send-back panel exists**. Clicking ปฏิเสธ calls `action: "reject"`, which marks the current step `REJECTED` — it stays on that same step, it does NOT move backward (see "Rejection stays on the step" above; that is what ส่งกลับ/`return_to_prev` does, and it's admin-only). The ADMIN's own action card has no ปฏิเสธ at all — see "Admin steps: approve or send back, never reject" above. There is no standalone "ส่งกลับขั้นตอนก่อนหน้า" panel (it was removed as redundant) — ส่งกลับ is reached via the admin-only `return_to_prev` action instead.

### Document versioning — one slot per formType (ALL types)
**Every** form type — including SIGNED — has a single display slot in `FileList`: latest upload is the current version, older uploads collapse under "ประวัติ". No formType is shown as individual files anymore. **`SIGNED` always means แบบรายงานการเสนอผลงานฯ** (the student report chain of THESIS_DEFENSE: the student uploads it at step 6, the advisor signs it at step 7); the other faculty-return docs have their own types (EXAM_RESULT, INVITE_LETTER, VERY_GOOD_EVAL, FINANCE_DOC). **Non-student roles upload with the correct `formType`** so their signed copy replaces the slot's latest version.

### Upload formType for signing roles
`SignatureButton` and `CommitteeSignPanel` both accept `formsToShow?: string[]`. When `formsToShow` contains non-SIGNED form types, the upload is saved with that formType (versioning the correct slot). Falls back to `"SIGNED"` only when `formsToShow` is empty or contains only `"SIGNED"`.

### Download filtering — STEP_SIGN_FORMS
`RoleSubmissionDetail` computes `formsToShow` from `STEP_SIGN_FORMS` so each role sees only the documents relevant to their step. Passed to both `SignatureButton` and `CommitteeSignPanel`.

```
PROPOSAL:       3→[B1]  5→[B1]  6→[B1]  7→[B1]  8→[B1]  9→[B1]  11→[B1]   (all sign parts of the one combined file)
                (steps 2, 10 are ADMIN approve-only — no signing, not in this map)
THESIS_DEFENSE: 3→[B2]   (บ.2 and บ.3 are signed outside the system, uploaded at step 1)
                (steps 2, 4, 5 are ADMIN steps — no signing, not in this map)
                7→[SIGNED,EXAM_RESULT]  8→[EXAM_RESULT]  9→[EXAM_RESULT]  10→[EXAM_RESULT]  11→[EXAM_RESULT]
                13→[EXAM_RESULT] (DEPARTMENT_CHAIR)   (steps 12, 14 are ADMIN steps — no signing)
                17→[B4, THESIS] (DEPARTMENT_CHAIR)   (steps 16, 18, 19 are ADMIN steps)
                (the thesis is uploaded at step 15 already signed by the whole committee —
                no in-system cover-signing steps since 2026-10-01)
                Who signs what: ใบรายงานผลการสอบ (EXAM_RESULT) = advisor, co-advisors, head, exam committee,
                external, then the department chair — never the student or the program chair;
                แบบรายงานการเสนอผลงานฯ (SIGNED) = the student (step 6) and the advisor (step 7) only.
```

### Admin dashboard (`src/app/admin-dashboard/page.tsx`) — ADMIN's landing page
`/dashboard/admin` (old path) now just redirects here. `src/app/dashboard/admin/[id]/page.tsx`
(submission detail) still lives under the
old `/dashboard/admin/` path; only the exact-match overview page moved.

**No `DashboardHeader`** (removed 2026-09-06) — the page starts directly with its content; the
stats it used to show are already duplicated elsewhere on the page (see below), so nothing was
added back in its place.

**Three full-width tabs** (added 2026-09-06 as two, a third "ตั้งค่าระบบ" split out 2026-09-07;
`useState<"submissions" | "users" | "settings">`, `grid grid-cols-3 gap-2` so the buttons split the
width equally), rendered inside one shared frame
(`bg-white rounded-2xl border border-gray-200 p-4 sm:p-6 max-h-[75vh] overflow-y-auto` — the
`max-h`+`overflow-y-auto` keeps a long list's scrollbar contained inside the frame instead of on
the outer page, which used to shift the whole layout when the browser's own scrollbar appeared):

1. **จัดการคำร้อง (submissions)** — default tab, everything the page used to show top-to-bottom:
   - **"งานที่ต้องดำเนินการ"** orange task box — cancellation requests (`cancel_request` type)
     always sort first, then PENDING-on-ADMIN steps;
     each card links directly to the submission
   - **Type filter pills** (ทุกประเภท/โครงร่าง/สอบวิทยานิพนธ์), **search bar**, **status filter
     tabs** (All/DRAFT/IN_PROGRESS/COMPLETED/REJECTED/CANCELLED, each with a count badge — these
     badges are what replaced the old header's stat pills, so nothing was lost when the header was
     removed)
   - **Submission list** — cards sorted by stuck-days descending; each shows title, student name +
     ID (links to `/dashboard/admin/users/[uid]`), status badge, a red "ขอยกเลิก" pill when
     `cancelRequested`, a "ค้างมา X วัน" badge past 7 days, who it's waiting on + step number,
     progress bar, created date. **No separate "จัดการ"/"ดำเนินการ" link and no list-level delete
     button** (removed 2026-09-07) — the whole card is clickable and toggles a chevron
     (`expandedId` state, one open at a time); clicking expands the full admin action surface
     (`AdminSubmissionPanel`, see below) inline directly under that row. Expanding a card — including
     switching straight from one open card to another — smoothly scrolls it to the top of the list
     frame (`cardRefs` map + `scrollIntoView` on `expandedId` change), so a lower card never opens
     stranded mid-scroll. Deleting a submission is done from inside the expanded panel only (typed
     "ลบ" confirmation), not from the list row. **A PROPOSAL with any THESIS_DEFENSE built from it
     (`sourceProposalId`, any status — COMPLETED/CANCELLED included) cannot be deleted**: `DELETE
     /api/submissions/[id]` returns 409 and the panel's "ลบคำร้อง" card shows the reason instead of
     the button (2026-10-05). Delete the defense first — otherwise its `sourceProposalId` would be
     silently nulled.
2. **จัดการผู้ใช้งาน (users)** — renders `AdminUsersPanel` (`src/components/AdminUsersPanel.tsx`,
   extracted 2026-09-06): pending committee-account requests **at the top of the user list** (see
   "Committee accounts must pre-exist" above), a role-filter pill row + search bar + **"มีคำร้อง
   ที่ยังไม่ถูกยกเลิก" checkbox** (added 2026-09-08 — filters to accounts with at least one related
   submission whose status isn't `CANCELLED`, via `getRelatedSubmissions()`; same "active" meaning
   as the proposal-blocking rule under "Proposal-first" — DRAFT/IN_PROGRESS/REJECTED/COMPLETED all
   count, only CANCELLED doesn't), the full STUDENT/PROFESSOR/ADMIN account list (expand a row for
   `UserDetailPanel`), the add-user modal, and demo reset tools. The same component is reused
   standalone at `/dashboard/admin/users` (now a thin guard+back-link wrapper around it) and its
   `[uid]` detail route, since student names in the submission list still deep-link there directly
   — the old "ผู้ใช้งานในระบบ" link-out card on this page was removed in favor of this tab.
3. **ตั้งค่าระบบ (settings)** — renders `AdminSettingsPanel`
   (`src/components/AdminSettingsPanel.tsx`, extracted 2026-09-07 from what used to be a card
   inside `AdminUsersPanel`, at which point the finance-contact row was added alongside it): 3
   per-program PROFESSOR chair-assignment dropdowns plus one ADMIN finance-contact dropdown — see
   "Program Chair & finance-contact assignment" above. Also rendered standalone below
   `AdminUsersPanel` at `/dashboard/admin/users`.

### Admin-only user rank codes (A001/B002/C003/D004) — drag-to-reorder (2026-09-09)
Every account in the 4 role groups an ADMIN manages gets a display-order code — `A`ADMIN,
`B`PROFESSOR, `C`EXTERNAL, `D`STUDENT, each followed by a dense 3-digit position within that group
(e.g. the 7th-ranked professor is `B007`). Backed by a nullable `User.rankOrder Int?` column
(`prisma/schema.prisma`) and computed by `computeRankCodes()` (`src/lib/utils.ts`): groups users by
primary role (`roles[0]`), sorts each group by `rankOrder` ascending (null last) then `createdAt`
ascending, and assigns the codes from that order. `rankCodeNumber()` (same file) parses the numeric
suffix back out of a code for client-side sorting.

**Visible to ADMIN only — never SUPER_ADMIN, never any other role, never directly editable.**
`GET /api/users` only attaches `rankCode` when the caller's session roles include `ADMIN` and not
`SUPER_ADMIN` (`isAdminCaller` in `src/app/api/users/route.ts`); every other caller's response omits
it entirely. There is no form field or API path that sets `rankOrder` to an arbitrary value — the
only way to change it is a full drag-and-drop reorder of one role group.

**Reordering**: in `AdminUsersPanel`'s "จัดการผู้ใช้งาน" list, dragging is only enabled when exactly
one of the 4 role filter pills is selected (not "ทั้งหมด") **and** the search box and "มีคำร้องที่
ยังไม่ถูกยกเลิก" checkbox are both cleared — only then does the visible list equal that role's exact,
full membership, which a drop can be translated into a valid new order for. When enabled, each row
grows a grip handle (`GripVertical`) plus its current rank code above `UserProfileHeader`, and a
blue hint line explains it; otherwise a gray hint explains what to clear to enable it. Dropping a
row calls `adminReorderUsers(role, orderedIds)` (`AppContext.tsx`) → `POST /api/admin/users/reorder`
(ADMIN-only), which rejects a partial/stale id list (409, someone else added/removed a member
concurrently) and otherwise sets every member's `rankOrder` to its new 1-based position in one
`$transaction`. The rank badge itself (`UserProfileHeader.tsx`, next to the role pill) is gated on
`viewer.roles.includes("ADMIN")`, independent of the reordering UI, so it's visible on every row an
ADMIN looks at (including the standalone `/dashboard/admin/users/[uid]` page) even outside the
single-role-filtered reorder view — only the drag interaction itself requires that filtered view.

### admin_override_step status priority
When admin overrides individual steps via `action: "admin_override_step"`, submission status is computed as: **`hasPending → IN_PROGRESS`** (takes priority), then `hasRejected → REJECTED`, then `COMPLETED`. This ensures overriding a step to REJECTED does not lock the submission if later steps are still PENDING.

### CO_ADVISOR step visibility in UI
SKIPPED CO_ADVISOR steps are **completely hidden** from all step lists — never rendered, remaining steps renumbered sequentially from 1.

Applies to:
- `WorkflowTimeline` (`src/components/WorkflowTimeline.tsx`): filter `steps.filter(s => s.status !== "SKIPPED")` before rendering; use `index + 1` for display number.
- Admin detail step list (`src/app/dashboard/admin/[id]/page.tsx`): filter `sub.workflowSteps.filter(s => s.status !== "SKIPPED")` before mapping `StepCard`; pass `displayOrder={i + 1}` prop.

### File download vs preview
The bucket is private, so both paths first resolve a signed URL via `GET /api/upload/[uploadId]/signed-url`, then differ:

| Context | Function | Behavior |
|---|---|---|
| "ดาวน์โหลดเอกสารเพื่อลงนาม" in `SignatureButton` / `CommitteeSignPanel` | `downloadFile()` | signed URL → `fetch()` → blob URL → `<a download>` — forces real download even for cross-origin Supabase URLs |
| All other file clicks (`FileList`, admin StepCard) | `previewFile()` | signed URL → `window.open(url, "_blank")` — opens in new tab for preview |

Both helpers are in `src/lib/utils.ts`, both take the upload's `id` as their first argument (not a raw URL). Cross-origin `<a download>` is silently ignored by browsers — that is why `downloadFile` uses fetch→blob instead of a plain link.

### Admin detail — hide files on future steps
In the admin "จัดการแต่ละขั้นตอน" tab (`src/app/dashboard/admin/[id]/page.tsx`), steps that are still PENDING and have not been reached yet receive an empty `stepUploads` array so no files are shown prematurely.

```typescript
const isFutureStep = step.status === "PENDING" && step.stepOrder !== currentOrd;
stepUploads={isFutureStep ? [] : stepUploads}
```

`currentOrd` is the `stepOrder` of the currently active PENDING step (lowest PENDING stepOrder).

---

## Conventions
- Reuse role colors via `ROLE_GRADIENT` / `ROLE_EMOJI` / `ROLE_LABELS` in `lib/utils.ts`.
- Run `npm run build` before committing non-trivial changes.
- No `STEP_NAMES` direct usage anywhere — always `getStepName(stepOrder, submissionType)`.
- Prisma singleton: `src/lib/prisma.ts` uses `globalForPrisma.prisma ?? createClient()` then always sets `globalForPrisma.prisma = prisma`. Never add a `NODE_ENV !== "production"` guard — that was the bug that caused connection exhaustion on Vercel. The pg pool is capped at `max: 3` with a 30s idle timeout — do not raise it; parallel Vercel instances share the Supabase pooler's global client limit.

---

## Roles in the system

### In-system roles (have accounts and login)
| Role | Thai | Key Actions |
|---|---|---|
| Super Admin | ผู้ดูแลระบบสูงสุด | Landing page `/super-dashboard`. Account/user management restricted to the **SUPER_ADMIN/ADMIN tier only** — create/edit/delete SUPER_ADMIN or ADMIN accounts, reset their passcodes. **Cannot** touch STUDENT/PROFESSOR accounts (that's ADMIN's job) and has **zero submission workflow access** — cannot approve, reject, override, upload to, or otherwise act on any submission. As of 2026-09-06 it CAN view (read-only oversight, not act on) a full directory of every account including STUDENT/PROFESSOR/EXTERNAL via `GET /api/super-admin/users`, and a full list of every submission via `GET /api/super-admin/submissions` (no detail-page link, no actions); the older counts-only `GET /api/super-admin/stats` was removed as redundant once these two list endpoints shipped |
| Admin | เจ้าหน้าที่ภาควิชา (พี่โบ้) | Landing page `/admin-dashboard`. Owns the entire submission workflow exclusively — approve/reject/override steps, relay documents to Faculty, forward docs to Student, approve/reject STUDENT requests for a new EXTERNAL committee account, accept/decline student cancellation requests. Account management covers **ADMIN/PROFESSOR/STUDENT** (shares the ADMIN tier with SUPER_ADMIN, but not SUPER_ADMIN accounts) via `/dashboard/admin/users` |
| Student | นิสิต | Landing page `/student-dashboard`. Starts with a PROPOSAL (only one active at a time — cancel to start over); creates a THESIS_DEFENSE by importing/editing the committee from a COMPLETED proposal. Upload documents, assign committee members (must already have accounts, else the submission is a DRAFT pending admin approval), request cancellation (ADMIN must accept), track status |
| Advisor | อาจารย์ที่ปรึกษา | Sign forms, monitor assigned students — always an internal `PROFESSOR` account, both degrees |
| Co-Advisor | อาจารย์ที่ปรึกษาร่วม | Signs immediately after Advisor at every Advisor step — **optional**, step auto-SKIPPED when no co-advisors assigned; multiple allowed (sequential like EXAM_COMMITTEE); may be an internal `PROFESSOR` or an `EXTERNAL` account, both degrees |
| Department Head | หัวหน้าภาควิชา | Signs the defense's ใบรายงานผลการสอบ after the committee and the ADMIN's check (THESIS_DEFENSE stepOrder 13, shown 10), and later บ.4 + the thesis (stepOrder 17, shown 14) — role `DEPARTMENT_CHAIR` — the one PROFESSOR an ADMIN designates in "ตั้งค่าระบบ" (`SystemSetting` key `departmentChair`); sees every defense |
| Program Chair | ประธานหลักสูตร | Sign at multiple phases — **assigned per submission by Student** (`submissions.programChairId`); falls back to whichever PROFESSOR an ADMIN has designated ประธานหลักสูตร **for that submission's program** (`SystemSetting` key `programChair:<program>` — a professor may chair more than one program, see "Program Chair & finance-contact assignment" below) |
| Head Exam Committee | ประธานกรรมการสอบ | Signs before regular committee — assigned per submission by Student. **Account type is degree-dependent**: `PROFESSOR` or `EXTERNAL` for a master's submission, `EXTERNAL` only for a doctoral one (see "Committee composition by degree" below) |
| Exam Committee | กรรมการสอบ | Multiple members, sign separately in order — assigned per submission by Student; internal `PROFESSOR` accounts only, both degrees (an external examiner belongs in กรรมการภายนอก or อาจารย์ที่ปรึกษาร่วม instead) |
| Invited Exam Committee | กรรมการภายนอก | External examiner(s) — one or more, sign separately in order (sequential like EXAM_COMMITTEE); assigned per submission by Student, selected from existing `EXTERNAL`-role accounts only (see "Committee people" below, "Multiple external committee members" further down, and "EXTERNAL account requests" further down) |

### External roles (no login)
| Role | How they interact |
|---|---|
| Faculty Dean | Signs บ.4 physically offline |
| Finance | Receives email when the ADMIN approves the finance step — step 2 of both types (`financeStepOf`) — with FINANCE_ATTACH attached |
| Graduate School | Receives final document package outside the system |

---

## Submission fields — student enters everything manually

**Account creation:** there is no self-registration (see "Account creation & passcodes" above) — an ADMIN creates the STUDENT account via `POST /api/users`, providing รหัสนิสิต (unique, stored on `users.studentId`; professors don't have one). Email format is validated via `isValidEmail()` (`lib/utils.ts`); duplicate email/studentId → 409 (incl. the concurrent-create race via P2002 catch). The endpoint returns `emailSent` from the welcome email send. Submit form prefills ชื่อ/รหัสนิสิต/อีเมล from the account.

**Student info:** ชื่อ-นามสกุล, รหัสนิสิต, หลักสูตร (PHD=วิศวกรรมศาสตรดุษฎีบัณฑิต สาขาวิชาวิศวกรรมเครื่องกล / ME_MECH=วิศวกรรมศาสตรมหาบัณฑิต สาขาวิชาวิศวกรรมเครื่องกล / ME_CPS=วิศวกรรมศาสตรมหาบัณฑิต สาขาวิชาระบบกายภาพที่เชื่อมประสานด้วยเครือข่ายไซเบอร์), อีเมล์, เบอร์โทร

**Committee people (`data.people[]`, 2026-09-07 — selected from accounts, not typed; row layout
reworked 2026-09-08):** `CommitteePeopleEditor` (`src/components/SubmissionForms.tsx`, shared by
`ProposalForm`, `DefenseForm`, `ProposalDraftReview` and `DefenseDraftReview`) renders each row as
a role `<select>` plus an account `<select>` — never free-text name/email entry, and neither
select carries a visible label any more (role/account picker labels are `aria-label` only,
selection is conveyed by the placeholder option text). **Which account list each role picks
from is degree-dependent** (2026-09-15, replacing the earlier fixed `EXTERNAL_ONLY_ROLES`/
`MIXED_ROLES` sets) — see "Committee composition by degree" below. The single source of truth
is `committeeRoleScope(role, degree)` in `src/lib/utils.ts`, used by `CommitteePeopleEditor`,
the admin submission-edit form (which uses that same `CommitteePeopleEditor`), the client validator and the server validator alike,
so the dropdown a student sees and the rule the API enforces can never drift apart. Each row
shows a small "เลือกจาก: …" hint naming the account type that role accepts, and a row still
holding an account that no longer fits (a committee imported from a proposal, or a หลักสูตร
switched after the pick) keeps that account visible in the picker marked "(ไม่ตรงตามเงื่อนไข)"
with a red hint, rather than silently blanking. Picking an account fills `{name, email, phone}` from it, but the row no longer displays
either — only the role/account selects are shown; email and phone are still carried internally
(and still submitted) so `resolvePeople`'s email-lookup and the optional phone-override still
work, they're just not rendered. `initialPeople()` seeds a fresh editor (a new `ProposalForm`/
`ProposalDraftReview`) with 4 default rows — ADVISOR, HEAD_EXAM_COMMITTEE, EXAM_COMMITTEE,
INVITED_EXAM_COMMITTEE (CO_ADVISOR is optional so it isn't a default row; add one via
"เพิ่มบุคคล"). Each row has a leftmost numbered drag handle (`GripVertical`, native HTML5
drag-and-drop) so the student can reorder the list — this isn't just display order: the array
order is exactly what's submitted as `committeeIds`/`coAdvisorIds`/`invitedCommitteeIds`, which is
the real sequential sign order for roles with multiple members (see "Sequential only" further below
and "Multiple external committee members" above). The submitted
shape is still `{name, email, role, phone?}[]`, identical to before, so server-side resolution
(`src/lib/committee.ts`'s `resolvePeople`, email lookup only, never creates an account) is
unchanged — since every option in the dropdown is already a real account, an unresolved email is
now only a theoretical race (account deleted between page load and submit), but the
submit is reported as a plain 400 (see "Committee accounts must pre-exist" above). **PROGRAM_CHAIR is
never a row in this editor at all** — the student's own account-level `Role` for creating a
submission has nothing to do with it; instead `resolveProgramChair()`/`ProgramChairAutoField`
auto-resolve and display (read-only) whichever `PROFESSOR`'s `programChairFor` array includes the
selected/inherited program, and the chair is injected into the submitted `people[]` right before
validation — same fallback mechanism as "Program Chair assignment" below, just applied at
creation time instead of only in the admin edit form. Submitting is blocked client-side with a
Thai error if no chair is assigned for that program yet. For a THESIS_DEFENSE this list is
prefilled from the source proposal's committee (`buildPeopleFromSubmission`, which also excludes
PROGRAM_CHAIR) but remains fully editable (see "Proposal-first" above). **One person, one
committee role** (2026-09-29): apart from the ประธานหลักสูตร, who may also sit in any other
position, an account may appear only once in a submission's committee — see "One person, one
committee role" below.

**EXTERNAL account requests (2026-09-07, `title` field added 2026-09-08):** a STUDENT who can't
find the external examiner they need in the INVITED_EXAM_COMMITTEE dropdown submits a request via
the "กรรมการภายนอก" tab on `/student-dashboard` (`StudentExternalRequests.tsx`) —
`{title?, name, email, affiliation?, phone?}`, independent of any specific submission, saved as an
`ExternalCommitteeRequest` row (`status: PENDING`). `title` is a "คำนำหน้าชื่อ" `<select>`
(`NAME_TITLES`, same as every other account form) next to the name field — the request no longer
relies on the student typing a Thai honorific prefix into free-text `name` the way it briefly did;
`ExternalCommitteeRequest.title` (nullable `NameTitle`) stores it separately, same shape as
`User.title` (see "Name title" above). ADMIN reviews every pending request as a card at the top of
`AdminUsersPanel`'s user list (same visual pattern as the missing-committee-account cards) with two
actions: **อนุมัติ** opens the same "เพิ่มผู้ใช้งาน" modal used for any new account, prefilled
(email/role locked, `title`/`name` prefilled directly from the request's own columns — no parsing
needed since they're already split, affiliation/phone editable) — submitting it calls the same
`POST /api/users` every account is created through (see "Account creation & passcodes" above),
passing `externalRequestId` so the route also marks the request `APPROVED`, links
`createdUserId`, and notifies the requesting student; **ปฏิเสธ** (`PATCH
/api/external-requests/[id]`, ADMIN-only) sets `status: REJECTED` with an optional reason and
notifies the student. `GET /api/external-requests` scopes by caller — STUDENT sees only their own
requests, ADMIN sees every request. `User.affiliation`/`User.phone` (both nullable, meaningful
mainly for EXTERNAL accounts) were added for this. `Notification.submissionId` is nullable to
support these submission-independent notifications — `NotificationBell` already falls back to the
recipient's landing page when it's null.

**EXTERNAL accounts were invisible in two places — fixed 2026-09-08.** (1) `GET /api/users`'s
ADMIN branch scoped its `where` to `{ roles: { hasSome: ["ADMIN", "PROFESSOR", "STUDENT"] } }` —
missing `"EXTERNAL"` entirely, so an approved external examiner never appeared anywhere that reads
from `useApp().users` while logged in as ADMIN (`AdminUsersPanel`'s user list included), even
though the account existed correctly in the DB (a fresh approval briefly appeared via the client's
own optimistic `setUsers` append, then vanished again on the next 20s poll once the filtered GET
response overwrote it). Fixed by adding `"EXTERNAL"` to that `hasSome` array — the non-admin branch
already used `FACULTY_ROLES = ["PROFESSOR", "EXTERNAL"]` correctly and needed no change. (2)
`AdminSubmissionPanel.tsx`'s submission-edit form (`src/app/dashboard/admin/[id]` → "จัดการคำร้อง"
→ expand a row → edit) has its own separate, plain `<select>`-based committee editor (not
`CommitteePeopleEditor`) that built every dropdown — including "กรรมการภายนอก ในระบบ (เลือก)",
which should only ever offer `EXTERNAL` accounts — from a single `advisors` list filtered to
`PROFESSOR` only. Added a matching `externals` list and a `mixedCommittee` (`[...advisors,
...externals]`) list: อาจารย์ที่ปรึกษาร่วม (CO_ADVISOR) and กรรมการสอบ (EXAM_COMMITTEE) now list
both PROFESSOR and EXTERNAL accounts, กรรมการภายนอก ในระบบ now lists EXTERNAL accounts only
(previously PROFESSOR-only, so an admin could never actually select an external examiner there
at all), and อาจารย์ที่ปรึกษา/ประธานกรรมการสอบ stay PROFESSOR-only same as before. **Superseded
2026-09-15** — which list each role offers is now degree-dependent (กรรมการสอบ went back to
PROFESSOR-only, ประธานกรรมการสอบ became degree-dependent); see "Committee composition by degree"
below. Only the `GET /api/users` half of this bullet is still current as written.

**Validation (enforced in form AND API):** ADVISOR exactly 1 · PROGRAM_CHAIR exactly 1 (auto-injected, never a user-facing row — see "Committee people" above) · HEAD_EXAM_COMMITTEE exactly 1 · EXAM_COMMITTEE ≥1 · INVITED_EXAM_COMMITTEE ≥1 (multiple external committee members allowed — see "Multiple external committee members" below) · CO_ADVISOR 0+. These counts are the same for both degrees; **which account type may fill each role is not** — see "Committee composition by degree" below. Every person's email must pass `isValidEmail()` (a typo'd email would create an account whose passcode email goes nowhere); a person's email may not equal the student's own email; the same account may not fill two committee positions, same role or different (PROGRAM_CHAIR excepted — see below). The form shows a live checklist chip per required role (excluding PROGRAM_CHAIR, which has its own read-only auto-resolved display instead). วันที่สอบ + เวลาสอบ required; title-confirmation checkbox before submit.

### One person, one committee role (2026-09-29)
A committee member holds **exactly one** position on a submission — the same account may not be,
say, both อาจารย์ที่ปรึกษา and กรรมการสอบ, nor appear twice as กรรมการสอบ. The **only exception is
ประธานหลักสูตร (PROGRAM_CHAIR)**, who may additionally fill any one other position (e.g. the
program chair also sitting as a กรรมการสอบ). This replaced the earlier rule, which only rejected the
same account twice in the *same* role.

- **One definition**: `findDuplicateCommitteeMember()` (`src/lib/utils.ts`), keyed by email on a
  `people[]` list or by user id on stored committee columns, skipping PROGRAM_CHAIR entries.
- **Server**: `validatePeople` *and* `validatePeopleLenient` (`src/lib/committee.ts`) — so a plain
  draft save rejects it too, since a double-booked member is a mistake, not an omission — and
  `validateResolvedCommitteeAccountRoles` on `admin_update` (programChairId is never among the
  checked slots, which is how the exemption falls out there).
- **Client**: `CommitteePeopleEditor` stops offering an account already picked on another row, and
  flags in red a duplicate carried in from older data; `validateNoInvalidRows` blocks both save and
  confirm while one exists. The admin submission-edit form gets all of this for free, since it
  renders the same `CommitteePeopleEditor` (see "Admin submission edit uses the student's editor"
  below); its save also surfaces a server error as a toast — it used to fail silently.

### Admin submission edit uses the student's editor (2026-09-29)
`AdminSubmissionPanel`'s edit mode renders the **same components the student's draft forms use** —
`CommitteePeopleEditor` + `ProgramChairAutoField` for the committee and `ExamLogisticsSection` for
the exam schedule (`src/components/SubmissionForms.tsx`) — instead of its own fixed-slot
`<select>`s (1 advisor, 3 co-advisors, 1 head, 3 กรรมการสอบ, 3 กรรมการภายนอก), which silently
dropped any member past the third on save. Consequences: no slot limit, drag-to-reorder sign
order, degree-dependent pickers, one-person-one-role filtering, and the invalid-row healing of
`buildPeopleFromSubmission` all apply to admin edits exactly as to the student's. The whole edit
form follows the student's draft layout (`ProposalDraftReview`), built from the same `Section`/
`Field`/`INPUT` pieces: **ข้อมูลวิทยานิพนธ์** (the title — no longer an inline input in the panel
header), **ข้อมูลนิสิต** (same 2-column grid, with `ProgramChairAutoField` under หลักสูตร),
**ผู้รับผิดชอบวิทยานิพนธ์**, then the exam section. The one deliberate difference: an admin may
correct the student-info snapshot, so ชื่อ-นามสกุล/รหัสนิสิต/อีเมล are inputs where the student
sees them read-only. On save the rows are mapped back to the id columns by email; a non-`DRAFT` submission is
checked client-side with `validatePeopleClient` (full counts, mirroring the server), a `DRAFT` only
with `validateNoInvalidRows`. `ExamLogisticsSection` takes `allowPastDate` here only, so an admin
can correct a record after the exam.

### Committee composition by degree (2026-09-15)
**Who may fill each committee role depends on the degree level of the submission's หลักสูตร.**
`PHD` is doctoral; `ME_MECH`/`ME_CPS` are master's (`degreeOfProgram()`, `src/lib/utils.ts` — an
unset program is treated as master's, the permissive case, so a not-yet-chosen หลักสูตร never
blocks a draft).

| Role | ปริญญาโท (ME_MECH/ME_CPS) | ปริญญาเอก (PHD) | Count |
|---|---|---|---|
| ADVISOR อาจารย์ที่ปรึกษา | `PROFESSOR` | `PROFESSOR` | exactly 1 |
| CO_ADVISOR อาจารย์ที่ปรึกษาร่วม | `PROFESSOR` or `EXTERNAL` | `PROFESSOR` or `EXTERNAL` | 0+ |
| HEAD_EXAM_COMMITTEE ประธานกรรมการสอบ | `PROFESSOR` or `EXTERNAL` | **`EXTERNAL` only** | exactly 1 |
| EXAM_COMMITTEE กรรมการสอบ | `PROFESSOR` | `PROFESSOR` | ≥1 |
| INVITED_EXAM_COMMITTEE กรรมการภายนอก | `EXTERNAL` | `EXTERNAL` | ≥1 |

HEAD_EXAM_COMMITTEE is the only role that differs between the two degrees. PROGRAM_CHAIR is
deliberately **not** in this table — it's never a student-picked row, it's auto-resolved from the
program's admin-designated chair, and `POST /api/admin/program-chairs` already restricts that to a
`PROFESSOR` account.

- **One source of truth**: `degreeOfProgram()` / `committeeRoleScope(role, degree)` /
  `accountFitsScope(accountRoles, scope)` / `ACCOUNT_SCOPE_LABELS` in `src/lib/utils.ts` (no Prisma
  import, so both client and server use the same functions). Nothing else encodes this table.
- **Client**: `CommitteePeopleEditor` takes a `program` prop (threaded from `ProposalForm`'s program
  state, `DefenseForm`/`DefenseDraftReview`'s source-proposal program, `ProposalDraftReview`'s draft
  program) and builds each row's account dropdown from it; `validatePeopleClient(people, ownEmails,
  program, users)` re-checks it at submit.
- **Server**: `validateCommitteeAccountRoles(people, program)` (`src/lib/committee.ts`) — the one
  check that has to hit the DB, since the rule is about the *account* behind an email rather than
  the row's own fields. Called on the strict path only: `POST /api/submissions`, and
  `save_proposal_draft`/`save_defense_draft` with `confirm: true`. A row whose email has no account
  yet is skipped on the strict path (`resolvePeople` reports it with a better message); the draft-save
  path passes `requireAccount: true` so it is rejected there instead of silently dropped.
- **Enforced on the draft-save path too** (2026-09-15, reversing the original decision): a draft
  save rejects a filled-in row whose account is unusable rather than dropping it silently, and the
  editor clears such a row on re-open so the student has something to act on — see "Re-opening a
  draft heals an unusable committee member" above. `continue_draft`, which finalized a committee
  with no account-type check at all, no longer exists.
- **Also enforced on `admin_update`** — the ADMIN submission-edit save writes every committee id
  column directly and had no committee validation of any kind. `validateResolvedCommitteeAccountRoles()`
  (`src/lib/committee.ts`) checks the state the save would leave behind, but only when the request
  touches a committee field **or `program`** (switching to PHD invalidates an internal
  ประธานกรรมการสอบ without touching a committee field), so an unrelated edit is never blocked by a
  committee that predates the rule. **Role counts are checked there too** (2026-09-29,
  `validateResolvedCommitteeCounts()`) — exactly one อาจารย์ที่ปรึกษา/ประธานกรรมการสอบ/ประธาน
  หลักสูตร and at least one กรรมการสอบ/กรรมการภายนอก — but only on a non-`DRAFT` submission, since
  a draft may be incomplete and gets the full check at confirm. Net rule: **account type is checked
  on every committee write; role counts on every transition to `IN_PROGRESS` (direct create, draft
  confirm) and on every admin edit of a non-draft.**
- **Operational prerequisite**: a `PHD` submission now cannot be confirmed until at least one
  `EXTERNAL` account exists to chair the exam committee (and every degree already needed one for
  กรรมการภายนอก). See "EXTERNAL account requests" above for how those accounts get created.

### Multiple external committee members (2026-09-09)
`INVITED_EXAM_COMMITTEE` (กรรมการภายนอก) now supports **any number of members (≥1)**, sequential
sign-in-list-order — previously hard-capped at exactly 1. This makes it structurally identical to
`CO_ADVISOR`/`EXAM_COMMITTEE`, which already supported multiple members:

- **Schema**: `Submission.invitedCommitteeId String?` (plus the `invitedProfName`/
  `invitedProfAffiliation`/`invitedProfEmail`/`invitedProfPhone` free-text snapshot scalars) was
  replaced with `invitedCommitteeIds String[]` — migrated via a one-off raw-SQL script (backfilled
  existing single ids into a 1-element array, verified row-for-row, then dropped the old columns;
  same pattern as this file's other `$executeRawUnsafe`-over-the-pooler migrations). The snapshot
  scalars are gone entirely — like `committeeIds`/`coAdvisorIds`, a member's name/email/phone/
  affiliation is now always resolved from their `User` row at display/email time, never cached on
  the submission.
- **Validation/resolution** (`src/lib/committee.ts`): `validatePeople`/`validatePeopleLenient` now
  require **at least 1** INVITED_EXAM_COMMITTEE row (was exactly 1); `resolvePeople`/
  `resolvePeoplePartial` resolve it to an id array the same way `coAdvisorIds`/`committeeIds` do.
- **Workflow steps** (`src/lib/workflowSteps.ts`): `buildWorkflowSteps()` takes
  `invitedCommitteeIds: string[]` and populates `WorkflowStep.committeeMembers` with the real array
  — no longer a synthetic 1-element wrap.
- **Sequential signing**: `POST /api/submissions/[id]/sign` now includes
  `"INVITED_EXAM_COMMITTEE"` in its allowed-roles check, so it goes through the same
  `committeeActions`-tracked, serializable-transaction sequential-approval path as
  `CO_ADVISOR`/`EXAM_COMMITTEE` — each member signs in list order, all must approve before the
  step advances. The plain single-approver `approve` action (`PATCH /api/submissions/[id]`) now
  rejects this role the same way it already rejected CO_ADVISOR/EXAM_COMMITTEE. `RoleSubmissionDetail`
  routes it to `CommitteeSignPanel` instead of `SignatureButton`.
- **UI**: `CommitteePeopleEditor`'s `ROLE_REQUIREMENTS` for this role is now `min: 1, max: null` (no
  more "✗ เกิน" error past 1 row) — a student can add as many กรรมการภายนอก rows as needed, and
  their sign order is the row order (same drag-to-reorder convention as every other multi-member
  role). The admin submission-edit form now uses the same editor, so it has no slot limit either
  (it had fixed 3-slot dropdowns per multi-member role until 2026-09-29). Every display surface that used to show one invited-committee name
  (`WorkflowTimeline`, `SubmissionInfoPanel`, `RoleSubmissionDetail`, `AdminSubmissionPanel`) now
  lists all of them, comma-joined or one row per member — same convention already used for
  `coAdvisorIds`/`committeeIds`.
- **Email**: `sendStepEmail`'s recipient resolution folds `INVITED_EXAM_COMMITTEE` into the same
  branch as `EXAM_COMMITTEE`/`CO_ADVISOR` (a `specificMemberId` for the sequential in-turn email, or
  first-member fallback); an `allMembers` option broadcasts to every member at once (its only caller, the defense's
  invitation-letter email, was removed 2026-10-01 — the Faculty's own email covers it). `sendFinanceEmail`'s `FinanceEmailData.invitedProfs` is now an array of
  `{name, affiliation?, email?, phone?}`, one row per member, rendered the same way `committeeNames`
  already renders one row per EXAM_COMMITTEE member.

**Exam logistics:** วันที่สอบ + เวลา, ห้องประชุม (yes/no), ที่จอดรถ (yes/no), เลขทะเบียนรถ.
เวลาสอบ (`ExamLogisticsSection`, `src/components/SubmissionForms.tsx`) is a `TimeSelect` — two
plain `<select>`s (hour 00–23, minute in 15-minute steps: 00/15/30/45) joined into the same
`"HH:MM"` string every server-side check already validates against, used instead of the native
`<input type="time">` so the 24-hour format and the minute options are identical for every user
regardless of browser/OS locale (a native time input's AM/PM display and free-scroll minute spinner
both depend on that locale). ห้องประชุม/ที่จอดรถ render as two checkboxes on the same line
(`flex flex-wrap`), with the เลขทะเบียนรถ input appearing inline next to them — not on its own
row — the moment ที่จอดรถ is checked.

---

## Workflow — source of truth

### PROPOSAL (12 steps)

Every document in a PROPOSAL is the one combined `B1` file (บ.วศ.1ก–ง); each step downloads the
latest `B1` and, if it signs, uploads the signed copy as a new `B1` version (PDF only). "Shown as"
is the number users see (`stepNumbering()` — see "Step display numbering" above); **Step** is the
internal `stepOrder` every rule keys off.

#### Phase 1 (Steps 1–3): บ.วศ.1ก + บ.วศ.1ข
| Step | Shown as | Role | Action |
|------|----------|------|--------|
| 1 | 1 | STUDENT | Upload B1 (1ก + 1ข filled in); 5-item checklist (both filled, student signed 1ก + 1ข, advisor signed 1ก) — **starts PENDING, student must submit** (see "Proposal steps 1–2" below) |
| 2 | 2 | ADMIN | **Generate FINANCE_ATTACH** (optionally download/edit/re-upload), tick the student's 5 checks + committee check, approve → **triggers the finance email**. The proposal's only finance step. |
| 3 | 3 | PROGRAM_CHAIR | Sign บ.วศ.1ก; one checkbox (own signature) |

#### Phase 2 (Steps 4–11): บ.วศ.1ค + บ.วศ.1ง
| Step | Shown as | Role | Action |
|------|----------|------|--------|
| 4  | 4   | STUDENT | **After the proposal exam** (the step name says so: "หลังสอบโครงร่างแล้ว — …"). Download the latest B1 (chair-signed), fill บ.วศ.1ค + 1ง, re-upload as a new B1 (must be newer than step 3's approval — `freshUploadCutoff`); 9-item checklist (see "Step 4 uses the same combined file"). No finance document. |
| 5  | 5.1 | HEAD_EXAM_COMMITTEE | Sign บ.วศ.1ค (one place); one checkbox |
| 6  | 5.2 | ADVISOR | Sign บ.วศ.1ค (one place); one checkbox |
| 7  | 5.x | CO_ADVISOR | Sign บ.วศ.1ค (one place each); one checkbox — **auto-SKIPPED (and not numbered) if no co-advisors assigned** |
| 8  | 5.x | INVITED_EXAM_COMMITTEE | Sign บ.วศ.1ค (one place each, sequential); one checkbox |
| 9  | 5.x | EXAM_COMMITTEE | Sign บ.วศ.1ค (one place each, sequential); one checkbox |
| 10 | 6   | ADMIN | Verify the fully-signed B1; 4-item checklist (committee signatures all on 1ค, 1ค/1ง complete, 1ง topic correct — it is registered in Chula's system, and **the submission's title renamed to match 1ง** via the panel's แก้ไข button) before approve (`ADMIN_STEP6_CHECKS`) |
| 11 | 7   | PROGRAM_CHAIR | Sign บ.วศ.1ค + บ.วศ.1ง; two checkboxes (own signature on each) |
| 12 | 8   | ADMIN | Final recheck + upload the **cover page** (`COVER_PAGE`, ใบปะหน้าส่งคณะฯ, PDF, single version, ADMIN-only at this step) signed by the department chair (the card shows who that is — SystemSetting `departmentChair`); 3-item checklist (`ADMIN_STEP8_CHECKS`: บ.วศ.1ก–ง complete and fully signed, system title matches 1ง, cover page signed by the department chair). The cover-page upload box sits in the admin action card and the picked file is uploaded on อนุมัติ (no separate upload button). Approve is gated on the cover page (server `REQUIRED_UPLOADS.PROPOSAL[12]`) and completes the proposal. |

If rejected, the step stays `REJECTED` (does not move) until the student resubmits — see "Rejection stays on the step" above. ส่งกลับ (admin-only) is the separate action that moves back one step (e.g. step 9 → step 8).

---

### THESIS_DEFENSE (20 steps — restructured 2026-09-30, again 2026-10-01)

Named stepOrders live in `THESIS_STEP` (`src/lib/workflowSteps.ts`) — code must branch on those, never
on bare numbers. The ADMIN finance step is `financeStepOf(type)` (step 2 for both types). The **Step**
column below is the internal stepOrder; what users see comes from `stepNumbering()` — SKIPPED
co-advisor steps hidden, and stepOrders 8–11 shown as sub-steps 8.1–8.x (see "Step display
numbering").

#### Phase 3 (Steps 1–3): บ.2 + บ.3
| Step | Role | Action |
|------|------|--------|
| 1 | STUDENT | Upload **B2** (filled in and **signed by the student, the advisor and the head of committee** — all outside the system; the program chair's line stays blank) **and one signed B3 per committee member**. บ.3 is collected **outside the system**: the student fills in their info, the topic, the committee names and the date, and the student and advisor contact each member to evaluate and sign it. The upload screen shows one B3 box per member of the submission's committee (`committeeRoster()`, labelled name + role); each copy is stored with `FormUpload.memberId`, and the approve gate refuses step 1 until every member has one (naming who is missing). 9-item checklist `DEFENSE_STEP1_CHECKS` (incl. one box each for the student's, advisor's and head's บ.2 signature). Blank forms linked from the department download page. No finance file. |
| 2 | ADMIN | **Generate FINANCE_ATTACH** (`templates/finance-attach-thesis.docx`, same generator/card/single-version/edit-and-re-upload flow as PROPOSAL step 2); checklist `ADMIN_DEFENSE_FINANCE_CHECKS` (บ.2 complete + signed by student/advisor/head, every member's บ.3 present with evaluation + signature, committee names); approve → **triggers the finance email** (`THESIS_STEP.ADMIN_CHECK`). |
| 3 | PROGRAM_CHAIR | Sign บ.2; one-box own-signature checklist (`SIGN_CHECKS`) → admin bell notification (`THESIS_STEP.CHAIR_B2`). |

The advisor's and head's in-system บ.2 steps (old steps 2–3) were removed 2026-10-01 — they now sign
the paper บ.2 before the student uploads it. บ.2 has no co-advisor signature.

#### Phase 4 (Steps 4–5): Faculty relay
| Step | Role | Action |
|------|------|--------|
| 4 | ADMIN | Collect B2+B3 (every member's บ.3 is its own row in the file list), upload the **cover page** (`COVER_PAGE`, PDF, single version, ADMIN-only at this step, signed by the department chair — the card shows who) that goes to the Faculty with them, send to Faculty, tick `ADMIN_DEFENSE_RELAY_CHECKS` (cover page signed by the department chair; บ.2 + บ.3 sent with it), approve to confirm delivery (`THESIS_STEP.ADMIN_RELAY`). Same upload box as PROPOSAL step 8: the picked file is uploaded on อนุมัติ, and approve is gated on it (server `REQUIRED_UPLOADS.THESIS_DEFENSE[ADMIN_RELAY]`). |
| 5 | ADMIN | **Confirm only**: forward the Faculty's email (ใบรายงานผลการสอบ, แบบรายงานฯ, invitation letter) to the student, tick the one-box checklist `ADMIN_DEFENSE_FORWARD_CHECKS`, approve (`THESIS_STEP.ADMIN_FORWARD`). Nothing is uploaded and no email is sent by the system. |

Until 2026-10-01 step 5 had the ADMIN upload the 4 Faculty returns (SIGNED, EXAM_RESULT, INVITE_LETTER, FINANCE_DOC) and approving it emailed the advisor + external members an invitation notice; both are gone — the Faculty's email reaches the student directly via the admin, and the student uploads what the committee signs at step 6.

#### Phase 5 (Steps 6–12): Post-defense signing
| Step | Role | Action |
|------|------|--------|
| 6  | STUDENT | From the forwarded Faculty email: fill info and sign แบบรายงานการเสนอผลงานฯ and upload it (formType: SIGNED), plus upload ใบรายงานผลการสอบ (EXAM_RESULT) for steps 7–12 to sign. **The student picks the exam result** (`ExamResultPicker`: ดีมาก/ดี/ผ่าน/ไม่ผ่าน, ผ่าน preselected by design), sent as the approval note's first line `ผลการสอบ: …` and read back with `defenseExamResult()` (`src/lib/utils.ts`); **ดีมาก adds a required upload of แบบประเมินวิทยานิพนธ์ดีมาก** (`VERY_GOOD_EVAL`, filled in by the student, uploaded after step 5's approval). Both enforced client- and server-side (`THESIS_STEP.STUDENT_REPORT`; server `REQUIRED_UPLOADS`) |
| 7  | ADVISOR | Sign แบบรายงานฯ + ใบรายงานผลการสอบ; **double-checks the student's exam result** — the card shows it with a notice, and a 3-box checklist confirms it matches ใบรายงานผลการสอบ and that the advisor signed both แบบรายงานการเสนอผลงานฯ and ใบรายงานผลการสอบ. If it's wrong the advisor rejects with a reason; the student's resubmit screen then offers the result picker again (`resubmit` accepts `examResult`, which rewrites the step-6 note's result line; switching to ดีมาก needs the evaluation form) (`THESIS_STEP.ADVISOR_RESULT`) |
| 8  | CO_ADVISOR | Sign ใบรายงานผลการสอบ — **auto-SKIPPED if no co-advisors assigned** |
| 9  | HEAD_EXAM_COMMITTEE | Sign ใบรายงานผลการสอบ |
| 10 | EXAM_COMMITTEE | All members sign ใบรายงานผลการสอบ (sequential) |
| 11 | INVITED_EXAM_COMMITTEE | Sign ใบรายงานผลการสอบ |

StepOrders 8–11 are shown as sub-steps 8.1–8.x; each signer ticks the one-box own-signature checklist `SIGN_RESULT_CHECKS` (also used at step 13). The program chair does **not** sign ใบรายงานผลการสอบ
(its step was removed 2026-10-01); the student doesn't either (step 6 uploads it unsigned).

#### Phase 5b (Steps 12–14, shown as 9–11): result to the Faculty
| Step | Role | Action |
|------|------|--------|
| 12 | ADMIN | Check the committee-signed ใบรายงานผลการสอบ + แบบรายงานฯ; 3-item checklist `ADMIN_DEFENSE_RESULT_CHECKS` (`THESIS_STEP.ADMIN_RESULT_CHECK`) |
| 13 | DEPARTMENT_CHAIR | หัวหน้าภาควิชา signs ใบรายงานผลการสอบ (download latest, upload signed); one-box own-signature checklist (`THESIS_STEP.DEPT_CHAIR_RESULT`) |
| 14 | ADMIN | Upload a **new cover page** (`COVER_PAGE`, must be newer than step 13 — `freshUploadCutoff`; same upload box as step 4, uploaded on อนุมัติ) and tick `ADMIN_DEFENSE_SEND_CHECKS` (cover page signed by the department chair; the result + cover page emailed to the Faculty); server-gated on the cover page (`THESIS_STEP.ADMIN_RESULT_SEND`) |

A defense has **two cover pages** sharing the one `COVER_PAGE` slot — step 4's and step 14's — so
for THESIS_DEFENSE the type is **not** single-version (the step-4 copy moves under ประวัติ); the
upload route lets the ADMIN upload it at either step only.

#### Phase 6 (Steps 15–20, shown as 12–17): Thesis submission to the Faculty + iThesis
| Step | Role | Action |
|------|------|--------|
| 15 | STUDENT | Upload B4 + THESIS (from the iThesis system, with barcode, **already signed by the whole committee outside the system**) (`THESIS_STEP.STUDENT_THESIS`); 6-item checklist `DEFENSE_STEP15_CHECKS` — บ.4 filled in + signed by the student, iThesis file with barcode, committee signatures complete, program name + thesis title correct, confirmed with the advisor |
| 16 | ADMIN | Check B4 + THESIS (`ADMIN_DEFENSE_THESIS_CHECKS`, 4 items incl. the cover page signed by the department chair) and upload a **new cover page** (`COVER_PAGE`, newer than step 15 — `freshUploadCutoff`; uploaded on อนุมัติ, server-gated) (`THESIS_STEP.ADMIN_THESIS_CHECK`) |
| 17 | DEPARTMENT_CHAIR | หัวหน้าภาควิชา signs **both** B4 and THESIS (download latest, upload both signed); 2-item own-signature checklist (`SIGN_CHECKS.THESIS_DEFENSE`) (`THESIS_STEP.DEPT_CHAIR_THESIS`) |
| 18 | ADMIN | Confirm only: emailed B4 + thesis + cover page to the Faculty (`ADMIN_DEFENSE_THESIS_SEND_CHECKS`) (`THESIS_STEP.ADMIN_THESIS_SEND`) |
| 19 | ADMIN | Confirm only, when the Faculty replies: forwarded its documents — **signed by the Dean (คณบดี)** — to the student (`ADMIN_DEFENSE_THESIS_FORWARD_CHECKS`) (`THESIS_STEP.ADMIN_THESIS_FORWARD`) |
| 20 | STUDENT | Confirm only, nothing uploaded: every required document has been submitted to the iThesis system (`DEFENSE_ITHESIS_CHECKS`, button "ยืนยัน") — the defense's last step (`THESIS_STEP.STUDENT_ITHESIS`) |

The committee signs the thesis **outside the system** (the five in-system cover-signing steps were
removed 2026-10-01), and the program chair no longer signs บ.4 — the department chair signs both
documents at step 17. A defense now has **three cover pages** in the one `COVER_PAGE` slot (steps 4,
14, 16).

**Per-member uploads** (`PER_MEMBER_FORMS` / `isPerMemberForm()` in `workflowSteps.ts` — only the
defense's B3 so far): `POST /api/upload` requires a `memberId` that is on the submission's committee
and names the file after the member; `FileList` shows one row (with its own history) per member,
labelled with the member's name; the admin's per-step file list keeps one entry per member. A
nullable `FormUpload.memberId` column holds it (added 2026-09-30).

If rejected, the step stays `REJECTED` (does not move) until the student resubmits. ส่งกลับ (admin-only) is the separate action that moves back one step.

---

## Key rules
- **Sequential only** — no parallel signing. (A parallel whole-committee `ALL_COMMITTEE` step existed briefly on 2026-09-30 and was removed the same day — บ.3 is now collected outside the system.)
- **EXAM_COMMITTEE, CO_ADVISOR, and INVITED_EXAM_COMMITTEE** steps: all assigned members must approve, sequentially in list order (tracked via `committeeActions` JSON on `WorkflowStep`, same sequential-sign mechanism `sign/route.ts` and `CommitteeSignPanel` already use). CO_ADVISOR uses `coAdvisorIds`, EXAM_COMMITTEE uses `committeeIds`, INVITED_EXAM_COMMITTEE uses `invitedCommitteeIds` — all three are DB field `String[]` and support any number of members (≥1 for INVITED_EXAM_COMMITTEE/EXAM_COMMITTEE, 0+ for CO_ADVISOR). See "Multiple external committee members" below.
- **CO_ADVISOR auto-skip**: when `coAdvisorIds` is empty at submission creation, all CO_ADVISOR steps are created with `status: "SKIPPED"` so they are transparently bypassed.
- **An admin committee edit re-syncs the open steps** (2026-09-29). Each multi-member step snapshots its member list into `WorkflowStep.committeeMembers` when the steps are built, and signing (`sign/route.ts`) reads only that snapshot — so `admin_update` now runs `planCommitteeStepSync()` (`src/lib/workflowSteps.ts`, pure) and applies the result in the same transaction as the edit: every still-open step (PENDING, or the REJECTED one awaiting resubmit) gets the new list; sign-offs by members still on it are kept, removed members' are dropped; a current step whose remaining members have all approved is approved on the spot; removing every co-advisor SKIPS the open CO_ADVISOR steps and adding one re-opens the SKIPPED ones still ahead. APPROVED steps and SKIPPED steps behind the current one are history and never touched; CANCELLED/COMPLETED submissions are left alone. The submission status is then re-derived from the steps, and if the edit changed whose turn it is (`currentTurn()`), that person is notified + emailed. `admin_reset` also re-snapshots every multi-member step's list from the submission's committee.
- **Signing is recorded on the step row, not in a separate table** (2026-09-15). Who signed and when lives on `WorkflowStep` — `actedById`/`actedByName`/`actedAt` for single-approver steps, and the `committeeActions` JSON array (`{userId, name, decision, notes, actedAt}[]`) for the three sequential multi-member roles. There is **no `Signature` model**: one existed in the schema (`signatures` table, with an unused `ipAddress` column) but nothing ever wrote to it — the only reference in the whole codebase was a `count()` in the user-delete blocker — so the model and the table were removed 2026-09-15. Don't reintroduce a separate signature table without first deciding what it would record that `WorkflowStep` doesn't.
- **PROGRAM_CHAIR resolution**: always prefer `sub.programChairId` (per-submission, set from the student's people list) and fall back to whichever PROFESSOR's `programChairFor` array includes `sub.program` (see "Program Chair & finance-contact assignment" above — no holder means no fallback recipient; since a professor may now chair more than one program, this is an `.includes()` check, not `===`). Applied in `email.ts`, notifyRole + approve auth in `PATCH /api/submissions/[id]`, `GET /api/submissions` (list-scoping), the sign route, exam-reminder cron, both upload routes, `AppContext`, `RoleSubmissionDetail`, `WorkflowTimeline`, professor dashboard, and display-name lookups.
- **Finance email** fires at PROPOSAL step 2 (the ADMIN's approval, once the finance form is generated) and THESIS_DEFENSE step 2 (also the ADMIN's approval — `financeStepOf`), called directly via `sendFinanceEmail()` with the latest FINANCE_ATTACH file attached; recipient = the ADMIN designated as finance contact (`SystemSetting` key `financeContact`, set via "ตั้งค่าระบบ" → `AdminSettingsPanel`), falling back to the `FINANCE_EMAIL` env var if none is set (skips entirely if neither exists).
- **Rejection emails** use a red formal template (`buildRejectedHtml`) showing step + reason. `step.notes` stores only the raw reason text (or null) — role context lives in notification messages only. **Admin reject requires a comment** (API) — though admin steps no longer offer ปฏิเสธ at all; other roles may reject without one.
- **SUPER_ADMIN has zero submission workflow access** — cannot approve, reject, override, upload to, or otherwise act on any submission (no detail-page views either — `src/app/dashboard/admin/[id]` stays ADMIN-only). That responsibility belongs exclusively to ADMIN. It does have read-only oversight: a full user directory (incl. STUDENT/PROFESSOR) via `GET /api/super-admin/users`, and a full submission list via `GET /api/super-admin/submissions` (both SUPER_ADMIN-only, view-only; the older counts-only `GET /api/super-admin/stats` was removed once these shipped) — but account *management* of STUDENT/PROFESSOR/ADMIN stays exclusively ADMIN's (SUPER_ADMIN can only create/edit/delete SUPER_ADMIN/ADMIN accounts, per `src/lib/accountScope.ts`).
- **Account-management tiers** (`src/lib/accountScope.ts`, shared by `PATCH`/`DELETE /api/users/[id]` and `POST /api/users`): a SUPER_ADMIN-tier account (has `SUPER_ADMIN` role) is manageable only by SUPER_ADMIN; an ADMIN-tier account is manageable by SUPER_ADMIN or ADMIN; a STUDENT/PROFESSOR account is manageable by ADMIN only. `GET /api/users` scopes the returned list the same way per caller, so SUPER_ADMIN's `users` never contains STUDENT/PROFESSOR rows and ADMIN's never contains SUPER_ADMIN rows.
- **A user with any submission history cannot be deleted** — `DELETE /api/users/[id]` is a hard
  delete, and two FKs to `users(id)` refuse it: `Submission.studentId` and `FormUpload.uploadedById`
  (deliberately — deleting an account must never silently destroy thesis
  records). (There was a third, `Signature.userId`, until the `Signature` model was removed
  2026-09-15 as dead — see "Signing is recorded on the step row" below.) **Which relations block is
  decided by optionality, not by this file**: neither
  declares an explicit `onDelete`, so Prisma applies `Restrict` to the *required* ones above and
  `SetNull` to the two *optional* ones — `Submission.advisorId` and `WorkflowStep.actedById` do
  **not** block a delete, they are quietly nulled, which also means deleting a professor erases
  their advisor link and their step-action attribution on existing submissions. Verify against
  `pg_constraint`, never by reading the schema. Deleting a student/professor who owns a submission
  or has uploaded a file fails with a `409`
  and a Thai message that **names each blocker with its count** — `describeDeleteBlockers()` in
  `src/app/api/users/[id]/route.ts` counts those two relations *before* attempting the delete
  (submissions broken down per status, so a blocking `DRAFT` is named as such) and returns them as
  `{ error, blockers: string[] }`. The old catch of `Prisma.PrismaClientKnownRequestError` code
  `P2003` is still there as a fallback for a relation the counter doesn't know about, or a row
  created in between.

  This exists because the most common blocker is **invisible in the admin user list**: the three
  stats on a user row (`UserProfileHeader`, กำลังดำเนินการ/เสร็จสิ้น/ถูกปฏิเสธ) count only
  `IN_PROGRESS`/`COMPLETED`/`REJECTED`, so a student holding nothing but an untouched blank `DRAFT`
  proposal — one click of "+ สร้างร่างคำร้อง" on `/student-dashboard`, see "Student dashboard"
  above — reads as `0 0 0` yet cannot be deleted. When **every** blocker is a DRAFT, the message
  appends that the draft can be deleted from the "จัดการคำร้อง" tab first (an admin can do that
  themselves; the counts are unchanged either way).

  **`ExternalCommitteeRequest` deliberately never blocks a delete** (fixed 2026-09-15): it's an
  account-provisioning request, not a thesis record. `requestedById` is `onDelete: Cascade` (the
  request belongs to the student who made it) and `createdUserId` is `onDelete: SetNull` (the
  EXTERNAL account it produced outlives it). Both are now declared explicitly rather than left to
  Prisma's per-optionality defaults — which is what caused the bug: `requestedById` is a *required*
  relation, so it defaulted to `Restrict`, making **any student who had ever filed a request — even
  a rejected one — permanently undeletable** while still showing `0 0 0`. (`createdUserId` is
  optional and so already defaulted to `SetNull`; the EXTERNAL account an approved request created
  was never blocked by it.)
- **Admin (พี่โบ้)** relays at THESIS_DEFENSE steps 4–5 (`THESIS_STEP.ADMIN_RELAY`/`ADMIN_FORWARD`) — step 4: upload the cover page and send B2+B3 to Faculty; step 5: forward the Faculty's email to the student and confirm. Admin panel shows a relay-step-specific checklist banner.
- **Student upload steps** start PENDING; student uploads required files then clicks submit to advance
- **Rejection** stays on the same step (marked `REJECTED`) until the student resubmits — it does NOT move back a step. Any role can reject, except on an ADMIN step, which offers only อนุมัติ + ส่งกลับ. (ส่งกลับ/`return_to_prev`, admin-only, is the separate action that actually moves back one step.)
- **One active proposal per student, defense created from a completed one** — a new PROPOSAL is blocked while an existing one is anything other than `CANCELLED`; a THESIS_DEFENSE requires a `COMPLETED`, non-cancelled source proposal (`sourceProposalId`) and imports (editable, independent copy) its committee. See "Proposal-first" above.
- **Every committee person must already have an account, and the editor only offers existing ones** — `POST /api/submissions` never auto-creates one, and an email that doesn't resolve (the account was deleted between page load and submit) is a plain 400. The only path to a new committee account is a STUDENT's EXTERNAL-account request, approved by an ADMIN. See "Committee accounts must pre-exist" above.
- **Cancellation is a two-step admin-gated request**, not an immediate student action — `request_cancel` only sets `cancelRequested` and freezes all other actions on that submission; only ADMIN's `accept_cancel`/`decline_cancel` actually resolves it. See "Cancellation — student requests, ADMIN accepts or declines" above.

## UI conventions (recent)
- **FileList** takes a `submissionType` prop and groups uploads into phase-aware sections. PROPOSAL: เอกสารหลัก (B1/B1A/B1B/B1C/B1D) / เอกสารการเงิน / เอกสารอื่นๆ. THESIS_DEFENSE: บ.2+บ.3 (B2/B3/FINANCE_ATTACH) / เอกสารการเงิน (FINANCE_DOC) / เอกสารจากคณะและผลการสอบ (SIGNED/EXAM_RESULT/INVITE_LETTER/VERY_GOOD_EVAL) / วิทยานิพนธ์ (B4/THESIS). See `FILE_GROUPS_PROPOSAL` / `FILE_GROUPS_THESIS` in `FileList.tsx`. Unknown types fall into the last section. Row labels are always Thai form names (FORM_SHORT primary, full FORM_LABELS as subtitle) — never raw filenames as titles. FileList shows its own file count in the header; callers must NOT add another count to the `title` prop.
- **THESIS step 6 (student report)**: there is nothing to download — the student has แบบรายงานฯ and ใบรายงานผลการสอบ from the Faculty email the admin forwarded at step 5, and uploads both.
- **FileUploader** slots always render a `SlotHeader`: form-code badge (FORM_SHORT) + description + status chip (อัปโหลดแล้ว / เลือกไฟล์แล้ว / ยังไม่ได้เลือกไฟล์). The uploaded file's name opens a preview.
- **One action-card design for every role** (2026-10-01). The card a user acts in when it is their turn — `StudentSubmissionActions`' upload card and rejected-fix card, `SignatureButton`, `CommitteeSignPanel`, `AdminSubmissionPanel`'s action card and finance card — is built only from the shared pieces exported by `src/components/FileUploader.tsx`: `ACTION_CARD` (frame), `SectionLabel` (numbered heading), `DownloadRow`/`NoDownloads`, `UploadSlot`/`FileUploader`, `B1Checklist`, `NotesField` (`reject` / `sendBack` variants), `ActionError`, `PRIMARY_BUTTON` (the one green ✓ button), `REJECT_BUTTON` / `SEND_BACK_BUTTON` beside it, `CONFIRM_REJECT_BUTTON` / `CONFIRM_SEND_BACK_BUTTON` / `CANCEL_BUTTON` for the reject/send-back form, and `postUpload()` (throws the server's Thai error). Fixed order: ① download → ② sign/fill → ③ upload (sections a step doesn't have are left out and the rest renumber; a picker such as `ExamResultPicker` is a numbered section too) → checklist → notes → primary button with ปฏิเสธ beside it (the admin card has ส่งกลับ there instead). The admin's ① download lists the step's documents to check (`ADMIN_STEP_FORMS` in `AdminSubmissionPanel`). Anything else a role must see while acting (e.g. the advisor's view of the student's exam result) goes inside the card (`SignatureButton`'s `intro`), not in a separate card beside it, and a student's ขอยกเลิกคำร้องนี้ sits below the card. Files picked in a card are uploaded when its primary button is pressed — the only immediate-upload card is the finance card (generate / edit / replace). Errors are shown inline on the card, not as a toast. The reject action is labelled ปฏิเสธ everywhere (never ไม่อนุมัติ). Don't hand-roll a new card; compose these.
- **Professor dashboard** shows the generic "อาจารย์" label on card badges (a professor can hold several roles per submission); other views keep specific role labels.
- **Checklist wording** (2026-10-01, `src/lib/utils.ts`): one style for every step. Own signature → "ท่านลงนามใน ‹เอกสาร› แล้ว (N ตำแหน่ง)" (group `mySign`); on the student's lists the student is "นิสิต"; another person's signature → "‹ผู้ลงนาม›ลงนามใน ‹เอกสาร› แล้ว (N ตำแหน่ง)"; every item ends in แล้ว; admin items state the result (no leading "ตรวจสอบ" — the group heading says it); "ลงนาม" not "มีลายมือชื่อ"; the whole committee is "คณะกรรมการสอบ", one member "กรรมการแต่ละท่าน"; "อาจารย์ที่ปรึกษา" (never "…หลัก"); "หัวข้อวิทยานิพนธ์"; "คณะฯ"; "iThesis" (never e-thesis); "บาร์โค้ด"; signature counts as "ตำแหน่ง" (never "จุด"). Titles: student "กรุณาตรวจสอบ ‹เอกสาร› ก่อนส่ง", signers "กรุณาตรวจสอบ … ก่อนส่งต่อ", admin "กรุณาตรวจสอบก่อนอนุมัติ". Every signing step has an own-signature checklist (`SIGN_CHECKS`, incl. THESIS 3, 8.x, 10, 14) and every ADMIN cover-page step ends with `COVER_SIGNED_LABEL`.
- **Admin detail** committee panel lists every person (incl. per-submission program chair) with mailto links.
- **Emails** use formal Thai business-letter register: เรียน …, จึงเรียนมาเพื่อโปรดพิจารณาดำเนินการ, ขอแสดงความนับถือ + department signature block.

### Dashboard shell — top bar + header (2026-09-06, unified 2026-09-06)
Every role dashboard shares one top-bar component, `src/app/dashboard/layout.tsx` — the four
landing pages that live outside `src/app/dashboard/` (`/admin-dashboard`, `/super-dashboard`,
`/student-dashboard`, `/professor-dashboard`) each get a thin `layout.tsx` in their own folder that
just re-exports it, so the shell (and any future change to it) stays in one place. All four landing
pages also dropped the `max-w-3xl`/`max-w-4xl` cap their outer wrapper `<div>` used to carry, so
their cards span the same width as the top bar instead of sitting narrower than it.

**PROFESSOR's landing page moved from `/dashboard/professor` to `/professor-dashboard`** (2026-09-06,
after the rest of this section shipped) to match the other three roles' top-level URL pattern.
`/dashboard/professor` is now a thin client-side redirect to `/professor-dashboard`; the submission
detail route stays at `/dashboard/professor/[id]` (same split as ADMIN/STUDENT — see
`DETAIL_BASE` in `NotificationBell.tsx`, which needs an entry whenever a role's landing page and
detail pages live at different bases). `src/lib/roleRoutes.ts` is the single source of truth for
each role's landing page — update it there and every redirect (`/login`, `/`, `/dashboard`, etc.)
follows automatically.

**One top-bar design for every role — no nav links, no hamburger.** All four roles (STUDENT,
ADMIN, SUPER_ADMIN, PROFESSOR) get the exact same always-expanded bar: system name + today's date
on the left, the user's name + email centered, LanguageToggle + NotificationBell + Logout on the
right. There is no per-role branching left in `DashboardLayout` at all. This was originally
STUDENT-only (its two actions already live as cards on `/student-dashboard`); ADMIN/SUPER_ADMIN/
PROFESSOR were later brought in line with it, since every page those nav links pointed to already
carries (or now carries) its own "กลับ"/"ย้อนกลับ" back-link:
- PROFESSOR's submission detail page already had one (`RoleSubmissionDetail`'s `backPath`) — no
  entry point needed.
- SUPER_ADMIN has no sub-pages under `/super-dashboard` — no entry point needed.
- ADMIN's `/dashboard/admin/[id]` already had its own
  back-links. `/dashboard/admin/users` did not — a "ย้อนกลับ" link was added there — and its only
  entry point (the old "ผู้ใช้งานในระบบ" nav link) was replaced with a persistent card on
  `/admin-dashboard` itself (right under the header).

**Logout** is always labeled "Logout" (not the Thai "ออกจากระบบ") everywhere it appears.

**LanguageToggle** (`src/components/LanguageToggle.tsx`) shows the **current** language ("TH" /
"EN"), not the language you'd switch to — click still toggles it. Shared by every role's top bar.

**`DashboardHeader`** (`src/components/DashboardHeader.tsx`) is the per-page header card — role
icon (small solid `ROLE_GRADIENT` square, not a full-bleed banner) + role/name, title,
`formatTodayLong()` date, plus two independent optional slots:
- `highlight` — a single stat pill top-right (e.g. ADMIN's "รอดำเนินการ" count) — a blue-bordered
  pill (`bg-blue-50 border-blue-200`), not translucent glass.
- `stats` — a row of secondary stat pills under the title (e.g. ADMIN's total/in-progress/
  completed/rejected counts, SUPER_ADMIN's system-wide numbers) — flat `bg-gray-50 border-gray-200`
  pills.

`/professor-dashboard` dropped `DashboardHeader` entirely (2026-09-06, same flattening already done
on `/admin-dashboard`/`/super-dashboard` — see "Admin dashboard" below): its pending count is still
visible via the existing count badges on the status-filter tab bar (see below), so nothing was
added back in its place.

**`/professor-dashboard` (2026-09-08 — reworked from a รอดำเนินการ/ประวัติ split into a full list +
status filter)**: shows **every** submission the professor is a committee member on (advisor/
co-advisor/head/exam committee/invited/program chair) — this list is already exactly what
`useApp()`'s `submissions` contains for a PROFESSOR/EXTERNAL session, since `GET /api/submissions`
scopes the query server-side to that same involvement set (see the `where` clause built in
`src/app/api/submissions/route.ts`). The old two-tab design only surfaced a submission once it had
a professor-role step either currently PENDING on this user or already acted on by them — a
submission where this professor sits on the committee but the active step belongs to someone else
(or hasn't been reached yet) was invisible on both tabs. Replaced with the same status-filter tab
bar pattern `/admin-dashboard` uses (ทั้งหมด/ฉบับร่าง/กำลังดำเนินการ/เสร็จสิ้น/ถูกปฏิเสธ/ยกเลิกแล้ว,
each with a count badge). Within a status, submissions where it's currently this professor's turn
to act sort first; each card still shows the same orange "อาจารย์ — <step>" badge when it's their
turn and the green/red "ท่านอนุมัติแล้ว"/"ท่านปฏิเสธแล้ว" badge once they've acted, computed by the
same per-role/committee-sequencing logic the old `pending`/`history` filters used.

The header itself is a **flat white card** (`bg-white border border-gray-200 rounded-2xl`), matching
the calm, low-chrome style of the student dashboard's cards — it was originally a full gradient hero
banner (`ROLE_GRADIENT` background, decorative circles, translucent white/15 stat pills) but that was
flattened to read calmer for the older-faculty audience (see "Keep UI large and calm" above). The
`stats` pills still replaced what used to be a separate stat-card grid sitting directly under the
header on ADMIN/SUPER_ADMIN/PROFESSOR — that grid was always read-only counts, so it always ended
up as the visually-first card on the page even though it wasn't something the user could act on.
Moving the counts into the header itself means the card that actually is first below the header is
always an actionable one (ADMIN's task box, SUPER_ADMIN's account-management table, PROFESSOR's
pending/history list). STUDENT never had `DashboardHeader` grow this baggage — its
`DashboardHeader` was removed outright once name/date/email moved into its own top bar, since the
one stat it showed (in-progress count) wasn't worth a whole hero card on its own.

**Student dashboard** (`src/app/student-dashboard/page.tsx`, 2-tab layout since 2026-09-06,
extended to 3 tabs 2026-09-07; the student can now fully act on their submission — upload,
continue a DRAFT, resubmit, cancel, create a new proposal, review/confirm an auto-imported defense
draft — **without ever leaving this page** as of 2026-09-07; there is no more read-only "click
through to a detail page" step):
1. **Tab bar** — three full-width buttons, `สอบโครงร่าง` / `สอบวิทยานิพนธ์` / `กรรมการภายนอก`
   (`grid grid-cols-3 gap-2`, same tab-bar pattern as `/admin-dashboard`). **Landing tab follows
   progress** (2026-09-30): until the student clicks a tab, it is "defense" when they have any
   non-cancelled THESIS_DEFENSE (draft included), else "proposal" — derived, not an effect, so it is
   right as soon as submissions load; a click always wins. The third tab renders `StudentExternalRequests`
   (see "EXTERNAL account requests" above) — added the same day as that feature, alongside the
   original two. Below the tab bar, one shared frame (`bg-white rounded-2xl border border-gray-200
   p-4 sm:p-6 max-h-[75vh] overflow-y-auto` — same "scrollbar stays inside the frame" convention as
   `/admin-dashboard`) renders whichever tab is active.
2. **Proposal tab** (blank-draft-first since 2026-09-08, replacing the earlier "toggle a button
   card to reveal the full form" flow): when there's **no** current proposal, `ProposalForm`
   (`src/components/SubmissionForms.tsx`) is rendered directly with `readOnlyPreview` — every field
   disabled via a wrapping `<fieldset disabled>` (no field-by-field prop threading needed), showing
   the blank form template — including its own (also disabled) ยืนยัน-checkbox and submit button at
   the end of the card, so the template shows the form's complete shape, not a truncated one — so
   the student can see what's required before starting. `FormHeader` gained an optional `action`
   slot (rendered top-right of the header card, next to the title) for the one control that stays
   live even in preview mode: the "+ สร้างร่างคำร้อง" button, which calls
   get-or-create/idempotent), which creates a `THESIS_DEFENSE`-draft-style blank `PROPOSAL` row —
   `status: "DRAFT"`, only the student's own account fields pre-filled, no committee/program/exam
   info at all (`isAutoDraftProposal()` in `student-dashboard/page.tsx` — since 2026-09-15 just
   `status === "DRAFT"`, DRAFT having only one meaning now). Once that row exists,
   `ProposalDraftReview` (`src/components/ProposalDraftReview.tsx`, mirrors `DefenseDraftReview`)
   takes over as the actual editable form — title/program/student phone/committee/exam logistics,
   all editable, "บันทึกฉบับร่าง" (`PATCH .../[id]` action `"save_proposal_draft"`, `confirm: false`,
   stays `DRAFT`) or "ยืนยัน — ขอสอบโครงร่างวิทยานิพนธ์" (`confirm: true` — builds the 11 workflow
   steps, flips to `IN_PROGRESS`, notifies admins). **A plain save is deliberately allowed to be
   incomplete** (2026-09-08) — blank title, no program picked, no committee members chosen yet, no
   exam date/time — since the whole point of a draft is to let the student leave and come back
   later; only a value that's actually filled in but outright wrong (e.g. a malformed phone number,
   an exam date in the past) is rejected either way. Only `confirm: true` enforces the full
   requirements (see "Draft save vs. confirm validation" below). The "ความคืบหน้าปัจจุบัน (0/8)" preview (top-level count from `stepNumbering`)
   + `WorkflowTimeline` (`preview` prop, see below) stay visible under both the blank template *and*
   `ProposalDraftReview` — nothing has actually progressed yet in either state, since no workflow
   steps exist until confirm — and only disappear once a real (non-draft) proposal exists, at which
   point the whole block is just `<StudentSubmissionActions submissionId={...} />` (see below),
   which renders the real timeline itself — no separate read-only summary.
3. **Defense tab**: no manual "create" entry point — the moment the tab is opened with an eligible
   `COMPLETED` proposal (and no existing non-cancelled defense), a `useEffect` fires
   `getOrCreateDefenseDraft()` (`POST /api/submissions/auto-draft-defense`, get-or-create,
   idempotent) which creates a `THESIS_DEFENSE` row directly in `DRAFT` status with every
   committee/student field **imported straight onto the row** from the proposal (already resolved
   there). While loading, a spinner card shows "กำลังเตรียมคำร้องขอสอบวิทยานิพนธ์...". Once created,
   `isAutoDraftDefense(sub)` (`status === "DRAFT"`) routes to
   `DefenseDraftReview` (`src/components/DefenseDraftReview.tsx`) instead of
   `StudentSubmissionActions` — editable title/committee-people-editor/exam-logistics (all
   pre-filled, all still editable — the imported committee never writes back to the source
   proposal), with two actions both hitting `PATCH .../[id]` action `"save_defense_draft"`
   (`{ ...fields, confirm }`): **"บันทึกฉบับร่าง"** (`confirm: false`, persists whatever's filled in
   — same allowed-incomplete rule as the proposal draft above — stays `DRAFT`, safe to navigate away
   and come back to) and **"ยืนยัน — ขอสอบวิทยานิพนธ์"** (`confirm: true` — re-validated/re-resolved
   through the full `validatePeople`/`resolvePeople` pipeline, same as any other creation; flips to
   `IN_PROGRESS`, builds the 20 workflow steps, notifies admins). After confirming, the same
   `StudentSubmissionActions` view takes over. If there's no eligible completed proposal at all yet,
   a locked gray card explains that, followed by the "No defense" preview timeline (unchanged from
   before).

   **Draft save vs. confirm validation** (2026-09-08): both `save_proposal_draft` and
   `save_defense_draft` branch on `confirm` in `src/app/api/submissions/[id]/route.ts` — required-
   ness checks (non-empty title/program, an exam date/time present, a car plate when ที่จอดรถ is
   checked) only run when `confirm: true`; a plain save only rejects a value that's actually
   present but malformed (title/car-plate too long, an unparseable exam date, a bad `HH:MM` time).
   Committee people[] gets the same split: `confirm: true` still runs `validatePeople`/
   `resolvePeople` (`src/lib/committee.ts`) exactly as before — full role-count requirements, and
   an unresolvable email blocks the whole action — while `confirm: false` runs the new
   `validatePeopleLenient`/`resolvePeoplePartial` instead, which impose no role-count minimums at
   all (a row with no role or no account picked yet is simply skipped, not rejected) and never fail
   on an unresolvable email (silently dropped instead of blocking the save) — only an outright bad
   row (self-email, a duplicate role+account, a malformed email) is still rejected. Each committee
   field (`advisorId`, `headCommitteeId`, `committeeIds`, `coAdvisorIds`, `invitedCommitteeIds`,
   `programChairId`) is written as whatever resolved — `null`/`[]` for a role with no valid entry —
   since every one of those columns is already nullable/defaults-empty in the schema. Client-side, `ProposalDraftReview`/`DefenseDraftReview` mirror this with a separate
   `validateForSave()` (used by "บันทึกฉบับร่าง") alongside the existing strict `validate()` (used by
   "ยืนยัน") — `validateForSave()` only checks a value that was actually typed and is wrong (a
   malformed student phone, a past exam date), never requires a field to be filled in.
4. **"รายการอื่นๆ"** — every submission that isn't the current proposal or the current defense
   (cancelled ones, or an older one superseded by a newer current one of the same type), each in
   the original per-item row style (accent bar, status icon, mini progress bar, links to its detail
   page). Only rendered when non-empty. These still route through the standalone
   `/dashboard/student/[id]` page (see below) since they're history, not the active submission.

**`StudentSubmissionActions`** (`src/components/StudentSubmissionActions.tsx`, extracted 2026-09-07
from what used to be the whole body of `/dashboard/student/[id]/page.tsx`) — takes just
`{ submissionId }` and is the student's complete action surface for one submission: status banner
(DRAFT continue-draft checklist, CANCELLED, COMPLETED, REJECTED resubmit-with-reupload, "waiting
for admin finance upload", "ถึงคิวของท่านแล้ว"), linked proposal/defense cross-links, admin note,
`SubmissionInfoPanel`, progress bar + full `WorkflowTimeline`, file uploads via `FileUploader`, and
the cancel-request modal — every bit of it self-contained (its own local state), so multiple
instances can render side by side without interfering. `/dashboard/student/[id]/page.tsx` is now
just a thin wrapper (back-link + this component); `/student-dashboard`'s proposal/defense tabs
render it directly inline for the current submission of that type, with no wrapper page at all.

**`WorkflowTimeline`'s `preview` prop**: when true, no step is ever computed as "current" (no blue
ring/`Clock` icon/"กำลังดำเนินการ" badge on any step) even though every step's `status` is
`"PENDING"` — used only for the before-any-submission-exists step list (both tabs' true-empty
state), so nothing is shown as falsely in-progress.

**`SubmissionInfoPanel`** (`src/components/SubmissionInfoPanel.tsx`) — the read-only ข้อมูลนิสิต /
คณะกรรมการ / กำหนดการสอบ block, shared by `StudentSubmissionActions`, `DefenseDraftReview`'s
read-only student-info section, and the admin/faculty detail views, so every surface renders the
exact same info without duplicating the field logic. Takes `{ submission, users }`; renders nothing
if the submission has no student/committee/exam info at all.

**`SubmissionForms.tsx`** (`src/components/SubmissionForms.tsx`, extracted 2026-09-07 from what
used to be all of `/dashboard/student/submit/page.tsx`) — exports `ProposalForm` and `DefenseForm`
plus their shared building blocks (`Section`, `Field`, `CommitteePeopleEditor`,
`ExamLogisticsSection`, `ConfirmCheckbox`, `buildPeopleFromSubmission`, `validatePeopleClient`,
etc.). Both forms take `onCreated(sub)` instead of doing their own `router.push`, so the same
component works both inline (dashboard tab, closes the form on success) and on the standalone
`/dashboard/student/submit` page (still live — thin wrapper, navigates to the new submission's
detail page on success; `type=defense` still only reachable there, `type=proposal` is redundant
with the inline tab flow but not removed).
