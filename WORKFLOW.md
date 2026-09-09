# Workflow reference — ระบบจัดการวิทยานิพนธ์

Standalone reference for the thesis approval workflow: every step, in order, for both submission
types. This is extracted from `AGENTS.md` (the authoritative, AI-loaded spec) for human reading —
if the two ever disagree, **`AGENTS.md` wins**; update this file to match it, not the other way
around.

There are two submission types, each its own fixed sequence of steps:

- **PROPOSAL** — 11 steps
- **THESIS_DEFENSE** — 22 steps

Both are **sequential only** — no parallel signing. Exactly one step is `PENDING` at a time; a
submission cannot skip ahead.

---

## Roles

### In-system roles (have accounts and log in)

| Role | Thai | What they do |
|---|---|---|
| Super Admin | ผู้ดูแลระบบสูงสุด | Account management only (SUPER_ADMIN + ADMIN accounts). **No submission workflow access at all** — cannot view, approve, reject, or override any submission. Sees system-wide read-only counts. |
| Admin | เจ้าหน้าที่ภาควิชา (พี่โบ้) | Owns the entire submission workflow exclusively — approves/rejects/overrides steps, relays documents to Faculty, forwards docs to Student. Also manages ADMIN/PROFESSOR/STUDENT accounts. |
| Student | นิสิต | Always starts with a PROPOSAL; creates a THESIS_DEFENSE only from an existing completed one (committee imported, editable). Uploads documents, assigns committee members at creation, tracks status. Landing page `/student-dashboard`. |
| Advisor | อาจารย์ที่ปรึกษา | Signs forms at their steps. |
| Co-Advisor | อาจารย์ที่ปรึกษาร่วม | Signs immediately after Advisor at every Advisor step. **Optional** — auto-skipped when none assigned; multiple allowed, signed sequentially. |
| Program Chair | ประธานหลักสูตร | Signs at multiple phases. Assigned per-submission by the student. |
| Head Exam Committee | ประธานกรรมการสอบ | Signs before the regular committee. Assigned per-submission by the student. |
| Exam Committee | กรรมการสอบ | Multiple members, sign separately in sequence. Assigned per-submission by the student. |
| Invited Exam Committee | กรรมการภายนอก | External examiner. Assigned per-submission by the student; must already have an account (see "Committee people must pre-exist" below). |

A single PROFESSOR account can hold several of these contextual roles across (or within) one
submission — same email, multiple hats.

### External roles (no account, no login)

| Role | How they interact |
|---|---|
| Faculty Dean | Signs บ.4 physically, offline. |
| Finance | Receives an email at PROPOSAL step 3 and THESIS_DEFENSE step 6. |
| Graduate School | Receives the final document package outside the system. |

---

## PROPOSAL workflow (11 steps)

### Phase 1 — Steps 1–3: บ.วศ.1ก + บ.วศ.1ข

| Step | Role | Action |
|---|---|---|
| 1 | STUDENT | Upload บ.วศ.1ก + บ.วศ.1ข + เอกสารการเงิน. **Starts PENDING** — student must submit to advance. |
| 2 | ADMIN | Review and approve. |
| 3 | PROGRAM_CHAIR | Sign บ.วศ.1ก → **triggers the finance email**. |

### Phase 2 — Steps 4–11: บ.วศ.1ค + บ.วศ.1ง

| Step | Role | Action |
|---|---|---|
| 4 | STUDENT | Upload บ.วศ.1ค + บ.วศ.1ง. |
| 5 | HEAD_EXAM_COMMITTEE | Sign บ.วศ.1ค. |
| 6 | ADVISOR | Sign บ.วศ.1ค. |
| 7 | CO_ADVISOR | Sign บ.วศ.1ค — **auto-skipped if no co-advisors assigned**. |
| 8 | INVITED_EXAM_COMMITTEE | Sign บ.วศ.1ค. |
| 9 | EXAM_COMMITTEE | All members sign บ.วศ.1ค + บ.วศ.1ง (sequential). |
| 10 | ADMIN | Verify and approve. |
| 11 | PROGRAM_CHAIR | Sign บ.วศ.1ค + บ.วศ.1ง. |

