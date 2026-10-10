# Changelog

Dated, human-readable record of notable changes to the Thesis Management System. Newest first.
This starts from 2026-09-06 — for anything earlier, see `git log` and `SESSION-REPORT-2026-09-04.md`
(the ownership-transfer session). Not every commit needs an entry here — skip pure typo/formatting
fixes; do write one for anything that changes behavior, permissions, routes, or schema.

## 2026-10-10

- **PROPOSAL committee signing order changed.** Step 5.x (stepOrder 5–9) now runs advisor →
  co-advisors → exam committee → head of exam committee → external (was head → advisor →
  co-advisors → external → exam committee). `PROPOSAL_ROLES` and `PROPOSAL_STEP_NAMES` reordered;
  the head's ผ่าน/ไม่ผ่าน picker in `RoleSubmissionDetail` is now keyed on the step's role instead of
  stepOrder 5. Only new proposals get the new order (steps are snapshotted at creation); both
  existing proposals are COMPLETED and were not touched.
- **THESIS_DEFENSE committee signing order changed to match.** Step 8.x (stepOrder 8–11) now runs
  co-advisors → exam committee → head → external (head and exam committee swapped: stepOrder 9 is
  now EXAM_COMMITTEE, 10 HEAD_EXAM_COMMITTEE). Step 7 (advisor picks the result) is unchanged.
  `THESIS_ROLES` and `THESIS_STEP_NAMES` reordered; nothing else keys on stepOrder 9/10. New
  defenses only.

## 2026-10-08

- **Exam-reminder emails removed.** The daily `/api/cron/exam-reminders` job no longer emails the
  student 14 and 7 days before the exam; `sendExamReminderEmail` and its template are deleted from
  `src/lib/email.ts`. The cron still creates the same in-app bell notifications (student, admins,
  advisor, and at 7 days the current step's owner).

## 2026-10-06

- **PROPOSAL step 8: new cover-memo template.** `templates/cover-memo-proposal.docx` replaced with the
  department's full letterhead memo ("บันทึกข้อความ เรื่อง ขออนุมัติโคร่งร่าง.docx"). `buildCoverMemoDocx`
  now fills the memo date (the day it is generated), name ×2, code ×2, หลักสูตร + สาขาวิชา, title and the
  department chair's name — same inputs as the defense memo, so the route builds one data object for
  both; the exam date is no longer printed. The step-8 card shows วันที่/ผู้ลงนาม instead of วันสอบ.

- **THESIS_DEFENSE step 9 (stepOrder 12): the system generates the result memo, and the department
  chair signs it in the system at step 10.** The admin's step-9 card gains the same
  "สร้างบันทึกข้อความ" → download (.docx) → upload PDF flow as PROPOSAL step 8:
  `POST /api/submissions/[id]/cover-memo` now also serves a defense at `THESIS_STEP.ADMIN_RESULT_CHECK`,
  filling `templates/cover-memo-defense-result.docx` (the department's "ขอส่งผลสอบวิทยานิพนธ์";
  `buildDefenseResultMemoDocx`) with the date, name, code, degree, สาขาวิชา, title and the department
  chair's name. The PDF is stored as `COVER_PAGE` (approve server-gated); step 10 (stepOrder 13)
  now signs ใบรายงานผล **and** the memo (signed copy must be newer than step 9, server-gated; upload
  route lets the admin upload COVER_PAGE at 12 and the chair at 13, no longer the admin at 14).
  Step 11 (stepOrder 14) no longer uploads a cover page — only the LessPaper document; it lists the
  signed memo under download. Checklists, step names 12/13, admin task labels and translations updated.
  No defense was in flight, so no rows needed changing (the step roles are unchanged).

- **PROPOSAL grows from 12 to 14 steps (shown 1–4, 5.x, 6–10): the system generates the cover memo,
  the department chair signs it in the system, and the LessPaper upload moves to a new last step.**
  Step 8 (stepOrder 12): the admin clicks "สร้างบันทึกข้อความ" →
  `POST /api/submissions/[id]/cover-memo` fills `templates/cover-memo-proposal.docx` (the department's
  "ขอส่งแบบอนุมัติโครงร่างวิทยานิพนธ์พร้อมรายชื่ออาจารย์ที่ปรึกษาและคณะกรรมการสอบวิทยานิพนธ์"; generator
  `src/lib/coverMemoDoc.ts`) with name, code, หลักสูตร, title and exam date, then shows those values and a
  separate "ดาวน์โหลดบันทึกข้อความ (.docx)" button once it finishes (not
  stored); the admin uploads it back as an unsigned PDF `COVER_PAGE`. New step 9 (stepOrder 13,
  `DEPARTMENT_CHAIR`) signs it and uploads the signed PDF (must be newer than step 8's approval). New
  step 10 (stepOrder 14, ADMIN) delivers to the Faculty and uploads `LESSPAPER_RECEIPT` — the proposal's
  last step. Named stepOrders in `PROPOSAL_STEP`; the department chair is now involved in every
  submission, not only defenses (list scoping, GET/reject, uploads, signed URLs, detail page). Upload
  route lets the department chair upload COVER_PAGE at stepOrder 13 only. Checklists
  `ADMIN_STEP8_CHECKS` (reworked) / `ADMIN_STEP10_CHECKS` / the chair's own-signature box, step names,
  task labels and translations added. The one in-flight proposal (`cmuv9ul2l…`, at step 8) was
  backfilled with PENDING rows for stepOrders 13–14 (insert-only, one-off script, deleted).

- **THESIS_DEFENSE step 14 (stepOrder 17): the department head signs บ.4 only, not the thesis.**
  `STEP_SIGN_FORMS[17]` is `["B4"]` and the own-signature checklist is the one บ.4 item. Step name,
  the admin's step-13/15 wording and translations updated.
- **THESIS_DEFENSE: the thesis-package LessPaper upload moved from step 13 (stepOrder 16) to step 15
  (stepOrder 18).** Step 13 is now a plain check (3-item checklist, no upload); step 15 delivers the
  chair-signed บ.4 + the thesis (now listed under ① download) and uploads a LessPaper document newer than
  step 14's approval, with the same task-list wording and checklist item as steps 4 and 11. Server gate
  (`REQUIRED_UPLOADS`), `FRESH_UPLOAD_AFTER_STEP`, the upload route (steps 4, 11, 15), step names and
  admin-dashboard task labels follow.

- **THESIS_DEFENSE step 12 (stepOrder 15): the student uploads only the first 5 pages of the thesis.**
  The THESIS upload is now the first 5 pages downloaded from iThesis — ปกภาษาไทย, ปกภาษาอังกฤษ,
  หน้าลายมือชื่อคณะกรรมการสอบ, บทคัดย่อภาษาไทย, บทคัดย่อภาษาอังกฤษ — already barcoded, and the thesis
  must not be edited in iThesis after downloading. Upload instructions, step name, `FORM_LABELS.THESIS`
  ("วิทยานิพนธ์ 5 หน้าแรก (จากระบบ iThesis)"), the student's checklist (`DEFENSE_STEP15_CHECKS`: +5-pages,
  +not-edited, barcode split out) and the admin's step-13 check/task text updated; also removed the
  last "e-thesis"/"barcode" wording from the student screen. Translations added. No server change.

- **THESIS_DEFENSE step 11 (stepOrder 14) also takes a LessPaper receipt document.** Same upload box,
  instruction line and checklist item (`LESSPAPER_CHECK`) as step 4; must be newer than step 10's
  approval (`freshUploadCutoff`), gated client- and server-side (`REQUIRED_UPLOADS`), and
  `POST /api/upload` now accepts a defense's `LESSPAPER_RECEIPT` at steps 4, 11 and 13. Wording made
  consistent with step 4: the task list reads "นำส่ง … / เลือกไฟล์เอกสารที่มีเลขรับ… / ทำเครื่องหมาย
  รายการตรวจสอบ แล้วกดอนุมัติเพื่อยืนยันว่านำส่งแล้ว", and both steps' names and admin-dashboard task
  labels now end in "และอัปโหลดเอกสารเลขรับ LessPaper" (matching step 13).

- **THESIS_DEFENSE steps 6–7 reworked: the advisor picks the exam result and fills in ใบรายงานผลการสอบ.**
  Step 6 (student) requires `SIGNED` + a blank `EXAM_RESULT` + `VERY_GOOD_EVAL` — the evaluation
  form is now always uploaded, filled in only when the result is ดีมาก — with a checklist box for each;
  the student's result picker is gone. Step 7 (advisor) picks ดีมาก/ดี/ผ่าน/ไม่ผ่าน (`ExamResultPicker`
  lead section; the server now requires the `ผลการสอบ:` note line at step 7 instead of step 6, and
  `defenseExamResult()` reads step 7), can download the student's evaluation form
  (`SignatureButton` `downloadOnly`), fills in all of ใบรายงานผลการสอบ and signs it (the card's ②
  section is "กรอกข้อมูลและลงนามในเอกสาร" via the new `signSection` prop), and is gated on `SIGNED` +
  `EXAM_RESULT` both newer than step 6's approval (`REQUIRED_UPLOADS`, `FRESH_UPLOAD_AFTER_STEP`).
  Step 9 (stepOrder 12, the ADMIN's result check) shows a purple "ผลการสอบ ดีมาก" note in its task card
  when the advisor picked ดีมาก, asking the admin to also check the evaluation form.
  The student's re-pick-the-result resubmit flow (`resubmit` + `examResult`, `hasVeryGoodEval`) was
  removed. Step names, checklists and translations updated. No schema change; no in-flight defense
  was affected.

- **THESIS_DEFENSE steps 4 and 13 (stepOrders 4 and 16) take a LessPaper receipt instead of a
  บันทึกข้อความ.** Neither step has a cover page any more: the `COVER_PAGE` upload box, its
  "หัวหน้าภาควิชาลงนามในบันทึกข้อความแล้ว" checkbox and the server approve gate are gone from
  both, and `POST /api/upload` now accepts a defense's `COVER_PAGE` only at step 11
  (`ADMIN_RESULT_SEND`). Both steps instead have the "อัปโหลดเอกสารที่มีเลขรับโดยคณะผ่านระบบ
  LessPaper" box plus the same checkbox PROPOSAL step 8 uses (`LESSPAPER_CHECK` in `utils.ts`),
  gated client- and server-side (`REQUIRED_UPLOADS.THESIS_DEFENSE`). Step 13's copy must be newer
  than step 12's approval (`freshUploadCutoff`, which now applies to the LessPaper file at that
  step), and `LESSPAPER_RECEIPT` keeps every version for a defense — the step-4 copy moves under
  ประวัติ. Step names, instructions, admin task labels, step 15's "emailed to the Faculty" wording
  (no longer "พร้อมบันทึกข้อความ") and translations updated to match. No schema change.

