<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

# Project: ระบบจัดการวิทยานิพนธ์ (Thesis Management System)

A role-based thesis approval workflow app. **Fully live** — Next.js 16 App Router, Prisma ORM → Supabase PostgreSQL, NextAuth v5 (credentials + magic-link login), file uploads to Supabase Storage. UI is in Thai.

## Stack & deployment
- **DB**: Prisma + `@prisma/adapter-pg` → Supabase PostgreSQL. Client in `src/lib/prisma.ts` (singleton always cached on `globalThis` — both dev and Vercel production).
- **Auth**: NextAuth v5, credentials (email + passcode, bcrypt against `User.passcodeHash`) plus one-time magic links in emails. `src/lib/auth.ts`. Login email is trimmed + lowercased before lookup. There is no self-registration and no self-service password reset — see "Account creation & passcodes" below.
- **Email**: SMTP via nodemailer in `src/lib/email.ts` (shared `sendMail()` helper) — `sendStepEmail()` on every step advance, `sendFinanceEmail()` at PROPOSAL step 3 and THESIS step 6 (called directly, not via HTTP). Emails go to real recipients. Sender: Office365/generic SMTP when `SMTP_USER`/`SMTP_PASS` are set (default host smtp.office365.com:587), else Gmail via `GMAIL_USER`/`GMAIL_APP_PASSWORD`. Each recipient gets a **per-user magic-link URL** (`/api/auth/magic?t=<token>`, `src/lib/email.ts:171-184`) rendered as plain link text (no styled button) that auto-logs them in and deep-links to their specific submission page; the token is not consumed on use (SafeLinks prefetch safety) and expires after 48h. Falls back to a plain `/login` link if token creation fails. The email body also mentions signing in with email+passcode as an alternative, which still works regardless.
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
DEMO_MODE             # "true" enables /api/auth/demo passwordless login; unset in production
NEXT_PUBLIC_DEMO_MODE # "true" enables the /demo page; unset in production
```

---

## Key facts

- **All API logic is in `src/app/api/`**. State is server-fetched; client state lives in `AppContext` which polls the API.
- Two submission types: **PROPOSAL** (11 steps) and **THESIS_DEFENSE** (22 steps). Step arrays: `PROPOSAL_ROLES` / `THESIS_ROLES` in `src/app/api/submissions/route.ts`.
- **Step names**: `PROPOSAL_STEP_NAMES` / `THESIS_STEP_NAMES` in `src/lib/utils.ts`. Always call `getStepName(stepOrder, submissionType)` — never access the maps directly.
- **EXAM_COMMITTEE, CO_ADVISOR, and INVITED_EXAM_COMMITTEE steps** track per-member decisions in `committeeActions` (JSON on `WorkflowStep`). All assigned members must approve, signing sequentially in list order, before the step advances. CO_ADVISOR steps are auto-SKIPPED at creation when `coAdvisorIds` is empty.
- **Required uploads gate**: Before a STUDENT step can advance, the student must upload specific form types. Enforced server-side in `PATCH /api/submissions/[id]` (action `"approve"`) and client-side in the student detail page.
  ```
  PROPOSAL:       step 1 → [BW1A, BW1B, FINANCE_ATTACH],  step 4 → [B1C, B1D, FINANCE_DOC]
  THESIS_DEFENSE: step 1 → [B2, B3, FINANCE_ATTACH],      step 9 → [SIGNED],   step 16 → [B4, THESIS]
  ```
  PROPOSAL step 4 requires both student docs AND admin FINANCE_DOC upload before student can advance. Admin uploads FINANCE_DOC via a yellow card shown on the admin panel whenever PROPOSAL step 4 is pending.
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
`/dashboard/admin/pending-professors` quick-create form. The field is pre-filled with a freshly
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
add-admin form, and `/dashboard/admin/pending-professors`'s quick-create form.

`formatUserName()` is threaded through every surface that displays a name from a live `User`
record: all dashboards, `SubmissionInfoPanel`, `RoleSubmissionDetail`, `WorkflowTimeline`,
`CommitteeSignPanel`, and `CommitteePeopleEditor`'s account-picker `<select>` — picking an account
there writes `formatUserName(account)` into that row's `Person.name`, so the title is baked into
`people[]`/`pendingPeople`/the auto-injected `PROGRAM_CHAIR` entry exactly as it would have been
before the split. It also covers every outgoing email (`src/lib/email.ts`'s recipient/greeting
names, `sendWelcomeEmail`/`sendPasscodeResetEmail`/`sendFinanceEmail`/`sendExamReminderEmail`) and
`WorkflowStep.actedByName`/committee-sign-action snapshots taken at approve/reject time
(`submissions/[id]/route.ts`, `submissions/[id]/sign/route.ts`). The logged-in user's own title
flows through the same NextAuth session/JWT pipeline as `roles`/`studentId` (`src/lib/auth.ts`,
`src/types/next-auth.d.ts`, plus the two routes that mint a session JWT by hand instead of going
through NextAuth's callbacks — `api/auth/magic` and `api/auth/demo`) into `AppContext`'s `user`.

**Deliberately not touched** — historical denormalized text snapshots that have no parallel title
column to go with them, so fixing this properly would mean new schema columns, not a display-layer
change: `Submission.studentFullName` (student-info snapshot taken at submission-creation time), and
any `pendingPeople[].name` entry recorded before that person had an account. (The invited-committee
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
  `GET /api/users`, `PATCH /api/users/[id]`, `auth.ts`'s `authorize()`, and the magic-link route.

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

ADMIN manages both from one **"ตั้งค่าระบบ"** tab on `/admin-dashboard` (third tab, alongside
"จัดการคำร้อง"/"จัดการผู้ใช้งาน") and standalone below `AdminUsersPanel` at
`/dashboard/admin/users` — both render `AdminSettingsPanel`
(`src/components/AdminSettingsPanel.tsx`, extracted 2026-09-07 from what used to be a card inside
`AdminUsersPanel`): 3 program-chair `<select>` rows (one per `ProgramType`, each a dropdown of
every PROFESSOR — picking one already assigned elsewhere shows "(เป็นประธานหลักสูตร X ด้วย)" as
information, not a warning, since it doesn't move them), and one finance-contact `<select>` row
(dropdown of every ADMIN account). Changing a row calls `POST /api/admin/program-chairs`
(`{ program, userId }`) or `POST /api/admin/finance-contact` (`{ userId }`), both ADMIN-only.
`AppContext.adminSetProgramChair(program, userId | null)` / `adminSetFinanceContact(userId | null)`
wrap these and refresh the user list.

On the admin submission-edit form (`src/app/dashboard/admin/[id]/page.tsx`, edit mode), "ประธาน
หลักสูตร" is **not** a free `<select>` — it's a read-only value auto-resolved from whichever
professor chairs the edit draft's currently-selected "หลักสูตร" field, recomputed live as that field
changes. An admin can no longer set an arbitrary professor as one submission's program chair from
this form; to change it they reassign the program-level chair via "ตั้งค่าระบบ" instead. Saving the
edit writes that resolved id (or `null` if the program has no chair assigned) as `programChairId`.

### Committee accounts must pre-exist — DRAFT + admin approval (unified creation route 2026-09-07)
Every person named in `people[]` (both PROPOSAL creation and defense committee edits) must already
have an account — the API no longer auto-creates one. Validation/resolution lives in
`src/lib/committee.ts` (`validatePeople` for shape/role-count checks, `resolvePeople` for the
account lookup — it never creates a user). If any email doesn't resolve, `POST /api/submissions`
saves the submission as `status: "DRAFT"` with the raw entries in `pendingPeople` (JSON) and
**no workflow steps** — nothing is created until it's resolved. All admins are notified.

An ADMIN resolves these directly from `AdminUsersPanel` (`src/components/AdminUsersPanel.tsx`,
both `/admin-dashboard`'s "จัดการผู้ใช้งาน" tab and the standalone `/dashboard/admin/users`): every
unresolved committee email — grouped by email across all DRAFT submissions, since the same person
may be named on several — renders as an amber card **at the top of the user list itself** (not a
separate page), each with one "เพิ่มผู้ใช้" button. Clicking it opens the exact same "เพิ่มผู้ใช้งาน"
modal used to create any account, pre-filled with that person's name/email and role defaulted to
PROFESSOR — creation goes through the same `POST /api/users` route as any other new user (see
"Account creation & passcodes" above), so the "notify any student whose draft this was blocking"
check now lives server-side in that one route rather than a dedicated endpoint. The standalone
`/dashboard/admin/pending-professors` page (still linked from the `/admin-dashboard` submissions
tab's amber task card, and from the always-visible "รอสร้างบัญชีให้อาจารย์/กรรมการ" list) still
works as an alternate entry point, calling the same `superAdminAddUser`/`POST /api/users` path.
Once every person on a draft has an account, the resolved student is notified, and must return and
call `action: "continue_draft"` (their own explicit action — nothing auto-finalizes) to resolve the
committee fields, build the workflow steps (`src/lib/workflowSteps.ts`), and flip the submission to
`IN_PROGRESS`. **`continue_draft` only fills in fields still unset on the row** — it never
overwrites a committee field an ADMIN already set directly via the submission edit form while the
row sat in DRAFT (see `src/app/api/submissions/[id]/route.ts`'s `continue_draft` handler); the
distinguishing signal is `pendingPeople` being empty/null vs. carrying entries, not the row's other
committee-field values.

### Cancellation — student requests, ADMIN accepts or declines
`action: "request_cancel"` (student-only) no longer cancels immediately — it sets
`cancelRequested: true` + `cancelRequestedAt` and notifies all admins. The submission's own
`status` is untouched. While a request is pending, **every other action is frozen**: a top-level
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

### Step 1 is NOT auto-approved
When a submission is created, **step 1 starts as PENDING**. The student must upload the required documents and click submit. Step 2's email notification fires automatically when the student's submit action (approve) completes.

### Rejection stays on the step — student must resubmit
`PATCH action "reject"` and `POST /sign decision "REJECTED"`: the current PENDING step is marked `REJECTED` and the submission status becomes `REJECTED`. The workflow does NOT move. While `REJECTED`, both `approve` and a second `reject` return 400 ("รอนักศึกษายืนยันการแก้ไขก่อน"). The student fixes documents and calls `action "resubmit"` (student-only) — this resets **only the rejected step** to PENDING (clears actedAt/notes/committeeActions), sets status `IN_PROGRESS`, and the same reviewer re-reviews from the same step. Any involved role can reject; admin rejections require a notes comment (enforced UI + API).

### Send-back (ส่งกลับ) goes back ONE step — admin only
`PATCH action "return_to_prev"` (ADMIN only — SUPER_ADMIN has no submission access): resets **both the current PENDING step and the nearest preceding non-SKIPPED step** to `PENDING` (clear actedAt/notes/committeeActions), status stays `IN_PROGRESS`, and the previous role is notified to act again. Returns 400 on the first step.

**Critical**: the sent-back current step must be reset to `PENDING`, never `REJECTED` — the approve flow only advances through PENDING steps, so a step left `REJECTED` here gets skipped forever once the previous role re-approves (bug found and fixed 2026-07-14 via E2E test).

### Reject button (ปฏิเสธ)
The reject button is embedded directly inside `SignatureButton` and `CommitteeSignPanel` — **no separate send-back panel exists**. Clicking ปฏิเสธ calls `action: "reject"`, which marks the current step `REJECTED` — it stays on that same step, it does NOT move backward (see "Rejection stays on the step" above; that is what ส่งกลับ/`return_to_prev` does, and it's admin-only). There is no standalone "ส่งกลับขั้นตอนก่อนหน้า" panel (it was removed as redundant) — ส่งกลับ is reached via the admin-only `return_to_prev` action instead.

### Document versioning — one slot per formType (ALL types)
**Every** form type — including SIGNED — has a single display slot in `FileList`: latest upload is the current version, older uploads collapse under "ประวัติ". No formType is shown as individual files anymore. **`SIGNED` always means แบบรายงานการเสนอผลงานฯ** (the student report chain: admin step 8 → student step 9 → advisor step 10); the other faculty-return docs have their own types (EXAM_RESULT, INVITE_LETTER, VERY_GOOD_EVAL, FINANCE_DOC — see `FACULTY_SLOTS` in admin detail page). **Non-student roles upload with the correct `formType`** so their signed copy replaces the slot's latest version.

### Upload formType for signing roles
`SignatureButton` and `CommitteeSignPanel` both accept `formsToShow?: string[]`. When `formsToShow` contains non-SIGNED form types, the upload is saved with that formType (versioning the correct slot). Falls back to `"SIGNED"` only when `formsToShow` is empty or contains only `"SIGNED"`.

### Download filtering — STEP_SIGN_FORMS
`RoleSubmissionDetail` computes `formsToShow` from `STEP_SIGN_FORMS` so each role sees only the documents relevant to their step. Passed to both `SignatureButton` and `CommitteeSignPanel`.

```
PROPOSAL:       3→[BW1A]  5→[B1C]  6→[B1C]  7→[B1C]  8→[B1C]  9→[B1C]  11→[B1C,B1D]
                (steps 2, 10 are ADMIN approve-only — no signing, not in this map)
