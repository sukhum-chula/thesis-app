# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.

# Project: ระบบจัดการวิทยานิพนธ์ (Thesis Management System)

A role-based thesis approval workflow app, **live with real users**. Next.js 16 App Router, Prisma →
Supabase PostgreSQL, NextAuth v5 (credentials), Supabase Storage. UI is in Thai.

This file describes **current** behavior only. The dated history of how it got here is in
`CHANGELOG.md` — record changes there, and keep this file a spec, not a log.

## Stack & deployment
- **DB**: Prisma + `@prisma/adapter-pg`. Client in `src/lib/prisma.ts` — the singleton is always cached on `globalThis` (dev and Vercel). Never add a `NODE_ENV !== "production"` guard (that caused connection exhaustion). The pg pool is `max: 3`, 30s idle — do not raise it.
- **Auth**: NextAuth v5, credentials only (email + passcode, bcrypt against `User.passcodeHash`), `src/lib/auth.ts`. Login email is trimmed + lowercased. No self-registration, no self-service reset, no magic-link login (removed — leaked emails allowed passcode-less login).
- **Email**: nodemailer, `src/lib/email.ts` (`sendMail()`). Office365/generic SMTP when `SMTP_USER`/`SMTP_PASS` are set, else Gmail. Emails go to real recipients in **every** environment. Each email links to `/login` as plain text and reminds the user to sign in with email + passcode.
- **Storage**: private bucket `thesis-files`. `FormUpload.fileUrl` is a bare storage path; previews/downloads resolve a 1h signed URL via `GET /api/upload/[uploadId]/signed-url` (same involvement check as the rest of the API). Never store or serve a public URL. Paths are `{submissionId}/...` (`deleteFolder()` relies on it).
- **Deploy**: Vercel (`thesis-app`, account `sukhums-4319`), auto-deploys on push to `main` (`sukhum-chula/thesis-app`).

### Required env vars (Vercel + `.env.local`)
```
DATABASE_URL          # Supabase pooler, TRANSACTION mode (port 6543). Session mode (:5432) has a 15-client cap.
                      # `prisma db push` needs the DIRECT connection (5432) instead.
AUTH_SECRET           # NextAuth v5 name — NOT NEXTAUTH_SECRET
NEXTAUTH_URL          # Production only; unset on Preview/Development (VERCEL_URL fallback)
GMAIL_USER / GMAIL_APP_PASSWORD   # Gmail sender (fallback when SMTP_USER unset)
SMTP_USER / SMTP_PASS             # optional Office365/generic sender, takes priority
SMTP_HOST / SMTP_PORT             # optional, default smtp.office365.com:587
NEXT_PUBLIC_SUPABASE_URL
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY  # or NEXT_PUBLIC_SUPABASE_ANON_KEY
SUPABASE_SERVICE_ROLE_KEY             # server only: storage admin ops + signed URLs
FINANCE_EMAIL         # fallback finance recipient when no ADMIN is designated finance contact
CRON_SECRET           # guards /api/cron/exam-reminders (in-app bell reminders only, no email)
NEXT_PUBLIC_DEMO_MODE # "true" shows demo reset tools in AdminUsersPanel; unset in production
```

## Conventions
- All business logic is in `src/app/api/` route handlers. Client state lives in `AppContext`, which polls the API.
- Step names: always `getStepName(stepOrder, submissionType)` (`src/lib/utils.ts`), never the name maps directly.
- Displayed step numbers: always `stepNumbering(...).label(stepOrder)` (`src/lib/stepNumbering.ts`), never an index.
- Defense steps: branch on `THESIS_STEP.*` / `PROPOSAL_STEP.*` (`src/lib/workflowSteps.ts`), never bare numbers.
- Names: always `formatUserName({ title, name })` — never render bare `.name` or concatenate title/name inline.
- Tailwind class names in lookup maps must be whole static strings. Role colors/labels: `ROLE_GRADIENT` / `ROLE_EMOJI` / `ROLE_LABELS`.
- Thai UI, Sarabun font. Keep UI large and calm — users include older faculty.
- Run `npm run build` before committing non-trivial changes.

---

## Roles

### Account roles (`User.roles: Role[]`)
| Role | Thai | Scope |
|---|---|---|
| SUPER_ADMIN | ผู้ดูแลระบบสูงสุด | `/super-dashboard`. Manages SUPER_ADMIN/ADMIN accounts only. **Zero submission workflow access** (no approve/reject/override/upload, no detail pages). Read-only oversight via `GET /api/super-admin/users` and `GET /api/super-admin/submissions`. |
| ADMIN | เจ้าหน้าที่ภาควิชา | `/admin-dashboard`. Owns the submission workflow (admin steps, override, send-back, cancellation, delete). Manages ADMIN/PROFESSOR/EXTERNAL/STUDENT accounts, approves EXTERNAL-account requests, and sets system settings. |
| STUDENT | นิสิต | `/student-dashboard`. Creates and acts on their own submissions, requests EXTERNAL accounts. |
| PROFESSOR | อาจารย์ | `/professor-dashboard` (detail at `/dashboard/professor/[id]`). Internal faculty. |
| EXTERNAL | กรรมการภายนอก | Same login/abilities as PROFESSOR; tagged separately so committee pickers can tell internal from external. |