Rejection sends it back to the student for correction — it stays marked REJECTED on the same step (does not move) until the student resubmits. (ส่งกลับ, a separate admin-only action, is what actually moves back one step.)

---

## THESIS_DEFENSE workflow (22 steps)

### Phase 3 — Steps 1–6: บ.2 + บ.3

| Step | Role | Action |
|---|---|---|
| 1 | STUDENT | Upload บ.2 + บ.3 + เอกสารการเงิน. **Starts PENDING** — student must submit to advance. |
| 2 | EXAM_COMMITTEE | All members sign บ.3 (sequential). |
| 3 | ADVISOR | Sign บ.2. |
| 4 | CO_ADVISOR | Sign บ.2 — **auto-skipped if no co-advisors assigned**. |
| 5 | HEAD_EXAM_COMMITTEE | Sign บ.2. |
| 6 | PROGRAM_CHAIR | Sign บ.2 → **triggers the finance email** + notifies admin. |

### Phase 4 — Steps 7–8: Faculty relay

| Step | Role | Action |
|---|---|---|
| 7 | ADMIN | Collect บ.2+บ.3, send to Faculty, approve to confirm delivery. |
| 8 | ADMIN | Receive signed documents back from Faculty, upload them, forward to student, then approve → triggers invitation emails. |

Faculty returns: ใบรายงานผลการสอบ, แบบรายงานฯ, invitation letter, and (Very Good evaluations only)
แบบประเมิน "วิทยานิพนธ์ดีมาก". Step 8 requires **all 4** document types uploaded — the signed
report, ใบรายงานผลการสอบ, the invitation letter, and a finance document — before admin can approve.

### Phase 5 — Steps 9–15: Post-defense signing

| Step | Role | Action |
|---|---|---|
| 9 | STUDENT | Fill in info, sign แบบรายงานการเสนอผลงานฯ, upload it. |
| 10 | ADVISOR | Sign แบบรายงานฯ + ใบรายงานผลการสอบ. |
| 11 | CO_ADVISOR | Sign ใบรายงานผลการสอบ — **auto-skipped if no co-advisors assigned**. |
| 12 | HEAD_EXAM_COMMITTEE | Sign ใบรายงานผลการสอบ. |
| 13 | EXAM_COMMITTEE | All members sign ใบรายงานผลการสอบ (sequential). |
| 14 | INVITED_EXAM_COMMITTEE | Sign ใบรายงานผลการสอบ. |
| 15 | PROGRAM_CHAIR | Sign ใบรายงานผลการสอบ. |

### Phase 6 — Steps 16–22: Thesis submission + cover signing

| Step | Role | Action |
|---|---|---|
| 16 | STUDENT | Upload บ.4 + เล่มวิทยานิพนธ์ (from the e-thesis system, with barcode). |
| 17 | PROGRAM_CHAIR | Sign บ.4. |
| 18 | ADVISOR | Sign the thesis cover (3 points). |
| 19 | CO_ADVISOR | Sign the thesis cover — **auto-skipped if no co-advisors assigned**. |
| 20 | HEAD_EXAM_COMMITTEE | Sign the thesis cover. |
| 21 | EXAM_COMMITTEE | All members sign the thesis cover (sequential). |
| 22 | INVITED_EXAM_COMMITTEE | Sign the thesis cover. |

Rejection stays on the same step (marked REJECTED, does not move) until the student resubmits. (ส่งกลับ, a separate admin-only action, is what actually moves back one step.)

---

## How a step actually advances

- **Step 1 is never auto-approved.** Every submission starts with step 1 `PENDING` — the student
  must upload the required documents and click submit before step 2 can begin.
- **Required uploads gate student steps.** A STUDENT step can't advance until specific form types
  are uploaded:
  - PROPOSAL step 1 → บ.วศ.1ก + บ.วศ.1ข + เอกสารการเงิน; step 4 → บ.วศ.1ค + บ.วศ.1ง
  - THESIS_DEFENSE step 1 → บ.2 + บ.3 + เอกสารการเงิน; step 9 → the signed report; step 16 → บ.4 +
    เล่มวิทยานิพนธ์
  - PROPOSAL step 4 additionally needs an admin-uploaded finance document before the student can
    advance — shown as a yellow card on the admin dashboard whenever that step is pending.