THESIS_DEFENSE: 2→[B3]  3→[B2]  4→[B2]  5→[B2]  6→[B2]
                (steps 7, 8 are ADMIN relay/upload-only — no signing, not in this map)
                10→[SIGNED,EXAM_RESULT]  11→[EXAM_RESULT]  12→[EXAM_RESULT]  13→[EXAM_RESULT]  14→[EXAM_RESULT]  15→[EXAM_RESULT]
                17→[B4]  18→[THESIS]  19→[THESIS]  20→[THESIS]  21→[THESIS]  22→[THESIS]
```

### Admin dashboard (`src/app/admin-dashboard/page.tsx`) — ADMIN's landing page
`/dashboard/admin` (old path) now just redirects here. `src/app/dashboard/admin/[id]/page.tsx`
(submission detail) and `src/app/dashboard/admin/pending-professors/page.tsx` still live under the
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
     always sort first, then PENDING-on-ADMIN steps, then the PROPOSAL step-4 finance-upload task;
     each card links directly to the submission
   - **"รอสร้างบัญชีให้อาจารย์/กรรมการ"** amber count card — only shown when any DRAFT submission
     has an unresolved `pendingPeople` email; links to `/dashboard/admin/pending-professors`
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
     "ลบ" confirmation), not from the list row.
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
| Super Admin | ผู้ดูแลระบบสูงสุด | Landing page `/super-dashboard`. Account/user management restricted to the **SUPER_ADMIN/ADMIN tier only** — create/edit/delete SUPER_ADMIN or ADMIN accounts, reset their passcodes. **Cannot** touch STUDENT/PROFESSOR accounts (that's ADMIN's job) and has **zero submission workflow access** — cannot approve, reject, override, upload to, or otherwise act on any submission. As of 2026-09-06 it CAN view (read-only oversight, not act on) a full directory of every account including STUDENT/PROFESSOR via `GET /api/super-admin/users`, and a full list of every submission via `GET /api/super-admin/submissions` (no detail-page link, no actions); the older counts-only `GET /api/super-admin/stats` was removed as redundant once these two list endpoints shipped |
| Admin | เจ้าหน้าที่ภาควิชา (พี่โบ้) | Landing page `/admin-dashboard`. Owns the entire submission workflow exclusively — approve/reject/override steps, relay documents to Faculty, forward docs to Student, create the missing accounts for a committee person named on a DRAFT submission (`/dashboard/admin/pending-professors`), accept/decline student cancellation requests. Account management covers **ADMIN/PROFESSOR/STUDENT** (shares the ADMIN tier with SUPER_ADMIN, but not SUPER_ADMIN accounts) via `/dashboard/admin/users` |
| Student | นิสิต | Landing page `/student-dashboard`. Starts with a PROPOSAL (only one active at a time — cancel to start over); creates a THESIS_DEFENSE by importing/editing the committee from a COMPLETED proposal. Upload documents, assign committee members (must already have accounts, else the submission is a DRAFT pending admin approval), request cancellation (ADMIN must accept), track status |
| Advisor | อาจารย์ที่ปรึกษา | Sign forms, monitor assigned students |
| Co-Advisor | อาจารย์ที่ปรึกษาร่วม | Signs immediately after Advisor at every Advisor step — **optional**, step auto-SKIPPED when no co-advisors assigned; multiple allowed (sequential like EXAM_COMMITTEE) |
| Program Chair | ประธานหลักสูตร | Sign at multiple phases — **assigned per submission by Student** (`submissions.programChairId`); falls back to whichever PROFESSOR an ADMIN has designated ประธานหลักสูตร **for that submission's program** (`SystemSetting` key `programChair:<program>` — a professor may chair more than one program, see "Program Chair & finance-contact assignment" below) |
| Head Exam Committee | ประธานกรรมการสอบ | Signs before regular committee — assigned per submission by Student |
| Exam Committee | กรรมการสอบ | Multiple members, sign separately in order — assigned per submission by Student |
| Invited Exam Committee | กรรมการภายนอก | External examiner(s) — one or more, sign separately in order (sequential like EXAM_COMMITTEE); assigned per submission by Student, selected from existing `EXTERNAL`-role accounts only (see "Committee people" below, "Multiple external committee members" further down, and "EXTERNAL account requests" further down) |

### External roles (no login)
| Role | How they interact |
|---|---|
| Faculty Dean | Signs บ.4 physically offline |
| Finance | Receives email at PROPOSAL step 3 and THESIS step 6 (with FINANCE_ATTACH attached) |
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
selection is conveyed by the placeholder option text). ADVISOR/HEAD_EXAM_COMMITTEE pick from every
`PROFESSOR`-role account only; INVITED_EXAM_COMMITTEE (กรรมการภายนอก) picks from every `EXTERNAL`-
role account only (see "EXTERNAL account requests" below for how those get created).
**CO_ADVISOR and EXAM_COMMITTEE pick from both lists combined** (2026-09-08) — either role is
commonly filled by an external examiner as well as an internal faculty member, so their dropdown
offers every `PROFESSOR` account followed by every `EXTERNAL` account (`MIXED_ROLES` in
`CommitteePeopleEditor`, `src/components/SubmissionForms.tsx`; `EXTERNAL_ONLY_ROLES` still gates
INVITED_EXAM_COMMITTEE to externals-only). Server-side this needed no change at all —
`resolvePeople`/`resolvePeoplePartial` (`src/lib/committee.ts`) only look up an account by email,
never checking its `Role`, so a CO_ADVISOR/EXAM_COMMITTEE entry resolving to an `EXTERNAL` account
was already accepted. Picking an account fills `{name, email, phone}` from it, but the row no longer displays
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
`DRAFT`/`pendingPeople` fallback (see "Committee accounts must pre-exist" above) still exists as
defense-in-depth. **PROGRAM_CHAIR is
never a row in this editor at all** — the student's own account-level `Role` for creating a
submission has nothing to do with it; instead `resolveProgramChair()`/`ProgramChairAutoField`
auto-resolve and display (read-only) whichever `PROFESSOR`'s `programChairFor` array includes the
selected/inherited program, and the chair is injected into the submitted `people[]` right before
validation — same fallback mechanism as "Program Chair assignment" below, just applied at
creation time instead of only in the admin edit form. Submitting is blocked client-side with a
Thai error if no chair is assigned for that program yet. For a THESIS_DEFENSE this list is
prefilled from the source proposal's committee (`buildPeopleFromSubmission`, which also excludes
PROGRAM_CHAIR) but remains fully editable (see "Proposal-first" above). The same email may hold
multiple roles (one account); committee id arrays are deduped — duplicates would break sequential
signing.

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
...externals]`) list, mirroring `CommitteePeopleEditor`'s `MIXED_ROLES`: อาจารย์ที่ปรึกษาร่วม
(CO_ADVISOR) and กรรมการสอบ (EXAM_COMMITTEE) now list both PROFESSOR and EXTERNAL accounts,
กรรมการภายนอก ในระบบ now lists EXTERNAL accounts only (previously PROFESSOR-only, so an admin could
never actually select an external examiner there at all), and อาจารย์ที่ปรึกษา/ประธานกรรมการสอบ
stay PROFESSOR-only same as before.