Account-management tiers (`src/lib/accountScope.ts`): a SUPER_ADMIN account is managed only by SUPER_ADMIN; an ADMIN account by SUPER_ADMIN or ADMIN; STUDENT/PROFESSOR/EXTERNAL only by ADMIN. `GET /api/users` scopes its list the same way.

`src/lib/roleRoutes.ts` is the single source of each role's landing page. `DETAIL_BASE` in `NotificationBell.tsx` maps roles whose detail pages live elsewhere.

### Contextual roles (per submission — plain strings, not the `Role` enum)
| Role | Thai | Source / notes |
|---|---|---|
| ADVISOR | อาจารย์ที่ปรึกษา | `advisorId`, exactly 1 |
| CO_ADVISOR | อาจารย์ที่ปรึกษาร่วม | `coAdvisorIds`, 0+; its steps are created SKIPPED when empty |
| HEAD_EXAM_COMMITTEE | ประธานกรรมการสอบ | `headCommitteeId`, exactly 1 |
| EXAM_COMMITTEE | กรรมการสอบ | `committeeIds`, ≥1 |
| INVITED_EXAM_COMMITTEE | กรรมการภายนอก | `invitedCommitteeIds`, ≥1 |
| PROGRAM_CHAIR | ประธานหลักสูตร | `programChairId`; auto-resolved from the program's designated chair, never a student-picked row |
| DEPARTMENT_CHAIR | หัวหน้าภาควิชา | the one PROFESSOR in SystemSetting `departmentChair`; involved in **every** submission |

**PROGRAM_CHAIR resolution**: prefer `sub.programChairId`; fall back to the PROFESSOR whose `programChairFor` array includes `sub.program` (`.includes()`, a professor may chair several programs). Applied everywhere the chair is resolved (email, notify, approve auth, list scoping, sign, uploads, AppContext, UI).

### Committee composition by degree
`PHD` is doctoral; `ME_MECH`/`ME_CPS` master's (`degreeOfProgram()` — an unset program counts as master's).

| Role | Master's | PhD | Count |
|---|---|---|---|
| ADVISOR | PROFESSOR | PROFESSOR | 1 |
| CO_ADVISOR | PROFESSOR or EXTERNAL | PROFESSOR or EXTERNAL | 0+ |
| HEAD_EXAM_COMMITTEE | PROFESSOR or EXTERNAL | **EXTERNAL only** | 1 |
| EXAM_COMMITTEE | PROFESSOR | PROFESSOR | ≥1 |
| INVITED_EXAM_COMMITTEE | EXTERNAL | EXTERNAL | ≥1 |

One source of truth: `degreeOfProgram` / `committeeRoleScope(role, degree)` / `accountFitsScope` / `ACCOUNT_SCOPE_LABELS` in `src/lib/utils.ts`, used by the editor, the client validator and `validateCommitteeAccountRoles` (`src/lib/committee.ts`).

**One person, one committee role**: an account may hold only one position on a submission (not two roles, not the same role twice) — except the PROGRAM_CHAIR, who may also fill one other position. `findDuplicateCommitteeMember()` (`utils.ts`) is the one definition; enforced by `validatePeople` and `validatePeopleLenient` (drafts too), on `admin_update`, and in the editor (already-picked accounts are not offered; carried-in duplicates show red).

### External parties (no login)
Faculty Dean signs documents offline · Finance receives the finance email · Graduate School receives the final package outside the system.

---

## Workflow

Two submission types. Internal `stepOrder` keys every gate, email and DB row; users see `stepNumbering()` labels. SKIPPED steps are hidden and never numbered. Step arrays: `PROPOSAL_ROLES` / `THESIS_ROLES` in `src/lib/workflowSteps.ts`; `buildWorkflowSteps()` builds them (shared by create and draft-confirm).

**Steps are snapshotted at creation** — a submission built before a workflow change keeps its old step rows (and `getStepName` may then mislabel them). Restructures need existing in-flight submissions rebuilt or backfilled by a one-off script. A submission with no PENDING step left is complete.

### PROPOSAL (14 steps, shown 1–10)
Every document is the one combined `B1` file (บ.วศ.1ก–ง, PDF). Each signing step downloads the latest `B1` and uploads the signed copy as a new version.

