<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

# Project: ระบบจัดการวิทยานิพนธ์ (Thesis Management System)

A role-based thesis approval workflow app. **Fully live** — Next.js 16 App Router, Prisma ORM → Supabase PostgreSQL, NextAuth v5 (credentials + magic-link login), file uploads to Supabase Storage. UI is in Thai.

## Stack & deployment
- **DB**: Prisma + `@prisma/adapter-pg` → Supabase PostgreSQL. Client in `src/lib/prisma.ts` (singleton always cached on `globalThis` — both dev and Vercel production).
- **Auth**: NextAuth v5, credentials (email + password, bcrypt) plus one-time magic links in emails. `src/lib/auth.ts`. Login email is trimmed + lowercased before lookup.
- **Email**: SMTP via nodemailer in `src/lib/email.ts` (shared `sendMail()` helper) — `sendStepEmail()` on every step advance, `sendFinanceEmail()` at PROPOSAL step 3 and THESIS step 6 (called directly, not via HTTP). Emails go to real recipients. Sender: Office365/generic SMTP when `SMTP_USER`/`SMTP_PASS` are set (default host smtp.office365.com:587), else Gmail via `GMAIL_USER`/`GMAIL_APP_PASSWORD`. Each recipient gets a **per-user magic-link URL** (`/api/auth/magic?t=<token>`, `src/lib/email.ts:171-184`) rendered as plain link text (no styled button) that auto-logs them in and deep-links to their specific submission page; the token is not consumed on use (SafeLinks prefetch safety) and expires after 48h. Falls back to a plain `/login` link if token creation fails. The email body also mentions signing in with email+password as an alternative, which still works regardless.
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

### Step 1 is NOT auto-approved
When a submission is created, **step 1 starts as PENDING**. The student must upload the required documents and click submit. Step 2's email notification fires automatically when the student's submit action (approve) completes.

### Rejection stays on the step — student must resubmit
`PATCH action "reject"` and `POST /sign decision "REJECTED"`: the current PENDING step is marked `REJECTED` and the submission status becomes `REJECTED`. The workflow does NOT move. While `REJECTED`, both `approve` and a second `reject` return 400 ("รอนักศึกษายืนยันการแก้ไขก่อน"). The student fixes documents and calls `action "resubmit"` (student-only) — this resets **only the rejected step** to PENDING (clears actedAt/notes/committeeActions), sets status `IN_PROGRESS`, and the same reviewer re-reviews from the same step. Any involved role can reject; admin/super-admin rejections require a notes comment (enforced UI + API).

### Send-back (ส่งกลับ) goes back ONE step — admin only
`PATCH action "return_to_prev"` (ADMIN/SUPER_ADMIN only): resets **both the current PENDING step and the nearest preceding non-SKIPPED step** to `PENDING` (clear actedAt/notes/committeeActions), status stays `IN_PROGRESS`, and the previous role is notified to act again. Returns 400 on the first step.

**Critical**: the sent-back current step must be reset to `PENDING`, never `REJECTED` — the approve flow only advances through PENDING steps, so a step left `REJECTED` here gets skipped forever once the previous role re-approves (bug found and fixed 2026-07-14 via E2E test).

### Reject button (ปฏิเสธ)
The reject button is embedded directly inside `SignatureButton` and `CommitteeSignPanel` — **no separate send-back panel exists**. Clicking ปฏิเสธ calls `action: "reject"` and goes back one step. There is no standalone "ส่งกลับขั้นตอนก่อนหน้า" panel (it was removed as redundant).

### Document versioning — one slot per formType (ALL types)
**Every** form type — including SIGNED — has a single display slot in `FileList`: latest upload is the current version, older uploads collapse under "ประวัติ". No formType is shown as individual files anymore. **`SIGNED` always means แบบรายงานการเสนอผลงานฯ** (the student report chain: admin step 8 → student step 9 → advisor step 10); the other faculty-return docs have their own types (EXAM_RESULT, INVITE_LETTER, VERY_GOOD_EVAL, FINANCE_DOC — see `FACULTY_SLOTS` in admin detail page). **Non-student roles upload with the correct `formType`** so their signed copy replaces the slot's latest version.

### Upload formType for signing roles
`SignatureButton` and `CommitteeSignPanel` both accept `formsToShow?: string[]`. When `formsToShow` contains non-SIGNED form types, the upload is saved with that formType (versioning the correct slot). Falls back to `"SIGNED"` only when `formsToShow` is empty or contains only `"SIGNED"`.

### Download filtering — STEP_SIGN_FORMS
`RoleSubmissionDetail` computes `formsToShow` from `STEP_SIGN_FORMS` so each role sees only the documents relevant to their step. Passed to both `SignatureButton` and `CommitteeSignPanel`.