**Validation (enforced in form AND API):** ADVISOR exactly 1 · PROGRAM_CHAIR exactly 1 (auto-injected, never a user-facing row — see "Committee people" above) · HEAD_EXAM_COMMITTEE exactly 1 · EXAM_COMMITTEE ≥1 · INVITED_EXAM_COMMITTEE ≥1 (multiple external committee members allowed — see "Multiple external committee members" below) · CO_ADVISOR 0+. Every person's email must pass `isValidEmail()` (a typo'd email would create an account whose passcode email goes nowhere); a person's email may not equal the student's own email; duplicate email-in-same-role rows are rejected. The form shows a live checklist chip per required role (excluding PROGRAM_CHAIR, which has its own read-only auto-resolved display instead). วันที่สอบ + เวลาสอบ required; title-confirmation checkbox before submit.

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
  role). The admin submission-edit form (`AdminSubmissionPanel`) gained 3 กรรมการภายนอก dropdown
  slots (was 1 dropdown + 4 free-text fields), matching its existing 3-slot อาจารย์ที่ปรึกษาร่วม/
  กรรมการสอบ pattern. Every display surface that used to show one invited-committee name
  (`WorkflowTimeline`, `SubmissionInfoPanel`, `RoleSubmissionDetail`, `AdminSubmissionPanel`) now
  lists all of them, comma-joined or one row per member — same convention already used for
  `coAdvisorIds`/`committeeIds`.