## 2026-10-05

- **PROPOSAL step 8 now also requires the Faculty's LessPaper receipt** ("เลขรับเอกสารที่ออกโดย
  คณะผ่านระบบ LessPaper"). New `FormType` value `LESSPAPER_RECEIPT` (PDF, single version, ADMIN-only
  at stepOrder 12, listed under เอกสารส่งคณะฯ). The admin's step-8 card has a second upload box
  next to the บันทึกข้อความ, `ADMIN_STEP8_CHECKS` gains a fourth item confirming it was uploaded,
  and approve is gated on the file client- and server-side (`REQUIRED_UPLOADS.PROPOSAL[12]`).
  Needs `prisma db push` for the new enum value before deploying.

- **"ใบปะหน้า" is now called "บันทึกข้อความ" everywhere in the UI** (the `COVER_PAGE` form the
  ADMIN uploads at PROPOSAL step 8 and THESIS_DEFENSE steps 4/11/13): form labels, step names,
  checklists, admin task labels, upload-route errors, and the Thai keys in `translations.ts`.
  The enum value `COVER_PAGE` and the English translations ("cover page") are unchanged.

- **PROPOSAL step 4's name now says the proposal exam must already be done**: "หลังสอบโครงร่างแล้ว —
  นิสิตอัปโหลด บ.วศ.1 (กรอก บ.วศ.1ค + บ.วศ.1ง)" (`PROPOSAL_STEP_NAMES`, plus its English entry in
  `translations.ts`, which is keyed on the Thai string). Display text only; no workflow change.

- **A proposal with any defense built from it can no longer be deleted.** `DELETE
  /api/submissions/[id]` used to refuse only while the linked THESIS_DEFENSE was still running, so a
  proposal whose defense was `COMPLETED` or `CANCELLED` could be deleted, silently nulling the
  defense's `sourceProposalId`. It now refuses (409) for a linked defense of any status, and the
  admin panel's "ลบคำร้อง" card shows why instead of the delete button. Delete the defense first.

- **`/super-dashboard`'s user directory now lists EXTERNAL (กรรมการภายนอก) accounts.** The page
  grouped the directory by a hard-coded role list that left out `EXTERNAL`, so those accounts were
  fetched but never rendered (the header count included them). Added `EXTERNAL` to that list and
  to `GET /api/super-admin/users`' sort order (between PROFESSOR and STUDENT); the role-reference
  card on the same page gains an EXTERNAL entry too.

## 2026-10-01

- **Checklist wording made consistent across every step, plus the missing checklists.** One
  style everywhere (rules in `AGENTS.md` → "Checklist wording"): "ท่าน" for one's own signature,
  "นิสิต" on the student's lists, every item ends in แล้ว, signature counts as "(N ตำแหน่ง)",
  คณะกรรมการสอบ / หัวข้อวิทยานิพนธ์ / คณะฯ / iThesis (e-thesis was wrong) / บาร์โค้ด, no
  "อาจารย์ที่ปรึกษาหลัก", and one title pattern per role. New required checklists: defense step 3
  (chair signs บ.2), 8.x and 10 (ใบรายงานผลการสอบ signers), step 4 (`ADMIN_DEFENSE_RELAY_CHECKS`:
  cover page signed + sent to the Faculty), and a cover-page-signed item on steps 11 and 13.

- **Defense step 16 wording: the Faculty's reply is the Dean-signed documents.** Step name, the
  admin's checklist and to-do card, and the admin-dashboard task label now say the admin forwards
  the documents from the Faculty that the Dean (คณบดี) has signed, not just a "feedback email".

- **THESIS_DEFENSE ends with the student confirming iThesis — 20 steps (shown 1–17).** New last step
  (`THESIS_STEP.STUDENT_ITHESIS`, shown 17): after the admin forwards the Faculty's feedback, the
  student ticks "ส่งเอกสารที่จำเป็นทั้งหมดเข้าระบบ iThesis เรียบร้อยแล้ว" and presses ยืนยัน — nothing
  is uploaded; that completes the defense. The test defense got the new row inserted before it
  reached its end.