| Step | Shown | Role | Action |
|---|---|---|---|
| 1 | 1 | STUDENT | Upload B1 (1ก + 1ข filled, signed by student ×2 and advisor in 1ก); checklist `B1_CHECKS`. Blank form: https://me.eng.chula.ac.th/download/ (linked, not served). |
| 2 | 2 | ADMIN | Generate FINANCE_ATTACH (see "Finance form"); tick the 5 student checks + `ADMIN_B1_EXTRA_CHECKS`; approve → **sends the finance email**. |
| 3 | 3 | PROGRAM_CHAIR | Sign บ.วศ.1ก (`CHAIR_B1_CHECKS`). |
| 4 | 4 | STUDENT | After the proposal exam: fill 1ค + 1ง on the chair-signed B1, re-upload (must be newer than step 3 — `freshUploadCutoff`); checklist `B1_STEP4_CHECKS`. |
| 5 | 5.1 | ADVISOR | Sign บ.วศ.1ค (one place) — `PROPOSAL_SIGN_CHECKS` |
| 6 | 5.x | CO_ADVISOR | Same, each member in order — SKIPPED if none |
| 7 | 5.x | EXAM_COMMITTEE | Same, each member in order |
| 8 | 5.x | HEAD_EXAM_COMMITTEE | Pick the exam result (ผ่าน/ไม่ผ่าน) + sign |
| 9 | 5.x | INVITED_EXAM_COMMITTEE | Same, each member in order |
| 10 | 6 | ADMIN | Verify the fully signed B1 (`ADMIN_STEP6_CHECKS`), incl. renaming the submission title to match 1ง |
| 11 | 7 | PROGRAM_CHAIR | Sign 1ค + 1ง (two checks) |
| 12 | 8 | ADMIN | Generate the **cover memo** (`COVER_PAGE`), convert to PDF, upload; `ADMIN_STEP8_CHECKS` (`PROPOSAL_STEP.ADMIN_COVER`) |
| 13 | 9 | DEPARTMENT_CHAIR | Sign the memo, upload as new COVER_PAGE (newer than step 12) (`PROPOSAL_STEP.DEPT_CHAIR_COVER`) |
| 14 | 10 | ADMIN | Deliver B1 + signed memo to the Faculty, upload `LESSPAPER_RECEIPT` (single version); `ADMIN_STEP10_CHECKS`; completes (`PROPOSAL_STEP.ADMIN_SEND`) |

### THESIS_DEFENSE (20 steps, shown 1–17)
Committee signatures on ใบรายงานผลการสอบ (stepOrders 8–11) are shown as 8.1–8.x.

| Step | Shown | Role | Action |
|---|---|---|---|
| 1 | 1 | STUDENT | Upload `B2` (signed outside the system by student, advisor, head; program-chair line blank) and **one signed `B3` per committee member** (`committeeRoster()`, stored with `FormUpload.memberId`); `DEFENSE_STEP1_CHECKS` |
| 2 | 2 | ADMIN | Generate FINANCE_ATTACH (`templates/finance-attach-thesis.docx`); `ADMIN_DEFENSE_FINANCE_CHECKS`; approve → **finance email** (`ADMIN_CHECK`) |
| 3 | 3 | PROGRAM_CHAIR | Sign บ.2 (`CHAIR_B2`) |
| 4 | 4 | ADMIN | Send B2 + B3 to the Faculty, upload LESSPAPER_RECEIPT; `ADMIN_DEFENSE_RELAY_CHECKS` (`ADMIN_RELAY`) |
| 5 | 5 | ADMIN | Confirm only: forwarded the Faculty's email to the student (`ADMIN_FORWARD`) |
| 6 | 6 | STUDENT | Upload signed แบบรายงานฯ (`SIGNED`), **blank** ใบรายงานผลการสอบ (`EXAM_RESULT`), and `VERY_GOOD_EVAL` (filled if ดีมาก, else blank); `DEFENSE_STEP6_CHECKS` (`STUDENT_REPORT`) |
| 7 | 7 | ADVISOR | **Pick the exam result** (`ExamResultPicker`; sent as note line `ผลการสอบ: …`, read with `defenseExamResult()`); fill in + sign EXAM_RESULT, sign SIGNED — both newer than step 6 (`ADVISOR_RESULT`) |
| 8 | 8.x | CO_ADVISOR | Sign EXAM_RESULT — SKIPPED if none |
| 9 | 8.x | EXAM_COMMITTEE | Sign EXAM_RESULT, in order |
| 10 | 8.x | HEAD_EXAM_COMMITTEE | Sign EXAM_RESULT |
| 11 | 8.x | INVITED_EXAM_COMMITTEE | Sign EXAM_RESULT, in order — all signers use `SIGN_RESULT_CHECKS` |
| 12 | 9 | ADMIN | Check results; generate the **result memo** (`COVER_PAGE`), upload as PDF; `ADMIN_DEFENSE_RESULT_CHECKS`; a ดีมาก result shows a note to check VERY_GOOD_EVAL (`ADMIN_RESULT_CHECK`) |
| 13 | 10 | DEPARTMENT_CHAIR | Sign EXAM_RESULT + the memo (memo newer than step 12) (`DEPT_CHAIR_RESULT`) |
| 14 | 11 | ADMIN | Deliver to the Faculty, upload a new LESSPAPER_RECEIPT (newer than step 13); `ADMIN_DEFENSE_SEND_CHECKS` (`ADMIN_RESULT_SEND`) |
| 15 | 12 | STUDENT | Upload **one combined PDF** as `B4`, in order: บ.4 (filled, student-signed) → the **first 5 pages** from iThesis (covers TH/EN, committee signature page, abstracts TH/EN; barcoded, signed by the whole committee outside the system) → iThesis's 2-page **DOCUMENTS FOR SUBMISSION OF COMPLETE THESIS** (student + advisor signed); `DEFENSE_STEP15_CHECKS` (`STUDENT_THESIS`). `THESIS` is no longer uploaded (older submissions keep theirs) |
| 16 | 13 | ADMIN | Check the combined B4 file (`ADMIN_DEFENSE_THESIS_CHECKS`) (`ADMIN_THESIS_CHECK`) |
| 17 | 14 | DEPARTMENT_CHAIR | Sign **the บ.4 page only**, upload the whole file back as a new `B4` version (`DEPT_CHAIR_THESIS`) |
| 18 | 15 | ADMIN | Deliver the B4 file, upload a new LESSPAPER_RECEIPT (newer than step 17) (`ADMIN_THESIS_SEND`) |
| 19 | 16 | ADMIN | Confirm only: forwarded the Faculty's Dean-signed documents to the student (`ADMIN_THESIS_FORWARD`) |
| 20 | 17 | STUDENT | Confirm only: everything submitted to iThesis (`DEFENSE_ITHESIS_CHECKS`) (`STUDENT_ITHESIS`) |