- **Email**: `sendStepEmail`'s recipient resolution folds `INVITED_EXAM_COMMITTEE` into the same
  branch as `EXAM_COMMITTEE`/`CO_ADVISOR` (a `specificMemberId` for the sequential in-turn email, or
  first-member fallback); a new `allMembers` option broadcasts to every member at once, used for the
  THESIS_DEFENSE step-8 invitation-letter email (every invited examiner gets it, not just whoever
  signs first). `sendFinanceEmail`'s `FinanceEmailData.invitedProfs` is now an array of
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

### PROPOSAL (11 steps)

#### Phase 1 (Steps 1–3): บ.วศ.1ก + บ.วศ.1ข
| Step | Role | Action |
|------|------|--------|
| 1 | STUDENT | Upload BW1A (บ.วศ.1ก) + BW1B (บ.วศ.1ข) + FINANCE_ATTACH — **starts PENDING, student must submit** |
| 2 | ADMIN | Review and approve |
| 3 | PROGRAM_CHAIR | Sign บ.วศ.1ก → **triggers finance email** |

#### Phase 2 (Steps 4–11): บ.วศ.1ค + บ.วศ.1ง
| Step | Role | Action |
|------|------|--------|
| 4  | STUDENT | Upload B1C (บ.วศ.1ค) + B1D (บ.วศ.1ง) |
| 5  | HEAD_EXAM_COMMITTEE | Sign บ.วศ.1ค |
| 6  | ADVISOR | Sign บ.วศ.1ค |
| 7  | CO_ADVISOR | Sign บ.วศ.1ค — **auto-SKIPPED if no co-advisors assigned** |
| 8  | INVITED_EXAM_COMMITTEE | Sign บ.วศ.1ค |
| 9  | EXAM_COMMITTEE | All members sign บ.วศ.1ค + บ.วศ.1ง (sequential) |
| 10 | ADMIN | Verify and approve |
| 11 | PROGRAM_CHAIR | Sign บ.วศ.1ค + บ.วศ.1ง |