- **THESIS_DEFENSE: thesis goes to the Faculty via the admin and the department chair — 19 steps
  (shown 1–16).** After the student's บ.4 + thesis (shown 12): the ADMIN checks them and uploads a
  new cover page (13, server-gated on a cover page newer than the student's upload), the
  department chair signs **both** บ.4 and the thesis (14 — replaces the program chair's บ.4
  step), the ADMIN confirms emailing them to the Faculty (15), and the ADMIN confirms forwarding
  the Faculty's feedback to the student (16, the last step). New `THESIS_STEP` names
  `ADMIN_THESIS_CHECK`/`DEPT_CHAIR_THESIS`/`ADMIN_THESIS_SEND`/`ADMIN_THESIS_FORWARD` (`CHAIR_B4`
  removed); the test defense `cmuoyo8l…` had its untouched tail rebuilt to match.

- **THESIS_DEFENSE: no in-system thesis-cover signing — 16 steps (shown 1–13).** The five steps where
  the advisor, co-advisors, head, exam committee and external members signed the thesis cover are
  removed; the student uploads the thesis at step 15 (shown 12) already signed by the whole
  committee (new checklist item + upload note), and the program chair's บ.4 signature (shown 13)
  completes the defense. The test defense `cmuoyo8l…` had its five now-unused PENDING rows deleted.

- **Professor dashboard: "✓ ท่านอนุมัติแล้ว" no longer shows while it's the professor's turn again.**
  The badge reflects the last step they acted on, so an advisor who approved step 7 saw it on a
  defense waiting for their thesis-cover signature (step 14). It's now hidden whenever a later step
  is their turn, and names the step it refers to ("(ขั้นที่ 7)").

- **Action-card review across roles — two bugs fixed, cards made consistent.**
  - The department chair could not open a defense (`RoleSubmissionDetail`'s access guard didn't
    know the role), so stepOrder 13 could never be signed from the UI.
  - The "ถึงคิวของท่านแล้ว" banner showed for every member of a sequential committee step, not
    just the one whose turn it is — it now uses `AppContext.needsMyAction`.
  - The admin card gained a ① download section (`ADMIN_STEP_FORMS` in `AdminSubmissionPanel` —
    the documents each admin step checks, one row per member for บ.3), ส่งกลับ now sits beside
    อนุมัติ with the shared button styles and `NotesField sendBack`, success toasts on approve /
    send-back, and the "สิ่งที่ต้องดำเนินการ" box covers PROPOSAL steps 2, 6 and 8 too.
  - The advisor's exam-result notice and the proposal head's ผ่าน/ไม่ผ่าน picker moved inside the
    signer card (`SignatureButton` `intro` / `leadSection`); `ExamResultPicker` is now a numbered
    card section (with `options`/`hint` for the ผ่าน/ไม่ผ่าน case).
  - Student: the defense step-6/12 confirmations use `B1Checklist` (`DEFENSE_STEP6_CHECKS`,
    `DEFENSE_STEP15_CHECKS`); the cancel button moved below the action card; the resubmit button
    is called "ยื่นใหม่อีกครั้ง" on every screen that mentions it.
  - Admin override card ("จัดการ"): its อนุมัติ/ส่งกลับ choice was frozen when the card mounted, so a
    step that became APPROVED while the page was open (e.g. the last step, all others complete)
    showed a green "ยืนยันอนุมัติ" button that actually sent the step back. The choice is now
    derived from the step's live status.

- **The "เอกสารแนบ" file list sits last** in the right-hand column of every submission view — the
  student's (`StudentSubmissionActions`), every faculty role's (`RoleSubmissionDetail`) and the
  admin's (`AdminSubmissionPanel`, below the delete card) — so the step's action card comes first.

- **Who signs the defense's two post-exam forms, made exact — 21 steps.** ใบรายงานผลการสอบ is
  signed by the whole committee (advisor, co-advisors, head, exam committee, external) and the
  department chair only: the program chair's ใบรายงานผล step (old stepOrder 12) is removed, so
  8.x ends at the external members and later stepOrders shift down by one (displayed numbers
  unchanged). แบบรายงานการเสนอผลงานฯ is signed by the student and the advisor only — the
  co-advisor's step name no longer claims it. Step-6 wording now says the student doesn't sign
  ใบรายงานผลการสอบ (its "3 จุด" checkbox is replaced at that step), and the admin's check lists the
  right signers.

- **The student picks the defense exam result and uploads แบบประเมินวิทยานิพนธ์ดีมาก.** The
  result picker moved from the advisor (step 7) to the student (step 6, new shared
  `ExamResultPicker`, ผ่าน preselected); ดีมาก adds a required `VERY_GOOD_EVAL` upload to the
  student's step. The server requires a valid result on step 6's approval and the form for ดีมาก
  (the step-7 gate moved here). The advisor now sees the student's result with a double-check
  notice and confirms it with a checkbox; on a rejection at step 7 the student can re-pick the
  result when resubmitting (`resubmit` takes `examResult`). The admin's result check now reads
  "ที่นิสิตเลือกและอาจารย์ที่ปรึกษายืนยัน".

- **THESIS_DEFENSE: 3 steps after the committee's ใบรายงานผล signatures — 22 steps.** New
  stepOrders 13–15 (shown as 9–11): ADMIN checks the signed documents (`ADMIN_DEFENSE_RESULT_CHECKS`),
  the department chair signs ใบรายงานผลการสอบ, then the ADMIN uploads a new cover page and confirms
  emailing the Faculty (`ADMIN_DEFENSE_SEND_CHECKS`; server-gated on a cover page newer than the
  chair's signature). The student's B4 + thesis is now stepOrder 16 (shown as 12). The department
  chair (`SystemSetting` `departmentChair`) becomes a workflow actor — new step role
  `DEPARTMENT_CHAIR`, wired into notifications, email, approve authorization, the exam-reminder
  cron, every client turn/assignee resolver, and access to every defense. A defense's COVER_PAGE is
  no longer single-version (it has two). `THESIS_STEP` gains `ADMIN_RESULT_CHECK`/
  `DEPT_CHAIR_RESULT`/`ADMIN_RESULT_SEND`.

- **THESIS_DEFENSE ใบรายงานผลการสอบ signatures shown as 8.1–8.x.** The committee's signatures after
  the advisor's (stepOrders 8–12: co-advisors → head → exam committee → external → program chair)
  are one displayed step with sub-steps (`SUB_STEP_GROUPS`, `src/lib/stepNumbering.ts`), so the
  student's บ.4 + thesis upload reads as step 9. Internal stepOrders are unchanged.

- **A ดีมาก defense result now requires แบบประเมินวิทยานิพนธ์ดีมาก server-side.** At the advisor's
  result step (`THESIS_STEP.ADVISOR_RESULT`), approving with `ผลการสอบ: ดีมาก` is refused unless a
  `VERY_GOOD_EVAL` was uploaded after the student's report step — previously only the advisor's
  card enforced it. The note prefix and parser are shared (`EXAM_RESULT_NOTE_PREFIX`,
  `examResultNote`, `examResultFromNotes`, `VERY_GOOD_RESULT` in `src/lib/utils.ts`). Also: the
  student's step-6 upload boxes now describe each of the two files.

- **THESIS_DEFENSE step 5 is confirm-only: the admin forwards the Faculty's email to the student.**
  The 4 Faculty-return uploads (and their server gate) are gone from step 5, replaced by a one-box
  checklist (`ADMIN_DEFENSE_FORWARD_CHECKS`); `THESIS_STEP.ADMIN_FACULTY_DOCS` is renamed
  `ADMIN_FORWARD`. Approving step 5 no longer emails the advisor/external members an invitation
  notice. Step 6's student now uploads ใบรายงานผลการสอบ (EXAM_RESULT) alongside the signed
  แบบรายงานฯ — both required server-side — so steps 7–12 still have it to download and sign; the
  step-6 "download the admin's แบบรายงานฯ" card and its special SIGNED-freshness gate are gone.

- **Admin steps: อนุมัติ + ส่งกลับ only, no ปฏิเสธ.** At PROPOSAL step 2 the two buttons did the
  same thing (the previous step is the student's), so ปฏิเสธ was removed there, then from every
  ADMIN step's action card and from the per-step override card (now อนุมัติ + ส่งกลับ on every
  step: "ส่งกลับมาขั้นนี้" on an approved step, `return_to_prev` on the current one). The API
  refuses `reject` on an ADMIN-role step. Shared `previousActiveStep()` in `workflowSteps.ts`.
  Also: a send-back to the student no longer creates a duplicate bell notification, and a
  send-back error now shows on the card instead of as a toast. Build-checked only, no browser
  pass yet.

- **THESIS_DEFENSE step 4: the admin uploads the cover page sent to the Faculty with บ.2 + บ.3.**
  Same `COVER_PAGE` form and upload box as PROPOSAL step 8 (PDF, signed by the department chair,
  single version, ADMIN-only at that step, uploaded on อนุมัติ); approving step 4 is gated on it
  server-side. The step name, its instructions card, the admin-dashboard task label and the
  defense file list ("เอกสารส่งคณะฯ") mention it.

- **THESIS_DEFENSE: advisor + head sign บ.2 before upload — 19 steps.** The in-system
  advisor and head-of-committee บ.2 steps (old 2–3) are gone: they sign the paper บ.2 outside the
  system and the student uploads it at step 1, ticking one checkbox each for the student's,
  advisor's and head's signature (`DEFENSE_STEP1_CHECKS`, now 9 items). The ADMIN check + finance
  form is now step 2 (`financeStepOf` = 2 for both types), chair บ.2 = 3, relay = 4, Faculty docs =
  5, student report = 6, advisor result = 7, B4 + thesis = 13. `THESIS_STEP` loses
  `ADVISOR_B2`/`HEAD_B2`; `THESIS_STEP_NAMES` and `STEP_SIGN_FORMS` renumbered; the admin's บ.2
  check now asks for all three signatures. The one live defense still carries a pre-2026-09-30
  27-row step layout (its step 2 is assigned to ADMIN) and needs its steps 2+ rebuilt to the new
  19-step layout — not done yet (a one-off DB write).

- **One design for every "your turn" upload/action card.** Student upload card, `SignatureButton`,
  `CommitteeSignPanel`, the admin action card and the finance card are now built from shared pieces
  in `FileUploader.tsx` (`ACTION_CARD`, `PRIMARY_BUTTON`, `REJECT_BUTTON`, `SectionLabel`,
  `DownloadRow`, `NoDownloads`, `NotesField`, `ActionError`, `postUpload`, exported `SlotHeader`),
  in one order: numbered download → sign → upload sections, then checklist, notes, one green ✓
  button, then ปฏิเสธ. Behaviour changes that came with it:
  - THESIS_DEFENSE step 7 (Faculty docs) is no longer a separate panel — its 4 upload boxes sit in
    the normal admin action card, so ปฏิเสธ/ส่งกลับ are available there like every other admin step;
    an earlier upload newer than step 6 still counts.
  - PROPOSAL step 8's cover page is uploaded on อนุมัติ (pick file → approve), not with its own
    upload button; `ProposalCoverUploadPanel`/`ThesisFacultyUploadPanel` are gone.
  - The student's rejected-fix card starts with empty upload boxes (it used to show the rejected
    file as "✓ อัปโหลดแล้ว") and ยื่นใหม่อีกครั้ง needs at least one corrected file.
  - The committee panel says ปฏิเสธ (was ไม่อนุมัติ) and "ลงนามแล้ว" in the roster; a signer with
    nothing to download sees "ยังไม่มีเอกสารในระบบสำหรับขั้นตอนนี้ — กรุณาติดต่อเจ้าหน้าที่"
    instead of blaming the student.
  - Upload/approve errors show the server's message inline on the card (student card included —
    no longer a toast); a retry after a failed sign/approve doesn't upload the same file twice.
  - The uploaded-file box's file name now opens a preview. The student's duplicate orange
    "เอกสารที่ต้องอัปโหลดก่อนส่ง" list was removed (each box's chip already shows it).
  `tsc` + `npm run build` clean, lint counts unchanged; **not browser-verified** (would need a
  login on the production DB).

## 2026-09-30

- **Defense บ.3 collected outside the system; the parallel committee step is gone (22 steps).** The
  `ALL_COMMITTEE` step deployed earlier today (81c226d) was removed along with all of its parallel
  wiring (sign route, emails, reminders, AppContext/professor "my turn", `CommitteeSignPanel`,
  timeline, admin cards, committee-edit sync). Instead the student and advisor contact each committee
  member outside the system, and at step 1 the student uploads บ.2 (signed by the student) plus **one
  signed บ.3 per committee member** — one upload box per member of the submission's committee
  (`committeeRoster()`), stored with the new nullable `FormUpload.memberId`; the approve gate names
  any member still missing. `FileList` and the admin step cards show บ.3 per member. The advisor and head of committee now sign บ.2 **before** the ADMIN check
  (steps 2–3), the admin check is step 4 and the program chair signs บ.2 at step 5; the co-advisor
  บ.2 step was dropped (บ.2 has no co-advisor signature) — 21 steps. The finance step is now
  `financeStepOf(type)` (PROPOSAL 2, THESIS_DEFENSE 4) everywhere that used to assume step 2. **DB**: added
  `form_uploads."memberId"` (`ALTER TABLE ... ADD COLUMN`, run live 2026-09-30).
  Roster/numbering/constants checked with a throwaway `tsx` script; build clean, lint count unchanged;
  not browser-verified.

- **Student dashboard lands on the defense tab when a defense is under way** (any non-cancelled
  THESIS_DEFENSE, draft included); otherwise on the proposal tab. The student's own tab click still
  wins. Derived from the loaded submissions rather than set in an effect.

- **THESIS_DEFENSE steps 1–3 redesigned; workflow is now 23 steps with one parallel step.** Step 1:
  the student uploads บ.2 and บ.3 as two PDFs (department-site links, 7-item checklist); บ.3 is a
  single page for the whole committee with student info, topic, committee names and date, judgement
  and signatures left blank. The student no longer uploads the finance form. New step 2: the ADMIN
  checks, generates the defense finance form (`templates/finance-attach-thesis.docx`, same generator
  and card as the proposal's) and approving sends the finance email (moved from the chair's บ.2
  signature). New step 3 `ALL_COMMITTEE`: the whole committee fills in its judgement and signs บ.3
  **in parallel** — the first non-sequential multi-member step (`PARALLEL_ROLES`,
  `allCommitteeIds()`); wired through the sign route, approve block, notifications/emails (everyone
  at once), exam-reminder cron, AppContext/professor "my turn", `CommitteeSignPanel` (no order;
  everyone downloads the files uploaded before the step opened), timeline, admin step cards and the
  admin committee-edit sync. Everything after shifts by +1 (22 → 23); new `THESIS_STEP` constants
  replace every bare defense step number in the code. The defense finance form is hidden from the
  student and single-version. No DB migration needed: the only existing defense is a DRAFT with no
  steps. Membership, numbering, step constants and the committee-edit sync of the parallel step
  checked with a throwaway `tsx` script; the defense finance form rendered through Word; build clean,
  lint count unchanged; not browser-verified.

- **Step-8 cover-page upload confirmed working in the browser** (local dev server, test proposal of
  นายสมชาย ตั้งใจดี). It first failed because the dev server had been started before `COVER_PAGE`
  existed and was still using the old Prisma client; restarting it fixed it — no code change.
  `HANDOFF.md`'s dev-server gotcha now names this case.

- **New PROPOSAL step 8 (stepOrder 12): admin recheck + Faculty cover page; step 6 gains a rename
  check.** `PROPOSAL_ROLES` gained a 12th ADMIN step. Its card uploads the new `COVER_PAGE` form
  type (ใบปะหน้าส่งคณะฯ — PDF, single version, ADMIN-only at stepOrder 12 via a generalised
  admin-only-upload map in `POST /api/upload`) and shows the department chair's name; approve needs
  the file (server-gated) and a 3-item checklist (`ADMIN_STEP8_CHECKS`), and completes the proposal
  — the "completes the proposal" note moved here from the chair's step 7. Step 6's checklist adds
  "rename the system title to match บ.วศ.1ง". Missing-upload errors now name forms in Thai
  (`FORM_SHORT`) instead of enum codes. **DB**: `FormType` gained `COVER_PAGE` (`ALTER TYPE ... ADD
  VALUE`, run live 2026-09-30). The two unfinished proposals created earlier were backfilled
  with a PENDING step-12 row (insert-only, run live 2026-09-30), so they reach step 8 too. Build clean, lint count unchanged; not browser-verified.

## 2026-09-29

- **Proposal steps 6 and 7 match the rest.** Step 6 (ADMIN, stepOrder 10) now needs a 3-item
  verification checklist before อนุมัติ (`ADMIN_STEP6_CHECKS`: committee signatures on บ.วศ.1ค
  complete, 1ค/1ง complete, 1ง topic correct), sharing step 2's checklist/gate code. Step 7
  (PROGRAM_CHAIR, stepOrder 11) gets two own-signature checkboxes (1ค, 1ง) and a note that
  ส่งต่อ completes the proposal. Build clean, lint count unchanged; not browser-verified.

- **Proposal finance email moved to step 2; steps 3+ have no finance content.** `sendFinanceEmail`
  for a PROPOSAL now fires when the ADMIN approves step 2 (after generating/editing the finance
  form), not on the program chair's step-3 approval. The admin's step-2 approve card says it will
  email the finance officer; the chair's step-3 note about it was removed, as was the admin step
  card's step-4 "(อัปโหลดเอกสารการเงิน)" finance-admin line. Build clean, lint count unchanged or lower.

- **Proposal step 4 no longer waits for an admin finance document.** The PROPOSAL's finance
  paperwork is now only the FINANCE_ATTACH generated at step 2, so the step-4 FINANCE_DOC parallel
  gate (approve returned `waitingForFinance`), its auto-advance in `POST /api/upload`, the admin's
  yellow step-4 upload card, the admin-dashboard finance task, the timeline's two-party step-4 row
  and the student's "waiting for staff" state were all removed. Found while diagnosing a live
  test proposal stuck at step 4 (student had submitted; no FINANCE_DOC was ever uploaded).
  THESIS_DEFENSE step 8's FINANCE_DOC is unchanged. Build clean, lint count unchanged or lower.

- **Proposal committee signatures shown as steps 5.1–5.x; admin check is step 6, chair step 7.**
  Display-only: new `src/lib/stepNumbering.ts` groups PROPOSAL stepOrder 5–9 into one numbered step
  with sub-steps (SKIPPED co-advisor steps hidden, so numbering stays dense) and every screen that
  shows a step number or "X/Y ขั้น" count now uses it (timeline, admin step cards/status/progress,
  faculty and student detail, both dashboards, user detail, admin-override notification). Internal
  stepOrder is unchanged. Each 5.x signer — `SignatureButton` and now `CommitteeSignPanel` — gets a
  one-box checklist, "ท่านลงนามใน บ.วศ.1ค แล้ว (1 จุด)". Also fixed: the timeline's step-4 row still
  judged the student done by `B1C`/`B1D` (never uploaded any more) — now the post-step-3 `B1`; and
  it hides the admin finance row from the student. Numbering checked with a throwaway `tsx` script
  (with/without co-advisor); build clean, lint count unchanged or lower; not browser-verified.

- **Step-4 checklist spelled out; proposal finance documents hidden from the student.** The step-4
  checklist now covers the chair's บ.วศ.1ก signature being present (contact the admin if not), 1ค/1ง
  filled with committee names (1ค signature areas blank), the 1ง thesis topic matching the
  committee's comments (it is registered in Chula's official system as written), all dates blank, and confirmation with the
  main advisor against the proposal-exam committee's comments. New `isHiddenFromStudent()` removes
  the PROPOSAL's `FINANCE_ATTACH`/`FINANCE_DOC` from the student's submission payloads and the
  signed-URL route refuses them to that student; the student's step-4 finance row/status are gone.
  Build clean, lint count unchanged; not browser-verified.