Who signs what: ใบรายงานผลการสอบ = advisor, co-advisors, exam committee, head, externals, then the department chair (never the student or program chair). แบบรายงานฯ (`SIGNED`) = student (step 6) and advisor (step 7) only.

### Required uploads (server-gated in `PATCH` `approve`, mirrored client-side)
```
PROPOSAL:       1 → B1 · 2 → FINANCE_ATTACH · 4 → B1 (newer than step 3) · 12 → COVER_PAGE
                13 → COVER_PAGE (newer than step 12) · 14 → LESSPAPER_RECEIPT
THESIS_DEFENSE: 1 → B2 + one B3 per member · 2 → FINANCE_ATTACH · 4 → LESSPAPER_RECEIPT
                6 → SIGNED, EXAM_RESULT, VERY_GOOD_EVAL · 7 → SIGNED, EXAM_RESULT (newer than step 6)
                12 → COVER_PAGE · 13 → COVER_PAGE (newer than 12) · 14 → LESSPAPER_RECEIPT (newer than 13)
                15 → B4 (the combined file) · 18 → LESSPAPER_RECEIPT (newer than 17)
```
"Newer than step N" is `freshUploadCutoff()` (`utils.ts`), the one rule for both server and client.

### Documents each signer sees — `STEP_SIGN_FORMS`
`RoleSubmissionDetail` passes `formsToShow` to `SignatureButton` / `CommitteeSignPanel`; uploads are saved with that formType (falling back to `SIGNED` only when the list is empty or only `SIGNED`).
```
PROPOSAL:       3,5,6,7,8,9,11 → B1 · 13 → COVER_PAGE
THESIS_DEFENSE: 3 → B2 · 7 → SIGNED, EXAM_RESULT · 8–11 → EXAM_RESULT · 13 → EXAM_RESULT, COVER_PAGE · 17 → B4
```
The ADMIN's ① download list per step is `ADMIN_STEP_FORMS` in `AdminSubmissionPanel`.

### Workflow actions (`PATCH /api/submissions/[id]`)
- **Step 1 starts PENDING** — the student uploads and submits (`approve`). Approving notifies/emails the next step's assignee (`sendStepEmail`).
- **Reject** (`reject`, or `POST /sign` with `REJECTED`) marks the current step `REJECTED` and the submission `REJECTED`; the workflow does not move. `approve`/`reject` then return 400 until the student calls `resubmit`, which resets only that step to PENDING (clears actedAt/notes/committeeActions). The reject button (ปฏิเสธ — never ไม่อนุมัติ) lives inside `SignatureButton` / `CommitteeSignPanel`. An ADMIN rejecting a non-admin step must give a comment.
- **ADMIN steps never reject** — `reject` on an ADMIN step returns 400; the admin card offers only อนุมัติ + ส่งกลับ.
- **Send back** (`return_to_prev`, ADMIN only): resets the current step **and** `previousActiveStep()` to PENDING (never REJECTED — a REJECTED step would be skipped forever), status stays IN_PROGRESS, the previous role is notified (a student gets one bell notification). 400 on the first step. Reason goes to bell notifications only.
- **Override** (`admin_override_step`), per step in "จัดการแต่ละขั้นตอน":

  | Step state | อนุมัติ | ส่งกลับ |
  |---|---|---|
  | APPROVED | — | "ส่งกลับมาขั้นนี้" (`REJECTED`): reset this and all later steps to PENDING |
  | Current PENDING | approve this and every earlier step | `return_to_prev` (hidden on step 1) |
  | Future PENDING / REJECTED | same | — |

  Status after an override: any PENDING → IN_PROGRESS, else any REJECTED → REJECTED, else COMPLETED.