If rejected, the step stays `REJECTED` (does not move) until the student resubmits — see "Rejection stays on the step" above. ส่งกลับ (admin-only) is the separate action that moves back one step (e.g. step 9 → step 8).

---

### THESIS_DEFENSE (22 steps)

#### Phase 3 (Steps 1–6): บ.2 + บ.3
| Step | Role | Action |
|------|------|--------|
| 1 | STUDENT | Upload B2 (บ.2) + B3 (บ.3) + FINANCE_ATTACH — **starts PENDING, student must submit** |
| 2 | EXAM_COMMITTEE | All members sign บ.3 (sequential) |
| 3 | ADVISOR | Sign บ.2 |
| 4 | CO_ADVISOR | Sign บ.2 — **auto-SKIPPED if no co-advisors assigned** |
| 5 | HEAD_EXAM_COMMITTEE | Sign บ.2 |
| 6 | PROGRAM_CHAIR | Sign บ.2 → **triggers finance email** + admin bell notification (admin gets exactly ONE email — the general next-step notify; the special step-6 block only creates bell notifications, its duplicate `sendStepEmail` was removed 2026-07-24) |

#### Phase 4 (Steps 7–8): Faculty relay
| Step | Role | Action |
|------|------|--------|
| 7 | ADMIN | Collect B2+B3, send to Faculty, approve to confirm delivery → triggers notify admin for step 8 |
| 8 | ADMIN | Receive docs back from Faculty, upload (formType: SIGNED × multiple), forward to Student, then approve → triggers invitation emails |