- **Proposal step 4 (and signing steps 5–11) use the combined บ.วศ.1 file.** Step 4 no longer asks
  for separate `B1C`/`B1D`: the student downloads the latest `B1` (chair-signed at step 3), fills
  บ.วศ.1ค + 1ง, re-uploads it as a new `B1` version and ticks a 2-item checklist; the admin's parallel
  FINANCE_DOC upload is unchanged. New `freshUploadCutoff()` makes step 4 count only a copy uploaded
  after step 3 was approved (approve gate, auto-advance, student UI) — otherwise the step-1 copy
  would satisfy it. Steps 5–11 now download/sign `B1`. Build clean, lint count unchanged; not
  browser-verified.

- **Proposal step 3 (program chair) matches steps 1–2.** `SignatureButton` gained an optional
  `checklist` (+ `approveNote`) prop; at PROPOSAL step 3 the chair must tick one box,
  "ประธานหลักสูตรลงนามใน บ.วศ.1ก แล้ว", before ส่งต่อ unlocks, and is told ส่งต่อ emails the
  finance form. `RoleSubmissionDetail` (every faculty detail page) is now full-width and 1:1 from
  `md` up, like the student/admin views. Build clean, lint count unchanged; not browser-verified.

- **Step-2 finance form is editable, single-version, and approve needs a 6-item checklist.** The
  generated `FINANCE_ATTACH` now sits in an upload box on the admin's step-2 card — download, edit in
  Word, "เปลี่ยนไฟล์" to upload the edited copy; picking a file whose body text differs from the
  current one shows a replace warning (text comparison via new `src/lib/docxText.ts`; verified that a
  Word re-save with no edits compares equal and a one-word edit does not). Every new copy deletes the
  old row + storage object (`src/lib/uploadVersions.ts`); only ADMIN at step 2 may upload it. อนุมัติ
  now also requires the student's 5 บ.วศ.1 checks plus a committee check (shared `B1Checklist`
  component, lists moved to `lib/utils.ts`). The admin submission grid is 1:1 from `md` up, as on the
  student side. Build clean, lint count unchanged; not browser-verified.
  `FileList` now also shows only the newest finance attachment (no ประวัติ, even for copies left over
  from before the rule), via the shared `isSingleVersionForm()` in `lib/utils.ts`, and its header
  counts documents shown rather than stored versions (it read "เอกสารแนบ (3 ไฟล์)" over 2 rows).