- **Multi-member steps** (CO_ADVISOR, EXAM_COMMITTEE, INVITED_EXAM_COMMITTEE) go through `POST /api/submissions/[id]/sign`: every member signs **sequentially in list order** (`committeeActions` JSON), all must approve to advance. Plain `approve` rejects these roles. Each step snapshots its members in `WorkflowStep.committeeMembers`. No parallel signing anywhere.
- **Signing is recorded on `WorkflowStep`** (`actedById`/`actedByName`/`actedAt`, or `committeeActions`). There is no signature table — don't add one without deciding what it records that the step doesn't.
- **Admin committee edit re-syncs open steps** (`planCommitteeStepSync()`, applied in the `admin_update` transaction): open steps get the new member list, removed members' sign-offs are dropped, a step whose remaining members all approved is approved, removing all co-advisors SKIPS open CO_ADVISOR steps (adding one re-opens them). APPROVED steps and SKIPPED steps behind the current one are untouched; CANCELLED/COMPLETED submissions are left alone. If the turn changed, the new assignee is notified + emailed. `admin_reset` re-snapshots every multi-member step.
- **Cancellation**: `request_cancel` (student) sets `cancelRequested` and notifies admins; while pending, every other action, upload and sign is refused. `accept_cancel` (ADMIN) skips remaining steps, sets CANCELLED, and cascades to a linked in-flight defense; `decline_cancel` clears the flag. COMPLETED/CANCELLED submissions cannot be cancelled.
- **Delete** (ADMIN, typed "ลบ" confirmation in the panel): a PROPOSAL with any THESIS_DEFENSE built from it returns 409.

### Emails
- `sendStepEmail()` on every advance; rejection uses the red `buildRejectedHtml` template (step + reason; `step.notes` stores only the raw reason).
- `sendFinanceEmail()` fires on the ADMIN's approval of step 2 (`financeStepOf`, both types) with the latest FINANCE_ATTACH attached. Recipient: the designated finance-contact ADMIN, else `FINANCE_EMAIL`, else skipped.
- Multi-member roles get the in-turn member's email (`specificMemberId`).
- Formal Thai business-letter register (เรียน …, จึงเรียนมาเพื่อโปรดพิจารณาดำเนินการ, ขอแสดงความนับถือ + department signature).

---

## Submissions

### Proposal-first
- A student may hold only one PROPOSAL with `status !== "CANCELLED"` (`POST /api/submissions` blocks a second); cancel to start over.
- A THESIS_DEFENSE requires a COMPLETED, non-cancelled source proposal (`sourceProposalId`), one non-cancelled defense per proposal. It imports the committee into its own independent columns (edits never write back) and copies student info verbatim.

### Drafts
`DRAFT` means one thing: a submission the student is still filling in, with no workflow steps yet.
- Blank PROPOSAL: `POST /api/submissions/auto-draft-proposal` (get-or-create) → `ProposalDraftReview`.
- Defense: `POST /api/submissions/auto-draft-defense` (STUDENT-only, get-or-create, fired automatically when the defense tab opens with an eligible proposal) → `DefenseDraftReview`.
- Both save via `save_proposal_draft` / `save_defense_draft` with `confirm`:
  - `confirm: false` (บันทึกฉบับร่าง) — may be incomplete. Rejects only values that are present but malformed. Committee goes through `validatePeopleLenient` / `resolvePeoplePartial` (no role counts; empty rows skipped) plus `validateCommitteeAccountRoles(..., { requireAccount: true })` — a filled-in row whose account is gone or no longer fits the degree is a 400, not a silent drop.
  - `confirm: true` (ยืนยัน) — full validation (`validatePeople` / `resolvePeople` / `validateCommitteeAccountRoles`), builds the steps, sets IN_PROGRESS, notifies admins.
  - Client mirrors this: `validateForSave()` vs `validate()`.
- **Re-opening heals unusable members**: `buildPeopleFromSubmission` clears a row whose account was deleted or no longer fits (`Person.invalid: "MISSING" | "SCOPE"`); `rowInvalidReason()` also derives it live when the หลักสูตร changes. While any row is invalid, `validateNoInvalidRows` blocks both save and confirm. Nothing is marked while `users` is still empty (first fetch pending).

### Committee editor (`CommitteePeopleEditor`, `src/components/SubmissionForms.tsx`)
- Shared by `ProposalForm`, `DefenseForm`, both draft reviews and the admin edit form. Each row: role `<select>` + account `<select>` (existing accounts only, filtered by `committeeRoleScope` for the `program` prop). A no-longer-fitting account stays visible marked "(ไม่ตรงตามเงื่อนไข)".
- Row order (drag handle) **is the sign order** for multi-member roles (`committeeIds`/`coAdvisorIds`/`invitedCommitteeIds`).
- Default rows: ADVISOR, HEAD_EXAM_COMMITTEE, EXAM_COMMITTEE, INVITED_EXAM_COMMITTEE.
- PROGRAM_CHAIR is never a row — `ProgramChairAutoField` shows it read-only and it's injected into `people[]` before validation; submit is blocked if the program has no chair.
- Submitted shape: `{name, email, role, phone?}[]`; `resolvePeople` looks accounts up by email and **never creates one** — an unresolved email is a 400.
- Validation (form + API): counts per the composition table, valid emails, no member equal to the student's own email, one person one role. Exam date + time required on confirm.

### Exam logistics (`ExamLogisticsSection`)
วันที่สอบ + เวลา (`TimeSelect`: hour 00–23, minute 00/15/30/45 → `"HH:MM"`), ห้องประชุม / ที่จอดรถ checkboxes, เลขทะเบียนรถ inline when ที่จอดรถ is checked. `allowPastDate` only on the admin edit form.