- **EXAM_COMMITTEE and CO_ADVISOR steps are committee steps** — every assigned member must sign
  before the step completes; each member's decision is tracked individually and they sign in
  sequence, not all at once.
- **CO_ADVISOR auto-skip.** If a submission has no co-advisors assigned at creation, every
  CO_ADVISOR step across the whole workflow is created already `SKIPPED` — it's transparently
  bypassed and never shown in any step list or timeline.
- **Rejection stays on the step it happened at — it does not silently move anywhere.** The step is
  marked `REJECTED` and the submission status becomes `REJECTED`. Nothing else can happen (no
  approve, no second reject) until the **student resubmits**, which resets only that one step back
  to `PENDING` and the same reviewer reviews it again. Any involved role can reject; an admin
  rejection requires a written reason.
- **Send-back (ส่งกลับ) is a separate, admin-only action** — distinct from rejection. It resets both
  the current step *and* the previous step back to `PENDING` so the previous role acts again. Not
  available on the first step.
- **Document versioning:** every form type keeps one slot — the latest upload is current, older
  ones collapse into history. Nothing is ever shown as a flat pile of separate files.

---

## Before the workflow: proposal-first, committee accounts, cancellation

- **One active proposal, defense created from a completed one.** A student can't start a second
  PROPOSAL while an existing one is anything other than `CANCELLED` (even `COMPLETED` counts as
  active — it must be cancelled first to start over). A THESIS_DEFENSE can only be created from a
  `COMPLETED`, non-cancelled proposal, and imports that proposal's committee as its own editable,
  independent copy — changing it never changes the original proposal.
- **Committee people must already have an account.** Every person a student names (proposal
  creation, or editing the imported committee at defense creation) must already have a login — the
  system no longer creates accounts automatically. If any email doesn't match an existing account,
  the submission is saved as a **draft** (no workflow steps yet) until ADMIN creates the missing
  account(s) on a dedicated request queue; the student is notified and must return to continue it.
- **Cancelling requires ADMIN approval.** A student's cancel request doesn't cancel immediately —
  it freezes the submission (no uploads, approvals, or signing by anyone) until ADMIN either
  accepts (cancels it for real) or declines (unfreezes it, nothing changes).

---

## Who sees which documents at each step

Each role only sees the documents relevant to their own step:

```
PROPOSAL:       3→บ.วศ.1ก   5→บ.วศ.1ค   6→บ.วศ.1ค   7→บ.วศ.1ค   8→บ.วศ.1ค   9→บ.วศ.1ค   11→บ.วศ.1ค+1ง
                (steps 2, 10 are ADMIN approve-only — nothing to sign, no document view here)

THESIS_DEFENSE: 2→บ.3   3→บ.2   4→บ.2   5→บ.2   6→บ.2
                (steps 7, 8 are ADMIN relay/upload-only — no document view here)
                10→แบบรายงานฯ+ใบรายงานผลการสอบ   11–15→ใบรายงานผลการสอบ
                17→บ.4   18–22→เล่มวิทยานิพนธ์
```

---

## Notifications

- **Step emails** fire automatically to the next responsible person every time a step advances,
  linking to `/login` (email + passcode) — there is no auto-login link (magic-link login was
  removed 2026-09-09).
- **Finance emails** fire at exactly two points — PROPOSAL step 3 and THESIS_DEFENSE step 6 (both
  PROGRAM_CHAIR approvals) — with the latest finance-attachment file included.
- **Rejection emails** use a distinct red/formal template naming the step and the reason.
- An in-app notification bell mirrors all of the above for the recipient.

---

## Who can act on submissions at all

Only **ADMIN** and the contextual role assigned to the current step can act on a submission.
**SUPER_ADMIN has no submission access whatsoever** — not view, not approve, not override — that
responsibility belongs to ADMIN alone. See `AGENTS.md` for the account-management side of this
split (who can manage which user accounts).