- **ADMIN generates the proposal's finance form at step 2; the student uploads one file at step 1.**
  PROPOSAL step 1 now takes only `B1` (the combined บ.วศ.1ก–ง PDF). New
  `POST /api/submissions/[id]/finance-attach` (ADMIN-only, only while step 2 is current) fills the
  department's เอกสารการเงินแนบกรรมการสอบ (`templates/finance-attach-proposal.docx`, bundled via
  `outputFileTracingIncludes`) with student name/code, สาขาวิชา (ME_CPS only) and one numbered row
  per committee member — empty roles get no row; date/credits/signatures/total/cheque stay blank — and
  stores it as a `FINANCE_ATTACH` version for step 3's finance email. Step 2's approve is gated on it
  (server + disabled button). New dependency `jszip`. Generator checked by rendering ME_MECH (4
  members) and ME_CPS (8 members) outputs through Word; build clean, lint count unchanged; the route
  and admin card are not browser-verified (no submission at step 2 exists to try it on).

- **Proposal step 1 takes one combined บ.วศ.1 file + a Word finance file.** บ.วศ.1ก–ง are one
  physical document, so step 1's upload boxes went from 5 (b1a, b1b, finance, plus optional early
  b1c/b1d) to 2: new form type `B1` (PDF only) and `FINANCE_ATTACH` (.docx only — also on
  THESIS_DEFENSE step 1). The format rule is `formFileKind()` in `lib/utils.ts`, shared by
  `FileUploader` and `POST /api/upload` (magic-byte checked; DOCX was previously rejected outright
  by the server). ส่งต่อ now also needs a 5-item checklist: บ.วศ.1ก/1ข filled, student signed
  1ก + 1ข, advisor signed 1ก. Step 3's program chair signs `B1`. The optional early-upload boxes for
  later steps' forms were removed from every student step. The app's own finance `.docx` templates
  (`public/templates/`) were deleted — both upload boxes now point to
  https://me.eng.chula.ac.th/download/. The student detail grid is now 1:1 (steps : upload) from
  `md` up, was 2:1. DB: `FormType` gained `B1` (`ALTER TYPE ... ADD VALUE`, run live 2026-09-29;
  0 uploads existed). Step 4 still takes separate `B1C`/`B1D` — undecided. Build clean, lint count
  unchanged; not browser-verified.

- **Form types `BW1A`/`BW1B` renamed to `B1A`/`B1B`** in code and in the live `FormType` enum
  (`ALTER TYPE ... RENAME VALUE`), to match the b1a–b1d naming.

- **Admin submission edit now uses the student's committee editor.** `AdminSubmissionPanel`'s edit
  mode dropped its fixed-slot dropdowns (max 3 per multi-member role — a 4th member was silently
  lost on save) for the same `CommitteePeopleEditor`/`ProgramChairAutoField`/`ExamLogisticsSection`
  the student's draft forms render. `ExamLogisticsSection` gained an `allowPastDate` prop for this
  caller. The rest of the edit form followed: ข้อมูลวิทยานิพนธ์ (title moved out of the header's
  inline input) and ข้อมูลนิสิต now use the student form's `Section`/`Field`/`INPUT` layout; the
  panel's own `EField`/`EDIT_INPUT_CLS` helpers were removed as unused. Build clean, lint count
  unchanged (pre-existing only); not browser-verified.

- **Approval steps now follow an admin's committee edit.** Multi-member steps (CO_ADVISOR/
  EXAM_COMMITTEE/INVITED_EXAM_COMMITTEE) snapshot their member list at build time and signing reads
  only that snapshot, so editing the committee on a running submission left its steps waiting on
  the old members (and adding a co-advisor never un-skipped the co-advisor steps). `admin_update`
  now re-syncs every open step via the new pure `planCommitteeStepSync()` in the same transaction,
  re-derives the submission status, and notifies the person whose turn it now is; `admin_reset`
  re-snapshots the lists too. Planner checked against 11 scenarios with a throwaway `tsx` script;
  `npm run build` clean; not browser-verified.

- **Admin submission edit now enforces committee role counts.** `admin_update` checked account types
  only, so an admin could save a running submission with no อาจารย์ที่ปรึกษา, ประธานกรรมการสอบ,
  ประธานหลักสูตร, กรรมการสอบ or กรรมการภายนอก. New pure `validateResolvedCommitteeCounts()`
  (`src/lib/committee.ts`) checks the post-save state on any non-DRAFT submission; `programChairId`
  now also counts as a committee change for triggering the checks. `npm run build` clean; not
  browser-verified.

- **A completed submission can no longer be cancelled.** `request_cancel` used to refuse only
  `CANCELLED`, so a student could ask to cancel a finished proposal (the cancel button was shown
  on COMPLETED proposals) and an admin could accept it. `request_cancel` and `accept_cancel` now
  both return 400 for `COMPLETED`, and `StudentSubmissionActions` hides the button. `npm run build`
  clean; not browser-verified.

- **One person, one committee role.** Apart from the ประธานหลักสูตร, who may also hold one other
  position, an account can now appear only once in a submission's committee — previously the same
  person could fill several different roles (e.g. อาจารย์ที่ปรึกษา + กรรมการสอบ) and only a repeat
  in the *same* role was rejected. Enforced in `validatePeople`/`validatePeopleLenient`
  (create, draft save and confirm), `admin_update`, `CommitteePeopleEditor` (already-picked accounts
  are no longer offered; a legacy duplicate is flagged) and `AdminSubmissionPanel` (same, plus its
  save now reports server errors instead of failing silently). Shared helper
  `findDuplicateCommitteeMember()` in `src/lib/utils.ts`. `npm run build` clean; not yet
  browser-verified.

## 2026-09-15