Faculty returns: ใบรายงานผลการสอบ, แบบรายงานฯ, invitation letter, แบบประเมิน "วิทยานิพนธ์ดีมาก" (Very Good only). Step 8 requires **all 4** document types uploaded — SIGNED, EXAM_RESULT, INVITE_LETTER, FINANCE_DOC (see `FACULTY_SLOTS` in the admin detail page) — before admin can approve (server-gated).

#### Phase 5 (Steps 9–15): Post-defense signing
| Step | Role | Action |
|------|------|--------|
| 9  | STUDENT | Fill info and sign แบบรายงานการเสนอผลงานฯ then upload (formType: SIGNED) |
| 10 | ADVISOR | Sign แบบรายงานฯ + ใบรายงานผลการสอบ |
| 11 | CO_ADVISOR | Sign ใบรายงานผลการสอบ — **auto-SKIPPED if no co-advisors assigned** |
| 12 | HEAD_EXAM_COMMITTEE | Sign ใบรายงานผลการสอบ |
| 13 | EXAM_COMMITTEE | All members sign ใบรายงานผลการสอบ (sequential) |
| 14 | INVITED_EXAM_COMMITTEE | Sign ใบรายงานผลการสอบ |
| 15 | PROGRAM_CHAIR | Sign ใบรายงานผลการสอบ |

#### Phase 6 (Steps 16–22): Thesis submission + cover signing
| Step | Role | Action |
|------|------|--------|
| 16 | STUDENT | Upload B4 + THESIS (from e-thesis system, with barcode) |
| 17 | PROGRAM_CHAIR | Sign บ.4 |
| 18 | ADVISOR | Sign thesis cover (3 points) |
| 19 | CO_ADVISOR | Sign thesis cover — **auto-SKIPPED if no co-advisors assigned** |
| 20 | HEAD_EXAM_COMMITTEE | Sign thesis cover |
| 21 | EXAM_COMMITTEE | All members sign thesis cover (sequential) |
| 22 | INVITED_EXAM_COMMITTEE | Sign thesis cover |

If rejected, the step stays `REJECTED` (does not move) until the student resubmits. ส่งกลับ (admin-only) is the separate action that moves back one step.

---

