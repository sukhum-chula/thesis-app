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
FINANCE_EMAIL         # recipient for finance notifications
CRON_SECRET           # guards /api/cron/exam-reminders; unset makes the endpoint publicly callable.
                      # Vercel's own Cron scheduler (see vercel.json) sends the matching Bearer header
                      # automatically when this is set in the project.
DEMO_MODE             # "true" enables /api/auth/demo passwordless login; unset in production
NEXT_PUBLIC_DEMO_MODE # "true" enables the /demo page; unset in production
EMAIL_OVERRIDE_TO     # testing: when set, ALL emails go to this address instead of real recipients
                      # (subject gets "[ถึง: <intended>]" suffix). Set on Preview/Development, unset on
                      # Production, so test/preview deploys can never email real students or faculty.
```

---

## Key facts

- **All API logic is in `src/app/api/`**. State is server-fetched; client state lives in `AppContext` which polls the API.
- Two submission types: **PROPOSAL** (11 steps) and **THESIS_DEFENSE** (22 steps). Step arrays: `PROPOSAL_ROLES` / `THESIS_ROLES` in `src/app/api/submissions/route.ts`.
- **Step names**: `PROPOSAL_STEP_NAMES` / `THESIS_STEP_NAMES` in `src/lib/utils.ts`. Always call `getStepName(stepOrder, submissionType)` — never access the maps directly.
- **EXAM_COMMITTEE and CO_ADVISOR steps** track per-member decisions in `committeeActions` (JSON on `WorkflowStep`). All assigned members must approve before the step advances. CO_ADVISOR steps are auto-SKIPPED at creation when `coAdvisorIds` is empty.
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

### Account creation & passcodes — admin-only, system-generated (2026-09-07)
There is **no self-registration** — `/register` is a static "contact the department" page, and
`POST /api/auth/register` / `POST /api/auth/forgot-password` no longer exist. The only ways an
account gets created are: an ADMIN/SUPER_ADMIN via `POST /api/users` (`AdminUsersPanel`,
super-dashboard), or an ADMIN approving a committee person named on a DRAFT submission via
`POST /api/admin/pending-professors` (see below). Both always call `generatePassword()`
(`src/lib/utils.ts` — 6 chars, pattern `A00a00`: 1 capital, 4 digits, 1 lowercase, excluding
visually-ambiguous characters) server-side and email the result via `sendWelcomeEmail` — there is
no path where a client-supplied password is accepted or stored.

The credential is called a **passcode** (รหัสเข้าใช้งาน) everywhere user-facing, not a password —
users cannot set or change their own; `User.passcodeHash` (renamed from `passwordHash`) is the only
field. Only ADMIN/SUPER_ADMIN can reset one, via `PATCH /api/users/[id]` with `{ resetPasscode:
true }` (see `UserDetailPanel`'s and `/super-dashboard`'s reset-confirm buttons) — this ignores any
other body field for the password itself, generates a fresh passcode, hashes it, and emails it via
`sendPasscodeResetEmail` (renamed from `sendForgotPasswordEmail`, reworded since the reset is now
always admin-initiated rather than user-requested). `AppContext`'s `superAdminAddUser` takes no
password argument and `superAdminResetPasscode(userId)` takes no new-passcode argument — the server
is always the one generating it.

### Committee accounts must pre-exist — DRAFT + admin approval
Every person named in `people[]` (both PROPOSAL creation and defense committee edits) must already
have an account — the API no longer auto-creates one. Validation/resolution lives in
`src/lib/committee.ts` (`validatePeople` for shape/role-count checks, `resolvePeople` for the
account lookup — it never creates a user). If any email doesn't resolve, `POST /api/submissions`
saves the submission as `status: "DRAFT"` with the raw entries in `pendingPeople` (JSON) and
**no workflow steps** — nothing is created until it's resolved. All admins are notified.

An ADMIN reviews unresolved emails on `/dashboard/admin/pending-professors` (also surfaced as a
count card on `/admin-dashboard`) and creates the missing account(s) there
(`POST /api/admin/pending-professors`) — same welcome-email flow as before, just admin-triggered.
Once every person on a draft has an account, the endpoint notifies that draft's student, who must
return and call `action: "continue_draft"` (their own explicit action — nothing auto-finalizes) to
resolve the committee fields, build the workflow steps (`src/lib/workflowSteps.ts`), and flip the
submission to `IN_PROGRESS`.

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

**Two full-width tabs** (added 2026-09-06, `useState<"submissions" | "users">`, `grid grid-cols-2
gap-2` so both buttons split the width equally), rendered inside one shared frame
(`bg-white rounded-2xl border border-gray-200 p-4 sm:p-6 max-h-[75vh] overflow-y-auto` — the
`max-h`+`overflow-y-auto` keeps a long list's scrollbar contained inside the frame instead of on
the outer page, which used to shift the whole layout when the browser's own scrollbar appeared):

1. **จัดการคำร้อง (submissions)** — default tab, everything the page used to show top-to-bottom:
   - **"งานที่ต้องดำเนินการ"** orange task box — cancellation requests (`cancel_request` type)
     always sort first, then PENDING-on-ADMIN steps, then the PROPOSAL step-4 finance-upload task;
     each card links directly to the submission
   - **"รอสร้างบัญชีให้อาจารย์/กรรมการ"** amber count card — only shown when any DRAFT submission
     has an unresolved `pendingPeople` email; links to `/dashboard/admin/pending-professors`
   - **Step distribution** (`StepDistributionDashboard`) — in-progress submissions grouped by
     pending step, PROPOSAL/THESIS_DEFENSE separately, each step row expandable to a per-student list
   - **Type filter pills** (ทุกประเภท/โครงร่าง/สอบวิทยานิพนธ์), **search bar**, **status filter
     tabs** (All/DRAFT/IN_PROGRESS/COMPLETED/REJECTED/CANCELLED, each with a count badge — these
     badges are what replaced the old header's stat pills, so nothing was lost when the header was
     removed)
   - **Submission list** — cards sorted by stuck-days descending; each shows title, student name +
     ID (links to `/dashboard/admin/users/[uid]`), status badge, a red "ขอยกเลิก" pill when
     `cancelRequested`, a "ค้างมา X วัน" badge past 7 days, who it's waiting on + step number,
     progress bar, created date, delete button (with confirm prompt), "จัดการ"/"ดำเนินการ" link
2. **จัดการผู้ใช้งาน (users)** — renders `AdminUsersPanel` (`src/components/AdminUsersPanel.tsx`,
   extracted 2026-09-06): the full STUDENT/PROFESSOR/ADMIN account list (expand a row for
   `UserDetailPanel`), the add-user modal, and demo reset tools. The same component is reused
   standalone at `/dashboard/admin/users` (now a thin guard+back-link wrapper around it) and its
   `[uid]` detail route, since student names in the submission list still deep-link there directly
   — the old "ผู้ใช้งานในระบบ" link-out card on this page was removed in favor of this tab.

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
| Program Chair | ประธานหลักสูตร | Sign at multiple phases — **assigned per submission by Student** (`submissions.programChairId`); legacy global `isProgramChair` flag is a fallback and still grants see-all |
| Head Exam Committee | ประธานกรรมการสอบ | Signs before regular committee — assigned per submission by Student |
| Exam Committee | กรรมการสอบ | Multiple members, sign separately in order — assigned per submission by Student |
| Invited Exam Committee | กรรมการภายนอก | External examiner — assigned per submission by Student; **must already have an account** (submission is saved as DRAFT pending admin approval otherwise — see "Committee accounts must pre-exist" above) |

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

**Committee people (`data.people[]`):** the student manually enters every person responsible for their thesis as `{ name, email, role, phone? }` rows — there are NO professor dropdowns. For a THESIS_DEFENSE this list is prefilled from the source proposal's committee but remains fully editable (see "Proposal-first" above). **Every email must already belong to an account** — the API (`src/lib/committee.ts`'s `resolvePeople`) only looks up existing users, it never creates one; if any email doesn't resolve, the submission is saved as `DRAFT` with the raw rows in `pendingPeople` instead of being mapped to `advisorId` / `coAdvisorIds` / `headCommitteeId` / `committeeIds` / `invitedCommitteeId` / `programChairId` (see "Committee accounts must pre-exist" above). Once resolved, the same email may hold multiple roles (one account); committee id arrays are deduped — duplicates would break sequential signing.

**Validation (enforced in form AND API):** ADVISOR exactly 1 · PROGRAM_CHAIR exactly 1 (role option disabled in other rows once taken) · HEAD_EXAM_COMMITTEE exactly 1 · EXAM_COMMITTEE ≥1 · INVITED_EXAM_COMMITTEE exactly 1 · CO_ADVISOR 0+. Every person's email must pass `isValidEmail()` (a typo'd email would create an account whose passcode email goes nowhere); a person's email may not equal the student's own email; duplicate email-in-same-role rows are rejected. The form shows a live checklist chip per required role. วันที่สอบ + เวลาสอบ required; title-confirmation checkbox before submit.

**Exam logistics:** วันที่สอบ + เวลา, ห้องประชุม (yes/no), ที่จอดรถ (yes/no), เลขทะเบียนรถ

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
- **EXAM_COMMITTEE and CO_ADVISOR** steps: all assigned members must approve (tracked via `committeeActions` JSON on `WorkflowStep`). CO_ADVISOR uses `coAdvisorIds` (DB field `String[]`) the same way EXAM_COMMITTEE uses `committeeIds`. INVITED_EXAM_COMMITTEE steps carry `[invitedCommitteeId]` in `committeeMembers` for self-containment.
- **CO_ADVISOR auto-skip**: when `coAdvisorIds` is empty at submission creation, all CO_ADVISOR steps are created with `status: "SKIPPED"` so they are transparently bypassed.
- **PROGRAM_CHAIR resolution**: always prefer `sub.programChairId` (per-submission, set from the student's people list) and fall back to the global `isProgramChair` flag. Applied in `email.ts`, notifyRole + approve auth in `PATCH /api/submissions/[id]`, the sign route, exam-reminder cron, upload involvement check, `AppContext`, `RoleSubmissionDetail`, professor dashboard, and display-name lookups.
- **Finance email** fires at PROPOSAL step 3 and THESIS_DEFENSE step 6 (both PROGRAM_CHAIR approvals), called directly via `sendFinanceEmail()` with the latest FINANCE_ATTACH file attached; recipient = `FINANCE_EMAIL` env var (skips if unset).
- **Rejection emails** use a red formal template (`buildRejectedHtml`) showing step + reason. `step.notes` stores only the raw reason text (or null) — role context lives in notification messages only. **Admin reject requires a comment** (enforced UI + API); other roles may reject without one.
- **SUPER_ADMIN has zero submission workflow access** — cannot approve, reject, override, upload to, or otherwise act on any submission (no detail-page views either — `src/app/dashboard/admin/[id]` stays ADMIN-only). That responsibility belongs exclusively to ADMIN. It does have read-only oversight: a full user directory (incl. STUDENT/PROFESSOR) via `GET /api/super-admin/users`, and a full submission list via `GET /api/super-admin/submissions` (both SUPER_ADMIN-only, view-only; the older counts-only `GET /api/super-admin/stats` was removed once these shipped) — but account *management* of STUDENT/PROFESSOR/ADMIN stays exclusively ADMIN's (SUPER_ADMIN can only create/edit/delete SUPER_ADMIN/ADMIN accounts, per `src/lib/accountScope.ts`).
- **Account-management tiers** (`src/lib/accountScope.ts`, shared by `PATCH`/`DELETE /api/users/[id]` and `POST /api/users`): a SUPER_ADMIN-tier account (has `SUPER_ADMIN` role) is manageable only by SUPER_ADMIN; an ADMIN-tier account is manageable by SUPER_ADMIN or ADMIN; a STUDENT/PROFESSOR account is manageable by ADMIN only. `GET /api/users` scopes the returned list the same way per caller, so SUPER_ADMIN's `users` never contains STUDENT/PROFESSOR rows and ADMIN's never contains SUPER_ADMIN rows.
- **Admin (พี่โบ้)** relays at THESIS_DEFENSE steps 7–8 — step 7: send B2+B3 to Faculty; step 8: receive back docs (ใบรายงานผล, แบบรายงานฯ, invitation letter), upload, forward to student, then approve → triggers invitation emails. Admin panel shows step-7-specific checklist banner.
- **Student upload steps** start PENDING; student uploads required files then clicks submit to advance
- **Rejection** stays on the same step (marked `REJECTED`) until the student resubmits — it does NOT move back a step. Any role can reject, no role restriction. (ส่งกลับ/`return_to_prev`, admin-only, is the separate action that actually moves back one step.)
- **One active proposal per student, defense created from a completed one** — a new PROPOSAL is blocked while an existing one is anything other than `CANCELLED`; a THESIS_DEFENSE requires a `COMPLETED`, non-cancelled source proposal (`sourceProposalId`) and imports (editable, independent copy) its committee. See "Proposal-first" above.
- **Every committee person must already have an account** — `POST /api/submissions` never auto-creates one; an email that doesn't resolve saves the submission as `DRAFT` (`pendingPeople` JSON, no workflow steps) until an ADMIN creates the account via `/dashboard/admin/pending-professors` and the student calls `continue_draft`. See "Committee accounts must pre-exist" above.
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
visible via the existing tab-badge on the รอดำเนินการ/ประวัติ tab bar, so nothing was added back in
its place.

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

**Student dashboard** (`src/app/student-dashboard/page.tsx`, redesigned 2026-09-06 into a 2-tab
layout — the original single-card design described in older history is gone):
1. **Tab bar** — two full-width buttons, `สอบโครงร่าง` / `สอบวิทยานิพนธ์` (`grid grid-cols-2 gap-2`,
   same tab-bar pattern as `/admin-dashboard`), switching a `useState<"proposal" | "defense">`.
   Below it, one shared frame (`bg-white rounded-2xl border border-gray-200 p-4 sm:p-6
   max-h-[75vh] overflow-y-auto` — same "scrollbar stays inside the frame" convention as
   `/admin-dashboard`) renders whichever tab is active.
2. **Each tab** has its own creation entry point (gated by the proposal-first rules above — the
   proposal tab's card is only rendered while there's **no** active proposal; the defense tab's is
   the active blue/indigo card when `eligibleProposals.length > 0`, else a locked gray card), then
   its own **"ความคืบหน้าปัจจุบัน (x/y)"** section for that submission type only:
   - If a current (most-recent non-cancelled) submission of that type exists: title (plain text,
     not a link — clicking it does nothing) + `SubmissionStatusBadge`, then `SubmissionInfoPanel`
     (see below), then the "ความคืบหน้าปัจจุบัน (doneCount/totalSteps)" label, then the full
     `WorkflowTimeline` (every step, not a one-line bar). The proposal tab additionally shows a
     "ขอยกเลิกคำร้องนี้" button (hidden once `cancelRequested` or already `CANCELLED`) that opens a
     confirm modal and calls `requestCancelSubmission` — the same student-initiated cancel flow as
     the detail page, including the linked-defense cascade warning.
   - If no submission of that type exists yet: an empty "No proposal"/"No defense" placeholder
     (no create button here — that lives only in the entry-point card above), then the same label
     showing **"ความคืบหน้าปัจจุบัน (0/y)"**, then a **preview** `WorkflowTimeline` built from
     `buildWorkflowSteps()` with no committee (`PREVIEW_PROPOSAL_STEPS` / `PREVIEW_DEFENSE_STEPS`,
     module-level constants) and the `preview` prop set — see below.
3. **"รายการอื่นๆ"** — every submission that isn't the current proposal or the current defense
   (cancelled ones, or an older one superseded by a newer current one of the same type), each in
   the original per-item row style (accent bar, status icon, mini progress bar, links to its detail
   page). Only rendered when non-empty.

**`WorkflowTimeline`'s `preview` prop**: when true, no step is ever computed as "current" (no blue
ring/`Clock` icon/"กำลังดำเนินการ" badge on any step) even though every step's `status` is
`"PENDING"` — used only for the before-any-submission-exists step list above, so nothing is shown
as falsely in-progress.

**`SubmissionInfoPanel`** (`src/components/SubmissionInfoPanel.tsx`) — the read-only ข้อมูลนิสิต /
คณะกรรมการ / กำหนดการสอบ block, extracted from `src/app/dashboard/student/[id]/page.tsx` so both
the detail page and the student-dashboard tabs render the exact same info without duplicating the
~80 lines of field logic. Takes `{ submission, users }`; renders nothing if the submission has no
student/committee/exam info at all.