### Admin submission edit (`AdminSubmissionPanel`, edit mode)
Uses the student's draft layout and components (`Section`/`Field`/`INPUT`, `CommitteePeopleEditor`, `ProgramChairAutoField`, `ExamLogisticsSection`). Differences: the admin may edit the student-info snapshot (name/code/email). ประธานหลักสูตร is resolved from the selected program (change it via "ตั้งค่าระบบ"). On save rows map back to id columns by email; a non-DRAFT is checked with `validatePeopleClient`, a DRAFT only with `validateNoInvalidRows`; errors show as a toast.

Server (`admin_update`): account types are checked (`validateResolvedCommitteeAccountRoles`) when a committee field or `program` changes; role counts (`validateResolvedCommitteeCounts`) only on a non-DRAFT.

---

## Documents

- **Versioning**: every form type has one display slot in `FileList` — the latest upload is current, older ones collapse under "ประวัติ". Non-student signers upload with the slot's real formType.
- **Single-version types** (`isSingleVersionForm`, `keepOnlyLatestVersion()` in `src/lib/uploadVersions.ts`): FINANCE_ATTACH (both types), plus the PROPOSAL's COVER_PAGE and LESSPAPER_RECEIPT. A new copy deletes the old row + storage object. For THESIS_DEFENSE, COVER_PAGE and LESSPAPER_RECEIPT keep history (its three LessPaper uploads share one slot).
- **Per-member uploads** (`PER_MEMBER_FORMS` / `isPerMemberForm()`, only the defense's B3): `POST /api/upload` requires a `memberId` on the committee; `FileList` and the admin list show one row per member.
- **File formats** (`formFileKind()`, enforced by `POST /api/upload` via magic bytes): FINANCE_ATTACH is .docx only (ZIP containing `word/document.xml`); every other type is PDF only.
- **Who may upload what**: FINANCE_ATTACH — ADMIN at step 2 only. COVER_PAGE / LESSPAPER_RECEIPT — ADMIN at their own steps; COVER_PAGE at the department-chair step — the department chair only.
- **Hidden from the student** (`isHiddenFromStudent()`): PROPOSAL FINANCE_ATTACH/FINANCE_DOC and THESIS FINANCE_ATTACH — dropped from the student's payloads (`mapSub`) and refused by the signed-URL route.
- **Finance form** (step 2, both types): the "สร้างเอกสารการเงินแนบกรรมการสอบ" card → `POST /api/submissions/[id]/finance-attach` (ADMIN, only while step 2 is current). `src/lib/financeDoc.ts` fills the department's template (`templates/finance-attach-*.docx`, shipped via `outputFileTracingIncludes`) with student name/code, สาขาวิชา, and one numbered row per committee member (head → advisor → co-advisors → externals → exam committee). Date/credits/signature/totals are left blank. The admin may download, edit in Word, and re-upload; a replacement whose body text differs (`docxText()`) shows a warning. Anchors throw if the template changes.
- **Memos** (`POST /api/submissions/[id]/cover-memo`, ADMIN, only at the memo step — `MEMO_STEP` per type): `src/lib/coverMemoDoc.ts` fills `templates/cover-memo-proposal.docx` (PROPOSAL step 12) or `templates/cover-memo-defense-result.docx` (THESIS step 12) — memo date = today, student/code, program, title, and the department chair's name. Returned as .docx, **not stored**; the admin converts to PDF and uploads it in the same card.
- **Download vs preview** (`src/lib/utils.ts`, both take the upload `id`): `downloadFile()` (signed URL → fetch → blob → `<a download>`, used for "ดาวน์โหลดเอกสารเพื่อลงนาม") and `previewFile()` (signed URL → new tab, everywhere else).
- **Sent-back signer keeps their upload**: in `SignatureButton`, a copy uploaded after `previousActiveStep()` was approved fills its slot (preview + "เปลี่ยนไฟล์") and counts as ready. `CommitteeSignPanel` doesn't do this (a newer copy may be another member's).
- **Admin per-step list** hides uploads on future PENDING steps (`isFutureStep`).
- **`FileList` groups** (`FILE_GROUPS_PROPOSAL` / `FILE_GROUPS_THESIS`): PROPOSAL — เอกสารหลัก / เอกสารการเงิน / เอกสารส่งคณะฯ / เอกสารอื่นๆ; THESIS — บ.2+บ.3 / เอกสารการเงิน / เอกสารส่งคณะฯ / เอกสารจากคณะและผลการสอบ / วิทยานิพนธ์. Labels are Thai form names (FORM_SHORT + FORM_LABELS), never filenames. FileList shows its own count — don't add one to `title`.

---

## Accounts & settings

### Account creation & passcodes
Every account is created through `POST /api/users` (`AppContext.superAdminAddUser`). The credential is a **passcode** (รหัสเข้าใช้งาน); users can't set their own. An admin may type one or click "สุ่มรหัส" (`PasscodeField`; pre-filled with `generatePassword()`, pattern `A00a00`). Server validation `isValidPasscode()` (6–72 chars, no whitespace); an omitted passcode is generated server-side. Reset: `PATCH /api/users/[id]` `{ resetPasscode: true, passcode? }`. Either way it's hashed and emailed (`sendWelcomeEmail` / `sendPasscodeResetEmail`). Email format `isValidEmail()`; duplicate email/studentId → 409. STUDENT accounts carry a unique `studentId`.