## Key rules
- **Sequential only** — no parallel signing
- **EXAM_COMMITTEE, CO_ADVISOR, and INVITED_EXAM_COMMITTEE** steps: all assigned members must approve, sequentially in list order (tracked via `committeeActions` JSON on `WorkflowStep`, same sequential-sign mechanism `sign/route.ts` and `CommitteeSignPanel` already use). CO_ADVISOR uses `coAdvisorIds`, EXAM_COMMITTEE uses `committeeIds`, INVITED_EXAM_COMMITTEE uses `invitedCommitteeIds` — all three are DB field `String[]` and support any number of members (≥1 for INVITED_EXAM_COMMITTEE/EXAM_COMMITTEE, 0+ for CO_ADVISOR). See "Multiple external committee members" below.
- **CO_ADVISOR auto-skip**: when `coAdvisorIds` is empty at submission creation, all CO_ADVISOR steps are created with `status: "SKIPPED"` so they are transparently bypassed.
- **PROGRAM_CHAIR resolution**: always prefer `sub.programChairId` (per-submission, set from the student's people list) and fall back to whichever PROFESSOR's `programChairFor` array includes `sub.program` (see "Program Chair & finance-contact assignment" above — no holder means no fallback recipient; since a professor may now chair more than one program, this is an `.includes()` check, not `===`). Applied in `email.ts`, notifyRole + approve auth in `PATCH /api/submissions/[id]`, `GET /api/submissions` (list-scoping), the sign route, exam-reminder cron, both upload routes, `AppContext`, `RoleSubmissionDetail`, `WorkflowTimeline`, professor dashboard, and display-name lookups.
- **Finance email** fires at PROPOSAL step 3 and THESIS_DEFENSE step 6 (both PROGRAM_CHAIR approvals), called directly via `sendFinanceEmail()` with the latest FINANCE_ATTACH file attached; recipient = the ADMIN designated as finance contact (`SystemSetting` key `financeContact`, set via "ตั้งค่าระบบ" → `AdminSettingsPanel`), falling back to the `FINANCE_EMAIL` env var if none is set (skips entirely if neither exists).
- **Rejection emails** use a red formal template (`buildRejectedHtml`) showing step + reason. `step.notes` stores only the raw reason text (or null) — role context lives in notification messages only. **Admin reject requires a comment** (enforced UI + API); other roles may reject without one.
- **SUPER_ADMIN has zero submission workflow access** — cannot approve, reject, override, upload to, or otherwise act on any submission (no detail-page views either — `src/app/dashboard/admin/[id]` stays ADMIN-only). That responsibility belongs exclusively to ADMIN. It does have read-only oversight: a full user directory (incl. STUDENT/PROFESSOR) via `GET /api/super-admin/users`, and a full submission list via `GET /api/super-admin/submissions` (both SUPER_ADMIN-only, view-only; the older counts-only `GET /api/super-admin/stats` was removed once these shipped) — but account *management* of STUDENT/PROFESSOR/ADMIN stays exclusively ADMIN's (SUPER_ADMIN can only create/edit/delete SUPER_ADMIN/ADMIN accounts, per `src/lib/accountScope.ts`).
- **Account-management tiers** (`src/lib/accountScope.ts`, shared by `PATCH`/`DELETE /api/users/[id]` and `POST /api/users`): a SUPER_ADMIN-tier account (has `SUPER_ADMIN` role) is manageable only by SUPER_ADMIN; an ADMIN-tier account is manageable by SUPER_ADMIN or ADMIN; a STUDENT/PROFESSOR account is manageable by ADMIN only. `GET /api/users` scopes the returned list the same way per caller, so SUPER_ADMIN's `users` never contains STUDENT/PROFESSOR rows and ADMIN's never contains SUPER_ADMIN rows.
- **A user with any submission history cannot be deleted** — `DELETE /api/users/[id]` is a hard delete
  with no cascade for `Submission.studentId`/`advisorId`, `FormUpload.uploadedById`,
  `Signature.userId`, or `WorkflowStep.actedById` (all reference `User` without `onDelete: Cascade`,
  deliberately — deleting an account must never silently destroy thesis records). Deleting a
  student/professor who has ever submitted, uploaded, signed, or acted on a step now fails fast with
  a `409` and a clear Thai message instead of an unhandled Prisma FK error surfacing as a bare `500`
  (`src/app/api/users/[id]/route.ts` catches `Prisma.PrismaClientKnownRequestError` code `P2003`).
- **Admin (พี่โบ้)** relays at THESIS_DEFENSE steps 7–8 — step 7: send B2+B3 to Faculty; step 8: receive back docs (ใบรายงานผล, แบบรายงานฯ, invitation letter), upload, forward to student, then approve → triggers invitation emails. Admin panel shows step-7-specific checklist banner.
- **Student upload steps** start PENDING; student uploads required files then clicks submit to advance
- **Rejection** stays on the same step (marked `REJECTED`) until the student resubmits — it does NOT move back a step. Any role can reject, no role restriction. (ส่งกลับ/`return_to_prev`, admin-only, is the separate action that actually moves back one step.)
- **One active proposal per student, defense created from a completed one** — a new PROPOSAL is blocked while an existing one is anything other than `CANCELLED`; a THESIS_DEFENSE requires a `COMPLETED`, non-cancelled source proposal (`sourceProposalId`) and imports (editable, independent copy) its committee. See "Proposal-first" above.
- **Every committee person must already have an account** — `POST /api/submissions` never auto-creates one; an email that doesn't resolve saves the submission as `DRAFT` (`pendingPeople` JSON, no workflow steps) until an ADMIN creates the account (one click from the top of `AdminUsersPanel`'s user list, or via `/dashboard/admin/pending-professors`) and the student calls `continue_draft`. See "Committee accounts must pre-exist" above.
- **Cancellation is a two-step admin-gated request**, not an immediate student action — `request_cancel` only sets `cancelRequested` and freezes all other actions on that submission; only ADMIN's `accept_cancel`/`decline_cancel` actually resolves it. See "Cancellation — student requests, ADMIN accepts or declines" above.