```
PROPOSAL:       2→[BW1A,BW1B]  3→[BW1A]  5→[B1C]  6→[B1C]  7→[B1C]  8→[B1C]  9→[B1C,B1D]  10→[B1C,B1D]  11→[B1C,B1D]
THESIS_DEFENSE: 2→[B3]  3→[B2]  4→[B2]  5→[B2]  6→[B2]  7→[B2,B3]
                10→[SIGNED]  11→[SIGNED]  12→[SIGNED]  13→[SIGNED]  14→[SIGNED]  15→[SIGNED]
                17→[B4]  18→[THESIS]  19→[THESIS]  20→[THESIS]  21→[THESIS]  22→[THESIS]
```

### Admin dashboard (`src/app/dashboard/admin/page.tsx`)
Layout (top to bottom):
1. **4 stat cards** — Total / กำลังดำเนินการ (blue) / เสร็จสิ้น (green) / ถูกปฏิเสธ (red)
2. **"รออนุมัติจากท่าน"** orange section — only shown when admin has PENDING steps; each card links directly to the submission
3. **Search bar** — filters by thesis title, student name, or student ID
4. **Status filter tabs** — All / IN_PROGRESS / COMPLETED / REJECTED, each showing a count badge
5. **Submission list** — cards sorted by stuck-days descending; each card shows: title, student name + ID (links to user page), status badge, who it's waiting on + step number, progress bar, created date, delete button (with confirm prompt), "จัดการ" link
6. **Stuck-day badge** — amber "ค้างมา X วัน" warning appears on submissions stuck > 7 days (IN_PROGRESS only)

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
| Super Admin | ผู้ดูแลระบบสูงสุด | Create/delete users, assign roles, override any workflow step |
| Admin | เจ้าหน้าที่ภาควิชา (พี่โบ้) | Approve submissions, relay documents to Faculty, forward docs to Student |
| Student | นิสิต | Upload documents, assign committee members, track status |
| Advisor | อาจารย์ที่ปรึกษา | Sign forms, monitor assigned students |
| Co-Advisor | อาจารย์ที่ปรึกษาร่วม | Signs immediately after Advisor at every Advisor step — **optional**, step auto-SKIPPED when no co-advisors assigned; multiple allowed (sequential like EXAM_COMMITTEE) |
| Program Chair | ประธานหลักสูตร | Sign at multiple phases — **assigned per submission by Student** (`submissions.programChairId`); legacy global `isProgramChair` flag is a fallback and still grants see-all |
| Head Exam Committee | ประธานกรรมการสอบ | Signs before regular committee — assigned per submission by Student |
| Exam Committee | กรรมการสอบ | Multiple members, sign separately in order — assigned per submission by Student |
| Invited Exam Committee | กรรมการภายนอก | External examiner — assigned per submission by Student; **account auto-created** like all committee people |

### External roles (no login)
| Role | How they interact |
|---|---|
| Faculty Dean | Signs บ.4 physically offline |
| Finance | Receives email at PROPOSAL step 3 and THESIS step 6 (with FINANCE_ATTACH attached) |
| Graduate School | Receives final document package outside the system |

---

## Submission fields — student enters everything manually

**Registration:** students must provide รหัสนิสิต (unique, stored on `users.studentId`); professors don't. Email format is validated via `isValidEmail()` (`lib/utils.ts`) in both form and API; duplicate email/studentId → 409 (incl. the concurrent-create race via P2002 catch). The register API returns `emailSent` — when the welcome email fails, the register page shows an amber warning pointing to forgot-password instead of claiming the email was sent. Submit form prefills ชื่อ/รหัสนิสิต/อีเมล from the account.

**Student info:** ชื่อ-นามสกุล, รหัสนิสิต, หลักสูตร (PHD=วิศวกรรมศาสตรดุษฎีบัณฑิต สาขาวิชาวิศวกรรมเครื่องกล / ME_MECH=วิศวกรรมศาสตรมหาบัณฑิต สาขาวิชาวิศวกรรมเครื่องกล / ME_CPS=วิศวกรรมศาสตรมหาบัณฑิต สาขาวิชาระบบกายภาพที่เชื่อมประสานด้วยเครือข่ายไซเบอร์), อีเมล์, เบอร์โทร

**Committee people (`data.people[]`):** the student manually enters every person responsible for their thesis as `{ name, email, role, phone? }` rows — there are NO professor dropdowns. The API finds-or-creates a PROFESSOR account per unique email (new accounts get a welcome email with password) and maps the rows to `advisorId` / `coAdvisorIds` / `headCommitteeId` / `committeeIds` / `invitedCommitteeId` / `programChairId`. The same email may hold multiple roles (one account). Committee id arrays are deduped — duplicates would break sequential signing.