### Name title
`User.title` is the `NameTitle` enum (`PROF_DR` ศ.ดร., `ASSOC_PROF_DR` รศ.ดร., `ASST_PROF_DR` ผศ.ดร., `ASST_PROF` ผศ., `LECTURER_DR` อ.ดร., `DR` ดร., `MR` นาย, `MISS` นางสาว, `MRS` นาง), separate from `name`. `NAME_TITLE_LABELS` / `NAME_TITLES` / `formatUserName()` in `utils.ts` are the only mapping. Every account form has a "คำนำหน้าชื่อ" select. `Submission.studentFullName` is a creation-time snapshot with no title column (deliberately untouched).

### EXTERNAL account requests
A student requests a missing external examiner from the "กรรมการภายนอก" tab (`StudentExternalRequests`): `{title?, name, email, affiliation?, phone?}` → `ExternalCommitteeRequest` (PENDING). An amber notice says the member must already be approved in iThesis (display only). ADMIN sees pending requests at the top of `AdminUsersPanel`: **อนุมัติ** opens the add-user modal prefilled (email/role locked) and posts to `POST /api/users` with `externalRequestId` (marks APPROVED, links `createdUserId`, notifies the student); **ปฏิเสธ** → `PATCH /api/external-requests/[id]`. This is the **only** path to a new committee account from a student; PROFESSOR accounts are created by an ADMIN directly. `Notification.submissionId` is nullable for these.

### System settings (`SystemSetting` table, only via `src/lib/systemSettings.ts`)
Keys: `departmentChair`, `programChair:<PHD|ME_MECH|ME_CPS>`, `financeContact`. Rows are never deleted, only nulled; `clearUserFromSystemSettings()` runs on account delete. `attachSystemSettings()` adds computed `programChairFor: string[]` / `isFinanceContact` / `isDepartmentChair` to user payloads — **these only reach the client if listed in `mapUser()` in `api/users/route.ts` and `api/users/[id]/route.ts`**. A professor may chair several programs. Managed in `AdminSettingsPanel` ("ตั้งค่าระบบ"): department chair (PROFESSOR), 3 program chairs (PROFESSOR), finance contact (ADMIN) → `POST /api/admin/department-chair` / `program-chairs` / `finance-contact` (ADMIN-only, role-checked). With no department chair assigned, the DEPARTMENT_CHAIR steps have no one who can approve.

### Rank codes (ADMIN only)
`computeRankCodes()` gives each ADMIN/PROFESSOR/EXTERNAL/STUDENT account a code `A###`/`B###`/`C###`/`D###` from `User.rankOrder` (null last, then `createdAt`). `GET /api/users` attaches `rankCode` only for ADMIN callers. Reordered only by drag-and-drop in `AdminUsersPanel` when exactly one role pill is selected and search/filter are clear → `POST /api/admin/users/reorder` (409 on a stale list).

### Deleting a user
`DELETE /api/users/[id]` is a hard delete. `Submission.studentId` and `FormUpload.uploadedById` (required relations → Restrict) block it; `describeDeleteBlockers()` returns a 409 naming each blocker with counts (and suggests deleting a lone DRAFT first). `Submission.advisorId` and `WorkflowStep.actedById` are optional → SET NULL (silently cleared). Committee id arrays aren't FKs (ids can dangle). `ExternalCommitteeRequest`: `requestedById` Cascade, `createdUserId` SetNull — never blocks. Verify FK behavior against `pg_constraint`, not the schema.

---

## UI