- **Removed the `pendingPeople` DRAFT flavor entirely; drafts now heal themselves on re-open and
  refuse to save an unusable committee member.** A student has never been able to type a committee
  member's name — `CommitteePeopleEditor` offers existing accounts only — and the one way a new
  committee account appears is a STUDENT's EXTERNAL-account request approved by an ADMIN. The
  machinery for "student named someone with no account" was therefore unreachable except by a race,
  and it carried two real defects (see the previous entry's follow-ups). Removed: the
  `Submission.pendingPeople` column, `action: "continue_draft"`, `AppContext.continueDraft`, the
  DRAFT-with-pendingPeople branch of `POST /api/submissions` (an unresolvable email is now a plain
  400 naming the addresses), the amber "รอสร้างบัญชี" cards in `AdminUsersPanel`, the
  `/admin-dashboard` count card, the whole `/dashboard/admin/pending-professors` page, the
  DRAFT-checklist banner in `StudentSubmissionActions`, and the notify-unblocked-students pass in
  `POST /api/users`. `DRAFT` now has exactly one meaning — a submission the student is still
  filling in — so `isAutoDraftProposal`/`isAutoDraftDefense` are just `status === "DRAFT"`.
  - **Self-heal on re-open**: `buildPeopleFromSubmission()` takes the submission's `program` and
    clears any committee member that can no longer be used — account deleted (`invalid: "MISSING"`)
    or no longer fitting the degree rule (`invalid: "SCOPE"`) — off its row, leaving the role, an
    empty picker and a red explanation. It marks nothing while `users` is still empty, since an
    unloaded account list is indistinguishable from every account having been deleted. Switching
    หลักสูตร mid-edit is covered too, derived rather than stored (`rowInvalidReason()`), so it
    tracks the live selector without an effect writing back into state.
  - **Both save buttons refuse** while a row is marked: `validateNoInvalidRows()` runs in the draft
    components' strict `validate()` *and* their lenient `validateForSave()`. A deliberate exception
    to "a plain save may be incomplete" — an unusable member is a mistake, not an omission, and it
    used to be dropped silently, shrinking the committee without telling anyone. Server-side,
    `validateCommitteeAccountRoles(..., { requireAccount: true })` enforces the same on both
    `confirm: false` branches instead of letting `resolvePeoplePartial` drop the row.
  - **`admin_update` is no longer unvalidated**: the ADMIN submission-edit save wrote every
    committee id column with no committee checks at all. `validateResolvedCommitteeAccountRoles()`
    now checks the post-write state, but only when the request touches a committee field or
    `program`, so an unrelated edit isn't blocked by a committee that predates the rule.
  - The `pendingPeople` column is dropped from `schema.prisma`; the live column is dropped
    separately (0 submissions in the DB, so no data).

- **Committee composition is now degree-dependent, and the account-type rule is enforced
  server-side for the first time.** Which kind of account may fill each committee role used to be a
  UI-only convention: `CommitteePeopleEditor` scoped its dropdowns via two fixed sets
  (`EXTERNAL_ONLY_ROLES`/`MIXED_ROLES`), while `resolvePeople()` looked accounts up by email without
  ever checking their `Role`, so anything posted directly to the API was accepted. Both halves
  changed:
  - **New rule.** ADVISOR: internal `PROFESSOR`, exactly 1 (both degrees). CO_ADVISOR: either type,
    0+. HEAD_EXAM_COMMITTEE: exactly 1, **either type for a master's (`ME_MECH`/`ME_CPS`) but
    `EXTERNAL` only for a doctoral (`PHD`) submission** — the only role that differs by degree.
    EXAM_COMMITTEE: internal `PROFESSOR` only (**changed** — it accepted `EXTERNAL` since
    2026-09-08), ≥1. INVITED_EXAM_COMMITTEE: `EXTERNAL` only, ≥1. Role *counts* are unchanged.
  - **One source of truth**: `degreeOfProgram()`/`committeeRoleScope()`/`accountFitsScope()`/
    `ACCOUNT_SCOPE_LABELS` in `src/lib/utils.ts` — no Prisma import, so the client pickers, the
    client validator and the server validator all call the same functions instead of keeping
    parallel copies of the table.
  - **Server enforcement**: `validateCommitteeAccountRoles(people, program)` in
    `src/lib/committee.ts`, wired into `POST /api/submissions` and both
    `save_proposal_draft`/`save_defense_draft` `confirm: true` branches. It is the one committee
    check that must hit the DB (the rule is about the account behind an email, not the row's own
    fields). Rows whose email has no account yet are skipped — still `resolvePeople()`'s
    DRAFT/`pendingPeople` business. Deliberately **not** applied on the lenient `confirm: false`
    path or in `continue_draft`, so a draft stays saveable while the student fixes a committee that
    no longer fits.
  - **Client**: `CommitteePeopleEditor` takes a `program` prop (threaded from all four call sites)
    and builds each dropdown from the resolved scope; `validatePeopleClient()` gained `program` and
    `users` parameters and re-checks the same rule at submit. Each row gained a "เลือกจาก: …" hint,
    and a row holding an account that no longer fits keeps it visible marked
    "(ไม่ตรงตามเงื่อนไข)" with a red hint rather than blanking the picker.
    `AdminSubmissionPanel`'s separate `<select>`-based editor follows the same rule: ประธานกรรมการสอบ
    is resolved from the edit draft's current หลักสูตร, กรรมการสอบ went back to PROFESSOR-only.
  - **Migration impact: none.** A read-only audit of every existing submission found 0 violations —
    the database currently holds 24 users and 0 submissions. **But there are 0 `EXTERNAL` accounts
    in the system**, so no `PHD` submission can be confirmed until an admin creates at least one
    (a master's submission can still use an internal ประธานกรรมการสอบ, but every degree already
    needed an `EXTERNAL` for กรรมการภายนอก).

- **Removed the dead `Signature` model and dropped three orphaned tables.** `signatures` had a
  schema model, a `@@unique([workflowStepId, userId])` and an `ipAddress` column, but **nothing in
  the app had ever written to it** — the sole reference in the entire codebase was a
  `prisma.signature.count()` inside `describeDeleteBlockers()`. Signing has always been recorded on
  the step row instead (`WorkflowStep.actedById`/`actedByName`/`actedAt` for single approvers, the
  `committeeActions` JSON array for the three sequential multi-member roles), so the table recorded
  nothing the workflow didn't already hold. Removed the model plus its `User.signatures` /
  `WorkflowStep.signatures` relation fields, and dropped the signature count + its
  `ลายเซ็น N รายการ` blocker line from the user-delete 409 — **user deletes now have two blocking
  FKs, not three** (`submissions.studentId`, `form_uploads.uploadedById`).
- **Live DB now matches the schema exactly: 7 tables.** `signatures`, `rate_limits` (3 stale
  forgot-password/registration counter rows) and `magic_tokens` were all dropped from production,
  closing the "orphaned table, not yet dropped" item that had been open in `HANDOFF.md` since
  2026-09-09. `public` now holds exactly `users`, `submissions`, `workflow_steps`, `form_uploads`,
  `notifications`, `system_settings`, `external_committee_requests`. Note `prisma db push` will not
  drop a table whose model was removed in an earlier session — `RateLimit`/`MagicToken` had been
  gone from the schema for days while their tables lived on — so a model deletion needs its own
  deliberate drop.
- **`scripts/migrate-supabase.mjs` and `docs/SUPABASE-MIGRATION.md` brought back in step with the
  schema.** The script still listed `signatures` in its unconditional `TABLES` array (it would now
  abort on a missing table) and `magic_tokens`/`rate_limits` behind `--include-ephemeral`; it was
  also missing `external_committee_requests` and `system_settings`, which have existed for a while
  and were silently never copied. Replaced with the real 7-table parent-first list and dropped the
  now-pointless `--include-ephemeral` flag.
- **Known caveat, unresolved**: the storage bucket holds 405 objects against 0 `form_uploads` rows.
  Whatever cleared the submission data did not go through `DELETE /api/submissions/[id]` (which
  calls `deleteFolder()` first), so those files are orphaned in the bucket. Worth a sweep.

- **New "หัวหน้าภาควิชา" (department chair) setting**, rendered as the first section of the ADMIN
  "ตั้งค่าระบบ" tab, above ประธานหลักสูตร and ผู้รับผิดชอบด้านการเงิน. One PROFESSOR account for the
  whole department, stored as `SystemSetting` key `departmentChair` — same single-holder,
  never-delete-the-row pattern as `financeContact`, with `getDepartmentChairUserId`/
  `getDepartmentChairUser`/`setDepartmentChair` added to `src/lib/systemSettings.ts` and a computed
  `isDepartmentChair` flag added to `attachSystemSettings` **and to both `mapUser()` response
  whitelists** (`src/app/api/users/route.ts`, `src/app/api/users/[id]/route.ts`) so it reaches the
  client alongside `programChairFor`/`isFinanceContact` — caught in browser testing: without the
  second half the row saved correctly but the dropdown still read "— ไม่มี —" after a reload, since
  `attachSystemSettings` computed the flag and the field-whitelisting response shaper then dropped
  it. New ADMIN-only
  `POST /api/admin/department-chair` (`{ userId }`, 400s on a non-PROFESSOR target) +
  `AppContext.adminSetDepartmentChair`. Deleting the holder's account nulls the row via the existing
  `clearUserFromSystemSettings`. **The assignment is a record only for now** — no workflow step,
  authorization check or email recipient reads it yet.

- **User deletion now says *what* is blocking it, and external-committee requests no longer block
  it at all.** Investigated a report of accounts showing `0 0 0` in the admin user list that still
  refused to delete. Two independent causes, both fixed:
  - `DELETE /api/users/[id]` only reacted to Prisma's `P2003`, so every blocked delete produced the
    same generic "มีคำร้อง เอกสาร หรือประวัติการดำเนินการที่เกี่ยวข้อง" message. Added
    `describeDeleteBlockers()`, a pre-flight count of the three `User` relations that actually
    refuse a delete — `Submission.studentId` (grouped per status), `FormUpload.uploadedById` and
    `Signature.userId`, confirmed against `pg_constraint`; the 409 now lists each with its count and
    returns them as a `blockers: string[]` field too. Motivating case: the row's three stats count
    only `IN_PROGRESS`/`COMPLETED`/`REJECTED`, so a student whose only reference is an untouched
    blank `DRAFT` proposal (one click of "+ สร้างร่างคำร้อง") reads as `0 0 0` — when every blocker
    is a DRAFT the message now adds that it can be deleted from the "จัดการคำร้อง" tab first. The
    `P2003` catch stays as a fallback. Live audit at the time: 7 of 68 accounts read `0 0 0` while
    holding a reference — 4 blank drafts, 1 advisor-on-a-draft, 2 external-request-related; of
    those, only the 4 blank drafts and 1 external request were genuinely blocked (see the
    correction below).
  - **Which relations block is decided by optionality, not by an explicit `onDelete`.** Prisma
    defaults a *required* relation to `Restrict` and an *optional* one to `SetNull`, so of the five
    `User` relations `AGENTS.md` had listed together as non-cascading, only three refuse a delete
    (`Submission.studentId`, `FormUpload.uploadedById`, `Signature.userId`); `Submission.advisorId`
    and `WorkflowStep.actedById` are `SET NULL`. Noted here because it cuts both ways: it is why
    two of the accounts reported as undeletable never were, and it means **deleting a professor
    silently nulls their advisor link and step-action attribution** on existing submissions rather
    than being refused. `AGENTS.md`'s bullet was corrected to say so.
  - `ExternalCommitteeRequest.requestedById` is a **required** relation with no explicit
    `onDelete`, so it took Prisma's default for that case — `Restrict` — which made any student who
    had ever filed an external-committee request, including a rejected one, permanently
    undeletable. Nothing surfaces this in the UI and there is no DELETE route for a request, so
    there was no way out of it. Now `onDelete: Cascade`: a provisioning request is not a thesis
    record, and it belongs to the student who made it. Applied to the live DB with a one-off pooler
    script (`scripts/fk-external-requests.ts`, deleted after running, per the usual convention),
    constraint definitions confirmed before and after.
    `createdUserId` was declared `onDelete: SetNull` in the same change, but that was already its
    effective behavior (Prisma's default for an *optional* relation) — it is now explicit rather
    than implicit, and no DB change was needed. (The investigation that opened this work initially
    reported that every `EXTERNAL` account created through the approval flow was undeletable
    because of this FK — it never was; the audit script behind that claim assumed a missing
    `onDelete` meant `Restrict` for both columns instead of checking `pg_constraint`.)
  - Also widened the toast component (`src/context/ToastContext.tsx`) — errors now wrap at
    `max-w-[min(90vw,26rem)]` and stay up 8s instead of 3.5s, since the new blocker message is a
    sentence rather than a phrase.
  - Verified: `npm run build` and `npx tsc --noEmit` clean, `npm run lint` unchanged for `src/`
    (247 → 245 problems, both from the deleted one-off script); the new message text was previewed
    against live data with a read-only script before shipping. Not browser-verified — by the time
    the work was done the database had been cleared to 24 users / 0 submissions, so no blocked
    account was left to reproduce the 409 against.
  - **Known, not fixed here**: `headCommitteeId`/`programChairId`/`committeeIds`/`coAdvisorIds`/
    `invitedCommitteeIds` are plain string columns, not FKs — deleting a professor who sits on a
    committee succeeds and leaves a dangling id on that submission (3 such accounts in the live DB
    at the time of the audit).

## 2026-09-09

- **Removed dead code and unused dependencies**, following a project-wide consistency/old-design
  audit (see `HANDOFF.md`). Deleted: `scripts/assign-passcodes-no-email.ts` (an untracked,
  already-run one-off script); `src/lib/rateLimit.ts` and the `RateLimit` Prisma model (orphaned
  since self-registration/forgot-password were removed — the `rate_limits` table itself is still
  live and not yet dropped); the unused `STEP_NAMES` export in `src/lib/utils.ts`; and, with the
  project owner's explicit go-ahead, all 9 `/dashboard/<contextual-role>` route pairs (`advisor`,
  `co-advisor`, `dept-staff`, `exam-committee`, `faculty-dean`, `graduate-school`,
  `head-exam-committee`, `invited-exam-committee`, `program-chair`) — leftovers from the original
  pre-account-model 2026-06-02 mockup — along with the `/demo` testing page, `/api/auth/demo`, and
  the now-orphaned `RolePendingList` component they depended on, in favor of the already-documented
  `/demo-users` picker. Also removed 5 unused npm dependencies (`zod`, `react-hook-form`,
  `@hookform/resolvers`, `@auth/prisma-adapter`, `playwright`). `npm run build`/`tsc --noEmit`/
  `eslint` all re-verified clean after every step (same pre-existing lint baseline, no regressions).
- **Removed magic-link auto-login entirely**, at the project owner's request, after flagging that
  the token was never single-use and never expired quickly (48h, deliberately not consumed on
  click for Office365 SafeLinks prefetch safety) — a forwarded or leaked notification email let
  anyone log in as that user for up to 48h with no passcode needed. Deleted `GET /api/auth/magic`
  (`src/app/api/auth/magic/route.ts`) and the `MagicToken` Prisma model (`magic_tokens` table now
  orphaned in the live DB, not yet dropped — see below). `sendStepEmail()`'s per-recipient link
  (`src/lib/email.ts`) no longer creates a token; every step-notification and rejection email now
  links to a plain `/login` instead of an auto-login URL, with the existing "log in with your email
  and passcode" caption unchanged. The exam-reminder email's link was never actually a magic link
  (no token, always required manual login) — only renamed its `magicLink` variable to
  `reminderLink` for clarity, no behavior change. Login by email + passcode is unaffected; this only
  removes the one-click email shortcut. **Follow-up the same day**: dropped the now-orphaned
  `magic_tokens` table itself from the live production DB (93 stale rows), via the usual one-off
  `scripts/`-then-delete pooler-script convention, with the project owner's explicit go-ahead —
  existence confirmed before (true) and after (false). Verified: `npx tsc --noEmit`
  clean except one stale `.next/types/validator.ts` entry referencing the deleted route (a dev-server
  cache artifact from the live dev server that was running at the time — not a real error, clears on
  the server's next full recompile/restart); `npx eslint` on `src/lib/email.ts` shows only the two
  pre-existing `any` errors this change didn't touch. `AGENTS.md` updated (Stack & deployment, Auth,
  the name-title JWT-minting note, and the `attachSystemSettings` comment) to drop magic-link
  mentions.
- **Admin-only user rank codes (A001/B002/C003/D004), drag-to-reorder.** New `User.rankOrder Int?`
  plus `computeRankCodes()`/`rankCodeNumber()` (`src/lib/utils.ts`) compute a dense per-role display
  code — `A`=ADMIN, `B`=PROFESSOR, `C`=EXTERNAL, `D`=STUDENT — visible only to ADMIN (never
  SUPER_ADMIN), never directly editable. New ADMIN-only `POST /api/admin/users/reorder`
  (`{ role, orderedIds }`) rejects a stale/partial membership list (409) and sets every member's
  `rankOrder` in one transaction. `AdminUsersPanel` gained drag-and-drop reordering, enabled only
  when a single role filter is active with search/checkbox cleared. See "Admin-only user rank codes"
  in `AGENTS.md`. Verified live in the browser: correct dense codes across all 4 role groups, a real
  drag-drop swap persisted through a page reload.
- **`INVITED_EXAM_COMMITTEE` (กรรมการภายนอก) now supports multiple members**, not just exactly 1 —
  brought in line with `CO_ADVISOR`/`EXAM_COMMITTEE`. Schema: the `invitedCommitteeId` scalar + 4
  free-text snapshot columns were replaced with `invitedCommitteeIds String[]` (migrated, 6/6
  existing rows backfilled and verified, old columns dropped). `validatePeople`/`resolvePeople`,
  `buildWorkflowSteps()`, the sequential-signing `POST /api/submissions/[id]/sign` transaction, and
  email recipient resolution (`sendStepEmail`'s new `allMembers` broadcast, `sendFinanceEmail`'s
  `invitedProfs` array) all treat it identically to the other multi-member roles now. UI:
  `CommitteePeopleEditor` dropped its `max: 1` cap; `AdminSubmissionPanel` gained 3 กรรมการภายนอก
  dropdown slots. See "Multiple external committee members" in `AGENTS.md`. **Not yet exercised in
  a real browser** with 2+ invited members signing in sequence.
- **Fixed silent-failure email reporting in three more admin flows** (passcode reset, login-email
  change, add-user), same root cause each time: the API always applied the account change before
  sending a notification email, but the UI never surfaced whether the email actually sent, so an
  admin saw "success" even when a message silently failed (e.g. hitting the Gmail daily quota).
  `sendPasscodeResetEmail`/`sendEmailChangedNotice` now return real send results; `PATCH
  /api/users/[id]` responses include `passcodeEmailSent`/`emailChangeNoticesSent`; `AppContext`'s
  `superAdminAddUser`/`superAdminResetPasscode`/`adminUpdateUserInfo` surface them; toast call sites
  in `UserProfileHeader.tsx`, `AdminUsersPanel.tsx`, `/dashboard/admin/pending-professors`, and
  `/super-dashboard` (whose add-admin handler previously wasn't even `await`ed) now branch on the
  real result. Verified live against both a real Gmail-quota failure and a real successful send.
- **Fixed admin approve/reject/return-to-prev buttons giving no feedback while a request was in
  flight**, letting a double-click fire a duplicate PATCH that failed. `AdminSubmissionPanel.tsx`'s
  main action panel now shares one `actionBusy` state across all three actions — buttons disable
  immediately, the approve button shows a spinner + "กำลังดำเนินการ...", and a failure now shows a
  toast instead of failing silently. Not yet re-confirmed with a live double-click repro.
- **Fixed the admin user-list header not adapting below the `xl` breakpoint** — the submission-status
  box and the 3 edit/reset/delete buttons stayed full-size at any width from ~768px up, forcing the
  name/email column to wrap character-by-character. `UserProfileHeader.tsx` now stacks vertically
  (identity, then status box + buttons in a wrapping row) below `xl` (1280px), only docking
  side-by-side once there's room. Confirmed live at ~871px; the `xl:`+ layout and true mobile widths
  weren't visually confirmed (viewport-resize tooling limitation this session).
- **Reworded and de-duplicated the "external examiner not found" hint** on the student proposal
  committee editor — was repeating once per eligible row (3-4+ times on one page); now appears once,
  in both `ProposalForm`'s and `ProposalDraftReview`'s intro text.

## 2026-09-08

- **`User.name` split into a separate `title` field** for the Thai honorific/academic prefix
  (ศ.ดร./รศ.ดร./ผศ.ดร./ผศ./อ.ดร./ดร./นาย/นางสาว/นาง) — new `NameTitle` enum, nullable `User.title`.
  `formatUserName({title, name})` (`src/lib/utils.ts`) is now used everywhere a live user's name is
  displayed (dashboards, emails, workflow-step snapshots, committee pickers); a one-off backfill
  split all 10 then-existing accounts (7 matched a prefix, 3 legitimately had none). Deliberately
  not touched: historical denormalized name snapshots with no parallel title column
  (`Submission.studentFullName`, `pendingPeople[].name`). See "Name title" in `AGENTS.md`.
- **ADMIN/SUPER_ADMIN can now edit a user's login email** (previously only fixable via a direct DB
  edit). `PATCH /api/users/[id]` accepts an optional `email` (normalized, validated,
  uniqueness-checked); since email doubles as the login identifier, both the old and new address get
  an automatic notice (`sendEmailChangedNotice`). `UserProfileHeader.tsx`'s edit modal gained the
  input with an amber warning when changed.
- **Fixed `EXTERNAL` (กรรมการภายนอก) accounts being invisible in two places.** `GET /api/users`'s
  ADMIN-caller branch was missing `"EXTERNAL"` from its role filter, so an approved external
  examiner would briefly appear (client-side optimistic update) then vanish on the next poll.
  Separately, `AdminSubmissionPanel`'s own (older, non-shared) committee editor built its "กรรมการ
  ภายนอก ในระบบ" dropdown from a PROFESSOR-only list, so an admin could never actually pick an
  external examiner there either. Both fixed; confirmed via a direct DB read that 3 real EXTERNAL
  accounts existed the whole time.
- **Draft save no longer requires complete information; CO_ADVISOR/EXAM_COMMITTEE can now be
  external examiners too.** "บันทึกฉบับร่าง" on `ProposalDraftReview`/`DefenseDraftReview` used to
  run the exact same strict validation as "ยืนยัน" — a student couldn't save an empty draft at all.
  New lenient `validatePeopleLenient`/`resolvePeoplePartial` (`src/lib/committee.ts`) skip unfilled
  rows and never fail on an unresolvable email; `PATCH .../[id]` actions `save_proposal_draft`/
  `save_defense_draft` branch strict-vs-lenient on a `confirm` flag. Separately,
  `CommitteePeopleEditor`'s `MIXED_ROLES` (CO_ADVISOR, EXAM_COMMITTEE) now offer both PROFESSOR and
  EXTERNAL accounts, not PROFESSOR-only. See "Draft save vs. confirm validation" and "Committee
  people" in `AGENTS.md`.
- **Proposal tab reworked into a blank-draft-first flow.** Before any proposal exists,
  `/student-dashboard`'s proposal tab shows the blank `ProposalForm` template (`readOnlyPreview`,
  disabled via `<fieldset>`) with a "+ สร้างร่างคำร้อง" button (`POST
  /api/submissions/auto-draft-proposal`, STUDENT-only, get-or-create) that creates a blank DRAFT row;
  new `ProposalDraftReview.tsx` (mirrors `DefenseDraftReview.tsx`) then becomes the editable form.
  `CommitteePeopleEditor` redesigned alongside this: no longer shows a selected member's
  email/phone, gained a drag handle for reordering (the real sign order), and `initialPeople()` now
  seeds 4 default rows. `ExamLogisticsSection`'s time field switched from a native
  `<input type="time">` to a locale-independent two-`<select>` `TimeSelect`. Same-day follow-up:
  fixed the progress-preview/timeline disappearing between the blank-template state and the
  draft-being-edited state.