**Validation (enforced in form AND API):** ADVISOR exactly 1 · PROGRAM_CHAIR exactly 1 (role option disabled in other rows once taken) · HEAD_EXAM_COMMITTEE exactly 1 · EXAM_COMMITTEE ≥1 · INVITED_EXAM_COMMITTEE exactly 1 · CO_ADVISOR 0+. Every person's email must pass `isValidEmail()` (a typo'd email would create an account whose password email goes nowhere); a person's email may not equal the student's own email; duplicate email-in-same-role rows are rejected. The form shows a live checklist chip per required role. วันที่สอบ + เวลาสอบ required; title-confirmation checkbox before submit.

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

If rejected → goes back one step (e.g. step 9 → step 8, step 8 → step 7).

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

Faculty returns: ใบรายงานผลการสอบ, แบบรายงานฯ, invitation letter, แบบประเมิน "วิทยานิพนธ์ดีมาก" (Very Good only). Step 8 requires at least 1 SIGNED upload before admin can approve (server-gated).

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

If rejected at any step → goes back one step.

---

## Key rules
- **Sequential only** — no parallel signing
- **EXAM_COMMITTEE and CO_ADVISOR** steps: all assigned members must approve (tracked via `committeeActions` JSON on `WorkflowStep`). CO_ADVISOR uses `coAdvisorIds` (DB field `String[]`) the same way EXAM_COMMITTEE uses `committeeIds`. INVITED_EXAM_COMMITTEE steps carry `[invitedCommitteeId]` in `committeeMembers` for self-containment.
- **CO_ADVISOR auto-skip**: when `coAdvisorIds` is empty at submission creation, all CO_ADVISOR steps are created with `status: "SKIPPED"` so they are transparently bypassed.
- **PROGRAM_CHAIR resolution**: always prefer `sub.programChairId` (per-submission, set from the student's people list) and fall back to the global `isProgramChair` flag. Applied in `email.ts`, notifyRole + approve auth in `PATCH /api/submissions/[id]`, the sign route, exam-reminder cron, upload involvement check, `AppContext`, `RoleSubmissionDetail`, professor dashboard, and display-name lookups.
- **Finance email** fires at PROPOSAL step 3 and THESIS_DEFENSE step 6 (both PROGRAM_CHAIR approvals), called directly via `sendFinanceEmail()` with the latest FINANCE_ATTACH file attached; recipient = `FINANCE_EMAIL` env var (skips if unset).
- **Rejection emails** use a red formal template (`buildRejectedHtml`) showing step + reason. `step.notes` stores only the raw reason text (or null) — role context lives in notification messages only. **Admin/super-admin reject requires a comment** (enforced UI + API); other roles may reject without one.
- **Admin (พี่โบ้)** relays at THESIS_DEFENSE steps 7–8 — step 7: send B2+B3 to Faculty; step 8: receive back docs (ใบรายงานผล, แบบรายงานฯ, invitation letter), upload, forward to student, then approve → triggers invitation emails. Admin panel shows step-7-specific checklist banner.
- **Student upload steps** start PENDING; student uploads required files then clicks submit to advance
- **Rejection** goes back exactly one step — any role can reject, no role restriction

## UI conventions (recent)
- **FileList** takes a `submissionType` prop and groups uploads into phase-aware sections. PROPOSAL: เอกสารหลัก (BW1A/BW1B/B1C/B1D) / เอกสารการเงิน / เอกสารอื่นๆ. THESIS_DEFENSE: บ.2+บ.3 (B2/B3/FINANCE_ATTACH) / เอกสารการเงิน (FINANCE_DOC) / เอกสารจากคณะและผลการสอบ (SIGNED/EXAM_RESULT/INVITE_LETTER/VERY_GOOD_EVAL) / วิทยานิพนธ์ (B4/THESIS). See `FILE_GROUPS_PROPOSAL` / `FILE_GROUPS_THESIS` in `FileList.tsx`. Unknown types fall into the last section. Row labels are always Thai form names (FORM_SHORT primary, full FORM_LABELS as subtitle) — never raw filenames as titles. FileList shows its own file count in the header; callers must NOT add another count to the `title` prop.
- **THESIS step 9 downloads**: the student page shows a download card listing admin's step-8 SIGNED files (those uploaded at/before step 8's `actedAt`) so the student can download แบบรายงานฯ, fill + sign, and re-upload. Files newer than step 8's `actedAt` count as the student's own upload (`effectiveUploads` filter).
- **FileUploader** slots always render a `SlotHeader`: form-code badge (FORM_SHORT) + description + status chip (อัปโหลดแล้ว / เลือกไฟล์แล้ว / ยังไม่ได้เลือกไฟล์).
- **Professor dashboard** shows the generic "อาจารย์" label on card badges (a professor can hold several roles per submission); other views keep specific role labels.
- **Admin detail** committee panel lists every person (incl. per-submission program chair) with mailto links.
- **Emails** use formal Thai business-letter register: เรียน …, จึงเรียนมาเพื่อโปรดพิจารณาดำเนินการ, ขอแสดงความนับถือ + department signature block.