### Action cards — one design for every role
Every "your turn" card (`StudentSubmissionActions`, `SignatureButton`, `CommitteeSignPanel`, `AdminSubmissionPanel`'s action and finance cards) is composed only from `src/components/FileUploader.tsx`'s exports: `ACTION_CARD`, `SectionLabel`, `DownloadRow`/`NoDownloads`, `UploadSlot`/`FileUploader`, `B1Checklist`, `NotesField` (`reject`/`sendBack`), `ActionError`, `PRIMARY_BUTTON`, `REJECT_BUTTON`/`SEND_BACK_BUTTON`, the confirm/cancel buttons, `postUpload()`. Fixed order: ① download → ② sign/fill → ③ upload (absent sections are skipped and the rest renumber; a picker is a numbered section) → checklist → notes → primary button with ปฏิเสธ (or ส่งกลับ for admin). Extra context goes inside the card (`SignatureButton`'s `intro`). Picked files upload when the primary button is pressed (the finance card is the only immediate-upload card). Errors inline, not toasts. Don't hand-roll a new card.

`FileUploader` slots render a `SlotHeader`: FORM_SHORT badge + description + status chip.

### Checklist wording (`src/lib/utils.ts`)
Every signing step has an own-signature checklist (`SIGN_CHECKS`, `PROPOSAL_SIGN_CHECKS`, `SIGN_RESULT_CHECKS`). Own signature → "ท่านลงนามใน ‹เอกสาร› แล้ว (N ตำแหน่ง)"; on student lists the student is "นิสิต"; another's → "‹ผู้ลงนาม›ลงนามใน ‹เอกสาร› แล้ว (N ตำแหน่ง)"; every item ends in แล้ว; admin items state the result (no leading "ตรวจสอบ"). Vocabulary: "ลงนาม" (not มีลายมือชื่อ), "คณะกรรมการสอบ" / "กรรมการแต่ละท่าน", "อาจารย์ที่ปรึกษา" (never …หลัก), "หัวข้อวิทยานิพนธ์", "คณะฯ", "iThesis", "บาร์โค้ด", "ตำแหน่ง" (never จุด). Titles: student "กรุณาตรวจสอบ ‹เอกสาร› ก่อนส่ง", signers "… ก่อนส่งต่อ", admin "กรุณาตรวจสอบก่อนอนุมัติ".

### Dashboard shell
`src/app/dashboard/layout.tsx` is the one top bar, re-exported by each landing page's `layout.tsx`: system name + date left, user name + email center, `LanguageToggle` (shows the current language) + `NotificationBell` + "Logout" right. No nav links, no per-role branching. Landing pages have no width cap and no header card (`DashboardHeader.tsx` is unused).

### English toggle (`LanguageToggle`)
There is no i18n framework: EN mode walks the DOM (MutationObserver) and rewrites Thai text through
the `TH_EN` dictionary in `src/lib/translations.ts`; switching back to TH reloads the page.
- Longest key wins (sorted at load, so file order doesn't matter). Keys under 8 characters match
  only as a standalone token — no Thai character touching either end — so ท่าน never hits เท่านั้น
  and ดี never hits a name like ตั้งใจดี.
- Add a key per DOM text node: the whole sentence, or for a template string each static piece
  around its `${…}` values. A sentence with no key comes out half-Thai.
- **User data is wrapped in `translate="no"`** (names, thesis titles, plates — `ReadOnlyField` /
  `InfoField` / `InfoRow` take a `data` prop for this) and is never rewritten. Do the same for
  any new place that renders a name or title.
- `formatDate()` switches locale itself. Only text nodes, `placeholder` and `title` are translated
  (not `aria-label` or input values).

### Admin dashboard (`/admin-dashboard`; `/dashboard/admin` redirects here)
Three equal-width tabs in one scroll-contained frame (`max-h-[75vh] overflow-y-auto`):
1. **จัดการคำร้อง** — "งานที่ต้องดำเนินการ" task box (cancel requests first, then ADMIN steps); type pills, search, status tabs with counts; submission cards sorted by stuck days (badge past 7 days, red "ขอยกเลิก" pill). Clicking a card expands `AdminSubmissionPanel` inline (one at a time, scrolled into view). Deleting is only from inside the panel.
2. **จัดการผู้ใช้งาน** — `AdminUsersPanel`: pending EXTERNAL requests on top, role pills + search + "มีคำร้องที่ยังไม่ถูกยกเลิก" filter, account list (expand → `UserDetailPanel`), add-user modal, demo tools. Also at `/dashboard/admin/users` (and `[uid]`, which the submission list links to).
3. **ตั้งค่าระบบ** — `AdminSettingsPanel` (also below `AdminUsersPanel` at `/dashboard/admin/users`).

Submission detail stays at `/dashboard/admin/[id]` (a wrapper around `AdminSubmissionPanel`). Its committee panel lists every person, with mailto links.

### Professor dashboard (`/professor-dashboard`)
Every submission the user is involved in (as `GET /api/submissions` scopes it), with status tabs + counts. Within a status, "your turn" sorts first. Badges: orange "อาจารย์ — ‹step›" when it's their turn, green/red "ท่านอนุมัติแล้ว/ท่านปฏิเสธแล้ว" after acting. Card badges use the generic "อาจารย์" label.

### Student dashboard (`/student-dashboard`; `/dashboard/student` redirects here)
Three tabs — สอบโครงร่าง / สอบวิทยานิพนธ์ / กรรมการภายนอก — in a scroll-contained frame. Until the student clicks a tab, it lands on the defense tab if any non-cancelled THESIS_DEFENSE exists, else the proposal tab. The student does everything here without leaving the page.
- **Proposal tab**: with no proposal, `ProposalForm readOnlyPreview` (a disabled template) with a live "+ สร้างร่างคำร้อง" button in `FormHeader`'s `action` slot → auto-draft-proposal → `ProposalDraftReview`. A "ความคืบหน้าปัจจุบัน (0/N)" preview `WorkflowTimeline` (`preview` prop: nothing shown as current) stays visible until a real proposal exists; then `StudentSubmissionActions` renders it.
- **Defense tab**: auto-creates the defense draft (spinner while loading) → `DefenseDraftReview` → after confirm, `StudentSubmissionActions`. Without an eligible proposal: a locked card + preview timeline.
- **"รายการอื่นๆ"**: cancelled/superseded submissions, linking to `/dashboard/student/[id]`.
- The cancel request sits below the action card; no cancel once COMPLETED.

Shared pieces: `StudentSubmissionActions` (`{ submissionId }`, self-contained student action surface; also wrapped by `/dashboard/student/[id]`), `SubmissionInfoPanel` (read-only student/committee/exam block), `SubmissionForms.tsx` (`ProposalForm`/`DefenseForm` take `onCreated(sub)`; `/dashboard/student/submit` still wraps them).