- **`ExternalCommitteeRequest` gained its own `title` column**, matching every other account form's
  "คำนำหน้าชื่อ" dropdown instead of requiring the student to type a Thai honorific into the name
  field by hand. ADMIN's approval flow prefills the add-user modal's title directly from it.
- **`/professor-dashboard` reworked to show every submission the professor is a committee member
  on**, not just ones with a professor-role step currently pending or already acted on. Replaced the
  old รอดำเนินการ/ประวัติ tab split with the same status-filter tab bar `/admin-dashboard` uses. See
  "Professor dashboard" in `AGENTS.md`.
- **Fixed a stale-session "Forbidden" error on approving a step.** `PATCH /api/submissions/[id]`'s
  actions silently fell back to the JWT session's (possibly stale) roles when the fresh DB lookup
  (`dbUser`) came back `null` — now returns a clear 401 ("เซสชันหมดอายุ กรุณาเข้าสู่ระบบใหม่") instead,
  confirmed by the reporting admin that re-login fixed it.
- **`AdminUsersPanel`'s user list gained a role filter + search bar, and an "มีคำร้องที่ยังไม่ถูก
  ยกเลิก" (active-submission-only) checkbox filter** (same "any non-CANCELLED submission counts as
  active" rule as the proposal-first gate). Every user-facing "นักศึกษา" was also renamed to "นิสิต"
  (Chulalongkorn's own term) across the app, including the Thai↔English translation dictionary's
  keys.
- **Fixed admin popups (add/edit-user, reset-passcode, `NotificationBell`) closing on a
  click-and-drag out of the panel.** A browser `click` fires wherever the mouse is released, not
  where it was pressed — backdrop close-handlers now track whether the *press* also started on the
  backdrop before treating a release there as a real outside click.

## 2026-09-07

- **Program chair & finance contact moved from `User` columns into a new `SystemSetting`
  key/value table; finance contact is now an admin-designated ADMIN account; a professor may
  now chair more than one program.** New `src/lib/systemSettings.ts` centralizes all reads/writes
  (`getProgramChairUserId`/`getProgramChairsOfUser`/`setProgramChair`,
  `getFinanceContactUser`/`setFinanceContact`, `clearUserFromSystemSettings`,
  `attachSystemSettings`). Rows are never deleted — clearing an assignment, or deleting the
  account that held it, sets `userId: null` instead so the key stays present. The old "one
  PROFESSOR, one program" rule was removed, so `programChairFor` is now `ProgramType[]`
  everywhere it appears (session/JWT, `MockUser`, ~a dozen consumer files) instead of a single
  value. The old "จัดการประธานหลักสูตร" card was extracted from `AdminUsersPanel` into a new
  `AdminSettingsPanel` component (`src/components/AdminSettingsPanel.tsx`), now its own
  "ตั้งค่าระบบ" tab on `/admin-dashboard` (3 tabs total) and standalone at `/dashboard/admin/users`.
  `sendFinanceEmail()` now prefers the designated contact's email over the `FINANCE_EMAIL` env
  var, which is now only a fallback. See "Program Chair & finance-contact assignment" in
  `AGENTS.md`.
- **Admin submissions tab: rows expand in place instead of linking to a detail page.**
  `/admin-dashboard`'s จัดการคำร้อง list no longer has a "จัดการ"/"ดำเนินการ" link or a per-row
  delete button — the whole card is clickable (toggling a chevron), and clicking one renders the
  full admin action surface directly under that row, one open at a time. That surface — header,
  edit form, cancellation accept/decline, step-by-step controls, timeline, upload panels, file
  list, and the typed-"ลบ" delete confirm — was extracted from what used to be all of
  `/dashboard/admin/[id]/page.tsx` into new `src/components/AdminSubmissionPanel.tsx`
  (`{ submissionId, onDeleted? }`), the same "extract the page body into a component" pattern
  already used for `StudentSubmissionActions`. `/dashboard/admin/[id]` is now a thin
  guard+back-link wrapper around it, kept because emails, the task box, and student-profile pages
  still deep-link there directly. Expanding a card — including switching straight from one open
  card to another — smoothly scrolls it to the top of the list's scrolling frame. Also fixed that
  page's delete handler, which previously had no error handling at all (a failed delete just
  silently did nothing); it now shows a success/error toast like the rest of the app.
