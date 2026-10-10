# Handoff — for the next developer

Read this **after** `AGENTS.md` (the behavioral spec). This file is not a spec and not a log — it's
the state a new session needs to pick up current work: what to watch out for, what's still open,
and where things live. Dated history goes in `CHANGELOG.md`; only touch this file when something
changes what the *next* session needs to know or do. Keep it short.

The app is **live** — treat data and email as production on every environment (there is no
email-redirect safety net).

---

## Read this before touching real accounts or sending email

Live DB state, checked 2026-10-10: 29 users (1 SUPER_ADMIN, 2 ADMIN, 21 PROFESSOR, 3 EXTERNAL,
2 STUDENT) and 3 submissions, all `COMPLETED` (นางสาวสมร สะสมทรัพย์'s proposal + defense, นายสมชาย
ตั้งใจดี's proposal).

- **⚠️ 20 of the 29 accounts share the passcode `A00a00`**, from a bulk reset for testing
  (`CHANGELOG.md` 2026-09-07). Anyone who knows it can log in as those users. Fix: reset each real
  account to its own passcode (ADMIN's per-user "รีเซ็ตรหัสเข้าใช้งาน"), then remove this warning.
- **Every workflow-role setting except finance points at a test account.** The department chair
  (ศ.ดร.ไพโรจน์ สิงหถนัดกิจ) and all three program chairs (จิตติน แตงเที่ยง for ME_MECH and PHD,
  ณัฐพล ดำรงค์พลาสิทธิ์ for ME_CPS) are `sukhum.s+…@cp.eng.chula.ac.th` accounts. These holders are
  the only ones who can sign their steps, the department chair sees every submission, and their
  names are printed on the generated memos. Set the real people in "ตั้งค่าระบบ" before real
  submissions reach those steps. The finance contact is a real address.
- **Every submission needs an EXTERNAL account** for กรรมการภายนอก, and a `PHD` one needs a second
  to chair the exam committee (one person, one role) — see "Committee composition by degree" in
  `AGENTS.md`. Only 3 exist.
- **Never run `npm run db:seed` against the production database.** `prisma/seed.ts` creates
  accounts named after real faculty at real-looking `@eng.chula.ac.th` addresses, all with the
  passcode `password123`. Only safe on a throwaway local database; it should be reworked to use
  obviously fake identities, or removed.
- **No environment redirects outgoing email** — local dev, Preview and Production all send real
  email to whatever address is on the account.
- **The Gmail sender (`GMAIL_USER`) can hit Google's ~500/day limit** (seen 2026-09-09:
  `550-5.4.5 Daily user sending limit exceeded`). DB writes happen regardless and the UI reports
  the failed send. Options, undecided: live with it, switch to the built-in Office365 path
  (`SMTP_USER`/`SMTP_PASS`, needs a Chula mailbox with Authenticated SMTP), or a transactional
  email provider.
- **Workflow restructures need in-flight submissions rebuilt.** Steps are snapshotted at creation
  (see `AGENTS.md`). Pattern used so far: a one-off script that keeps the leading steps whose role
  already matches the new `PROPOSAL_ROLES`/`THESIS_ROLES`, refuses if any step to be replaced has
  been acted on, and in one transaction deletes the rest and `createMany`s them from
  `buildWorkflowSteps(...)` — or, when steps are only appended, inserts the new PENDING rows.

---

## Where things live

| | |
| --- | --- |
| Local checkout | `C:\Users\lenovo\Desktop\Grad Tracking System\thesis-app` (if `next dev` panics with "Next.js package not found" after moving the folder, delete the copied `.next/`) |
| `origin` | `https://github.com/sukhum-chula/thesis-app` |
| `upstream` | `https://github.com/Jukkruu/thesis-app` (original author, read-only reference) |
| Vercel | `thesis-app` under account `sukhums-4319` — auto-deploys on push to `main` |
| Supabase | `tluqclmgbnciymxzknhh` (`ap-southeast-1`). The previous owner's project `jttfcoisygcqqshghkmn` is paused, not deleted — **still needs retiring** (revoke its service-role key, then delete it). |

Not part of the app: the Thai PDF form templates one level up in `Grad Tracking System\` (`บ.วศ.1ก`,
`บ.2`, `บ.3`, `บ.4`, exam-result form) and the git-ignored `dataset/` folder (source PDFs/XLSX with
real student and faculty data) — keep both, never commit `dataset/`.

`scripts/` (committed): `migrate-supabase.mjs` (project-to-project copy, see
`docs/SUPABASE-MIGRATION.md`); `make-wordlist.js` / `import-wordlist.js` — **obsolete**: they built and
read `../thesis-wordlist.xlsx`, which no longer exists, and `translations.ts` has been hand-edited
since; running `import-wordlist.js` against a recreated spreadsheet would overwrite it. Delete them;
`mass-email-change.ts` — an already-run
one-off that moved PROFESSOR/STUDENT emails to plus-tagged test addresses. It breaks the "one-off
scripts are deleted after running" convention below; delete it once its `--revert` is no longer
needed.

### Environment variables
The full annotated list is in `AGENTS.md` ("Required env vars"). Reminders for this deployment:
- `AUTH_SECRET`, not `NEXTAUTH_SECRET`.
- `NEXTAUTH_URL` is set for **Production only**; leave it unset on Preview/Development so the
  `VERCEL_URL` fallback works per deployment.
- `FINANCE_EMAIL` (`hare081987@gmail.com`) is only the fallback; the designated finance-contact
  ADMIN is the primary recipient.
- Leave `NEXT_PUBLIC_DEMO_MODE` unset in production (it shows the demo reset tools).
- `NEXT_PUBLIC_*` values are inlined at build time — changing one needs a redeploy.

---

## Database/infra gotchas a new session will get wrong

- **There is no `prisma/migrations/` directory.** The schema is managed with `prisma db push`;
  `prisma migrate deploy` finds nothing and silently leaves a database empty.
- **`prisma db push` needs the direct connection (port 5432)**, not the transaction pooler (6543) —
  pgbouncer transaction mode doesn't support the migration engine's prepared statements; it hangs.
- **`DATABASE_URL` must be the transaction-mode pooler on 6543.** Session mode (5432) has a
  15-client cap and caused a real `EMAXCONNSESSION` incident.
- **`prisma db push` won't drop the table of a model removed earlier** — a model deletion needs its
  own deliberate `DROP TABLE`.
- **After any Prisma schema change — including a new enum value — restart `next dev`.** A running
  dev server keeps its old compiled client: a renamed/added column throws "column does not exist",
  and an unknown enum value fails as a 500 (e.g. every `COVER_PAGE` upload showed only
  "อัปโหลดไม่สำเร็จ" until a restart). Clear `.next/` if it persists. Production rebuilds the client
  on every deploy.
- Storage bucket `thesis-files` is **private**; `FormUpload.fileUrl` is a bare path served through
  signed URLs. Never reintroduce a public bucket or stored public URL. Upload paths are
  `{submissionId}/...`, which `deleteFolder()` relies on.
- **One-off DB scripts** go in `scripts/`, run once with `npx tsx`, then get deleted (not
  committed) — the convention when only the pooler connection is available.

---

## Open items

Roughly in priority order:

1. **Reset the shared passcodes** (see the warning above).
2. **Set the real department chair and program chairs** in "ตั้งค่าระบบ".
3. **A full end-to-end click-through has never been done on the deployed site.** Proposals and a
   defense have been completed on the local dev server against the production DB, but no one has
   walked a whole PROPOSAL and THESIS_DEFENSE as real users on the Vercel URL. Features that have
   only been build-checked and should be covered by that pass:
   - the generated memos (2026-10-06): PROPOSAL steps 8 → 9 → 10; THESIS_DEFENSE step 9 (generate
     the result memo, upload as PDF) → 10 (department chair signs ใบรายงานผล + the memo) → 11
     (LessPaper);
   - the admin's step-2 finance-form generator (download → edit → re-upload with the
     content-differs warning) and the finance email on that approval;
   - the 2026-10-10 signing order and the sent-back signer keeping their upload;
   - multi-member กรรมการภายนอก signing in sequence, with emails;
   - degree rules: the ประธานกรรมการสอบ picker switching to externals only for `PHD`, and a draft
     whose committee became invalid clearing the bad row and refusing both save and confirm;
   - the email-failure branches (passcode reset, login-email change, `/super-dashboard` add-user).
4. **Retire the old Supabase project** (`jttfcoisygcqqshghkmn`).
5. **Fix the outgoing-mail quota problem** — pick one of the options above.
6. **Decide what deleting a user should do to their audit trail.** Only `submissions.studentId` and
   `form_uploads.uploadedById` block a delete; `submissions.advisorId` and
   `workflow_steps.actedById` are `SET NULL`, so deleting a professor silently erases their advisor
   link and step attribution, and the committee id columns (not FKs) are left dangling. Making those
   two relations `Restrict` would close the first half. A deliberate decision, not a drive-by.
7. **Leftover cleanup**: dead files `src/lib/workflow.ts`, `src/lib/fileStore.ts` (imported
   nowhere) and `src/components/DashboardHeader.tsx` (rendered nowhere) could be deleted;
   `docs/ARCHITECTURE.md`/`docs/RECIPES.md` are stale pre-database docs; the storage bucket held ~405
   orphaned objects as of 2026-09-15 (worth a sweep); and the comment at `src/lib/utils.ts`
   (`SINGLE_VERSION_FORMS`) still says a defense has two LessPaper documents (it has three).

---

## Email

`src/lib/email.ts` — step notifications, finance mail and account mail via nodemailer (exam
reminders are in-app only). `SMTP_USER`/`SMTP_PASS` (Office365, default `smtp.office365.com:587`)
take priority over `GMAIL_USER`/`GMAIL_APP_PASSWORD`. Currently running on Gmail — see the quota
warning above.