## UI conventions (recent)
- **FileList** takes a `submissionType` prop and groups uploads into phase-aware sections. PROPOSAL: เอกสารหลัก (BW1A/BW1B/B1C/B1D) / เอกสารการเงิน / เอกสารอื่นๆ. THESIS_DEFENSE: บ.2+บ.3 (B2/B3/FINANCE_ATTACH) / เอกสารการเงิน (FINANCE_DOC) / เอกสารจากคณะและผลการสอบ (SIGNED/EXAM_RESULT/INVITE_LETTER/VERY_GOOD_EVAL) / วิทยานิพนธ์ (B4/THESIS). See `FILE_GROUPS_PROPOSAL` / `FILE_GROUPS_THESIS` in `FileList.tsx`. Unknown types fall into the last section. Row labels are always Thai form names (FORM_SHORT primary, full FORM_LABELS as subtitle) — never raw filenames as titles. FileList shows its own file count in the header; callers must NOT add another count to the `title` prop.
- **THESIS step 9 downloads**: the student page shows a download card listing admin's step-8 SIGNED files (those uploaded at/before step 8's `actedAt`) so the student can download แบบรายงานฯ, fill + sign, and re-upload. Files newer than step 8's `actedAt` count as the student's own upload (`effectiveUploads` filter).
- **FileUploader** slots always render a `SlotHeader`: form-code badge (FORM_SHORT) + description + status chip (อัปโหลดแล้ว / เลือกไฟล์แล้ว / ยังไม่ได้เลือกไฟล์).
- **Professor dashboard** shows the generic "อาจารย์" label on card badges (a professor can hold several roles per submission); other views keep specific role labels.
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
- ADMIN's `/dashboard/admin/[id]` and `/dashboard/admin/pending-professors` already had their own
  back-links. `/dashboard/admin/users` did not — a "ย้อนกลับ" link was added there — and its only
  entry point (the old "ผู้ใช้งานในระบบ" nav link) was replaced with a persistent card on
  `/admin-dashboard` itself (right under the header), same pattern as the existing
  "รอสร้างบัญชีให้อาจารย์/กรรมการ" card.

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
   (`grid grid-cols-3 gap-2`, same tab-bar pattern as `/admin-dashboard`), switching a
   `useState<"proposal" | "defense" | "external">`. The third tab renders `StudentExternalRequests`
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
   info at all — told apart from the legacy pendingPeople/missing-accounts DRAFT flavor the same
   way an auto-draft defense is (`status === "DRAFT" && no pendingPeople entries`, see
   `isAutoDraftProposal()` in `student-dashboard/page.tsx`). Once that row exists,
   `ProposalDraftReview` (`src/components/ProposalDraftReview.tsx`, mirrors `DefenseDraftReview`)
   takes over as the actual editable form — title/program/student phone/committee/exam logistics,
   all editable, "บันทึกฉบับร่าง" (`PATCH .../[id]` action `"save_proposal_draft"`, `confirm: false`,
   stays `DRAFT`) or "ยืนยัน — ขอสอบโครงร่างวิทยานิพนธ์" (`confirm: true` — builds the 11 workflow
   steps, flips to `IN_PROGRESS`, notifies admins). **A plain save is deliberately allowed to be
   incomplete** (2026-09-08) — blank title, no program picked, no committee members chosen yet, no
   exam date/time — since the whole point of a draft is to let the student leave and come back
   later; only a value that's actually filled in but outright wrong (e.g. a malformed phone number,
   an exam date in the past) is rejected either way. Only `confirm: true` enforces the full
   requirements (see "Draft save vs. confirm validation" below). The "ความคืบหน้าปัจจุบัน (0/11)" preview
   + `WorkflowTimeline` (`preview` prop, see below) stay visible under both the blank template *and*
   `ProposalDraftReview` — nothing has actually progressed yet in either state, since no workflow
   steps exist until confirm — and only disappear once a real (non-draft) proposal exists, at which
   point the whole block is just `<StudentSubmissionActions submissionId={...} />` (see below),
   which renders the real timeline itself — no separate read-only summary.
3. **Defense tab**: no manual "create" entry point — the moment the tab is opened with an eligible
   `COMPLETED` proposal (and no existing non-cancelled defense), a `useEffect` fires
   `getOrCreateDefenseDraft()` (`POST /api/submissions/auto-draft-defense`, get-or-create,
   idempotent) which creates a `THESIS_DEFENSE` row directly in `DRAFT` status with every
   committee/student field **imported straight onto the row** from the proposal (never through
   `pendingPeople` — it's already resolved, so this is a different DRAFT flavor from the
   missing-accounts one; see "Committee accounts must pre-exist" above for how the two are told
   apart). While loading, a spinner card shows "กำลังเตรียมคำร้องขอสอบวิทยานิพนธ์...". Once created,
   `isAutoDraftDefense(sub)` (`status === "DRAFT" && no pendingPeople entries`) routes to
   `DefenseDraftReview` (`src/components/DefenseDraftReview.tsx`) instead of
   `StudentSubmissionActions` — editable title/committee-people-editor/exam-logistics (all
   pre-filled, all still editable — the imported committee never writes back to the source
   proposal), with two actions both hitting `PATCH .../[id]` action `"save_defense_draft"`
   (`{ ...fields, confirm }`): **"บันทึกฉบับร่าง"** (`confirm: false`, persists whatever's filled in
   — same allowed-incomplete rule as the proposal draft above — stays `DRAFT`, safe to navigate away
   and come back to) and **"ยืนยัน — ขอสอบวิทยานิพนธ์"** (`confirm: true` — re-validated/re-resolved
   through the full `validatePeople`/`resolvePeople` pipeline, same as any other creation; flips to
   `IN_PROGRESS`, builds the 22 workflow steps, notifies admins). After confirming, the same
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