- **Fixed `DELETE /api/users/[id]` crashing with a bare 500 instead of a real error.** Deleting a
  STUDENT/PROFESSOR who has ever submitted, uploaded a file, signed something, or acted on a
  workflow step threw an unhandled Prisma foreign-key error (`P2003`) — none of those relations
  cascade-delete, by design, since deleting an account must never silently destroy thesis records.
  The route now catches that and returns a `409` with a clear Thai message instead. No schema or
  behavior change, just surfacing the existing constraint as a real error.
- **Removed `EMAIL_OVERRIDE_TO` entirely.** This env var used to redirect every outgoing email to
  one testing address so Preview/Development deployments and local dev could never accidentally
  email real students/faculty. Removed the override branch from `sendMail()`
  (`src/lib/email.ts`), deleted the var from `.env.local` and from Vercel's Preview/Development
  environments, and updated `AGENTS.md`/`HANDOFF.md`/`docs/SUPABASE-MIGRATION.md`. No environment
  has a safety net anymore — see the warning near the top of `HANDOFF.md`.
- **Admin-only account creation; password renamed to passcode.** Self-registration
  (`/register`, `POST /api/auth/register`) and self-service forgot-password are both removed
  entirely — every account is now created by an ADMIN/SUPER_ADMIN via `POST /api/users`, including
  the account for a DRAFT submission's missing committee person. `User.passwordHash` was renamed
  to `passcodeHash` directly on the live DB (a lossless column rename, not a `prisma db push`,
  which would have dropped every existing hash). See "Account creation & passcodes" in `AGENTS.md`.
- **Admin can now type a passcode by hand instead of only accepting a generated one**, on both
  account creation and reset — new shared `PasscodeField` component, server-side
  `isValidPasscode()` (6-72 chars, no whitespace).
- **Committee-account creation unified onto `POST /api/users`.** The dedicated `POST
  /api/admin/pending-professors` endpoint was deleted; an unresolved committee email now surfaces
  as an amber card at the top of `AdminUsersPanel`'s user list (in addition to the standalone
  `/dashboard/admin/pending-professors` queue page, which still works as an alternate entry
  point), and clicking it opens the same "เพิ่มผู้ใช้งาน" modal used for any account.
- **THESIS_DEFENSE and PROPOSAL creation moved inline into `/student-dashboard`'s tabs** — a
  defense is auto-drafted the moment its tab opens (`POST /api/submissions/auto-draft-defense`),
  reviewed/edited via `DefenseDraftReview`, and confirmed without ever navigating to a separate
  page; the full submission action surface (`StudentSubmissionActions.tsx`, extracted from the old
  `/dashboard/student/[id]` page body) renders directly in the dashboard tabs too.
- **Fixed `continue_draft` silently overwriting committee fields an ADMIN had already edited** on
  a still-DRAFT submission — it now merges (fills only still-unset fields) instead of always
  rebuilding every field from `pendingPeople`.
- **All 20 live accounts' passcodes bulk-reset to a single shared value** (`A00a00`) for local
  testing convenience, at the project owner's explicit request. **This is a known,
  currently-unresolved security issue** — see the warning at the top of `HANDOFF.md`.

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
  scoping, and full create/update/delete on every account type. Found and fixed one real bug along
  the way — a `router.replace()`-during-render React error on the ADMIN submission-detail guards.
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
