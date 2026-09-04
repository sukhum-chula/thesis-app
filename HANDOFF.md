# Handoff — ownership transfer to sukhum.s@cp.eng.chula.ac.th

Written 2026-08-17. Read this **after** `AGENTS.md`. `AGENTS.md` describes the app (workflow rules,
roles, conventions) and is still accurate about behaviour; this file covers what changed when the
project moved off the ex-intern's accounts, and what is still unfinished.

**The app is live with real users.** Treat data and email as production.

---

## 1. Where the code lives now

| | |
| --- | --- |
| Local checkout | `C:\Users\ASUS\Desktop\Grad Tracking System\thesis-app` |
| `origin` | `https://github.com/sukhum-chula/thesis-app` (new owner) |
| `upstream` | `https://github.com/Jukkruu/thesis-app` (ex-intern's original, read-only reference) |
| HEAD at handoff | `730e031 Update README.md` (310 commits) |
| Vercel | project created under the new account |
| Supabase | **still the ex-intern's project** `jttfcoisygcqqshghkmn` — see §3 |

Repo-local git config set during the transfer: `core.fileMode=false`, `core.autocrlf=false`.

Also present in the working folder but **not** part of the app: the Thai PDF forms
(`บ.วศ.1ก`, `บ.2`, `บ.3`, `บ.4`, exam-result form) sitting one level up in
`Grad Tracking System\`, and a `_to_delete\` folder holding transfer scratch files that can be
removed.

## 2. Open work, in the order it should be done

1. **Push to the new remote** if not already done: `git push -u origin main`. Confirm Vercel is
   building from `sukhum-chula/thesis-app` and not still watching the intern's repo.
2. **Migrate Supabase to the new owner** — full procedure in `docs/SUPABASE-MIGRATION.md`, script at
   `scripts/migrate-supabase.mjs`. Because the app is live, treat this as a cutover: announce a
   short freeze, run the copy, verify, then switch env vars. The script is re-runnable
   (`ON CONFLICT DO NOTHING`, uploads skip existing paths), so a second pass catches rows written
   during the window.
3. **Fix `NEXTAUTH_URL` in Vercel.** `.env.local` has `http://localhost:3000`. If that value is in
   the Vercel environment, every emailed login link points at the recipient's own machine.
4. **Set up an email sender the faculty owns** — see §4. Right now step-notification email is
   almost certainly dead in production.
5. **Set `CRON_SECRET`** in Vercel. The guard in `src/app/api/cron/exam-reminders/route.ts:14` is
   `if (secret && ...)`, so with no secret the endpoint is world-callable and anyone can trigger
   exam-reminder emails.
6. **Confirm the build.** `npm run build` has not been run since the transfer. (It could not be
   verified in the cloud session that prepared this handoff — that sandbox blocks
   `binaries.prisma.sh`, so `prisma generate` 403s there. It works fine on a normal network.)
7. **Remove `VERCEL_OIDC_TOKEN` from `.env.local`** — leftover from the intern's `vercel env pull`,
   scoped to their Vercel account.

## 3. Database facts a new session will get wrong

- **There is no `prisma/migrations/` directory.** The schema was managed with `prisma db push`, not
  migrations. `prisma migrate deploy` will find nothing and silently leave a database empty. To
  create the schema on a fresh project: `npx prisma db push`. If you introduce a real migration
  history later, do it deliberately with `prisma migrate diff` against the live schema — don't
  assume a baseline exists.
- `prisma/migrate-roles.sql` is a one-off historical script (single-role → `Role[]`), already
  applied. Not part of setup.
- `DATABASE_URL` must be the **transaction-mode pooler on port 6543**. Session mode (`:5432`) has a
  15-client cap and caused `EMAXCONNSESSION` under real traffic — this is a real incident, not a
  preference.
- Storage bucket `thesis-files` is **private**; files are served through `createSignedUrl(path, 3600)`
  in `src/lib/supabase.ts`. Do not make it public. Upload paths are `{submissionId}/...`, which
  `deleteFolder()` relies on.

## 4. Email — two senders, and one of them is unconfigured

This is the highest-risk area, because failures are silent.

- **`src/lib/email.ts`** — step notifications, finance mail, exam reminders. nodemailer;
  `SMTP_USER`/`SMTP_PASS` (Office 365, default `smtp.office365.com:587`) take priority, else
  `GMAIL_USER`/`GMAIL_APP_PASSWORD`. **None of these are in the current `.env.local`.** With no
  credentials `getTransport()` returns `null` and `sendMail()` logs
  `[email] GMAIL_USER / GMAIL_APP_PASSWORD not set — skipping` and returns `{ error: null }` — a
  successful-looking no-op. Every workflow step advance will appear to notify and notify nobody.
  Getting a Chula mailbox with "Authenticated SMTP" enabled is the durable fix; the intern's Gmail
  app password is not something to inherit.
- `EMAIL_OVERRIDE_TO` routes every nodemailer message to one address, with the intended recipient
  appended to the subject. Set it before any bulk testing against live data.

## 5. `AGENTS.md` statements that are now stale

`AGENTS.md` is otherwise the source of truth — but these lines will mislead:

- *"Deploy: Vercel, auto-deploys on push to `main` (GitHub: Jukkruu/thesis-app)"* → now
  `sukhum-chula/thesis-app` under a new Vercel account.
- *"Emails contain only the plain `/login` URL as text (no button, no magic links) … No new tokens
  are issued."* → **not true any more.** `src/lib/email.ts:170-185` generates a fresh
  `magicToken` per recipient and embeds `/api/auth/magic?t=…` (commit `db23506`, "Generate real
  magic tokens in step notification emails"). If Chula's Office 365 filter starts eating step
  emails again, this is the first thing to look at — that filtering is exactly why the links were
  removed once before.
- The env list names `NEXTAUTH_SECRET`; the code reads **`AUTH_SECRET`** (NextAuth v5 naming) at
  `src/app/api/auth/magic/route.ts:48` and `src/app/api/auth/demo/route.ts:64`.
- The env list omits `CRON_SECRET`, `NEXT_PUBLIC_DEMO_MODE` and
  `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` (accepted as an alias for the anon key in
  `src/lib/supabase.ts:15`).
- *"`EMAIL_OVERRIDE_TO` — REMOVED 2026-07-16"* describes the intern's Vercel environment, not the
  new one. Verify what is actually set in the new project rather than trusting either doc.

When you fix any of these, update `AGENTS.md` in the same commit — it is loaded via `CLAUDE.md`, so
stale lines there mislead every future session.

## 6. Environment variable checklist for the new Vercel project

Set for Production, Preview and Development:

```
DATABASE_URL                            # NEW Supabase, transaction pooler :6543
AUTH_SECRET                             # NOT NEXTAUTH_SECRET
NEXTAUTH_URL                            # deployed origin, e.g. https://thesis-app.vercel.app
NEXT_PUBLIC_SUPABASE_URL                # NEW project
NEXT_PUBLIC_SUPABASE_ANON_KEY           # or NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY
SUPABASE_SERVICE_ROLE_KEY               # NEW project, server-side only
FINANCE_EMAIL                           # currently outanagon2549@gmail.com — confirm this is right
CRON_SECRET                             # see §2.5
SMTP_USER / SMTP_PASS                   # or GMAIL_USER / GMAIL_APP_PASSWORD — see §4
```

Leave unset in production: `DEMO_MODE`, `NEXT_PUBLIC_DEMO_MODE` (they expose `/demo` and the
passwordless role-login at `/api/auth/demo`), and `EMAIL_OVERRIDE_TO`.

Remember `NEXT_PUBLIC_*` values are inlined at build time — changing them requires a redeploy, not
just a restart.

## 7. Verified vs unverified in this handoff

Verified: the clone (`git fsck` clean, 310 commits, clean tree), remotes, and the data half of
`scripts/migrate-supabase.mjs` — tested against a real Postgres pair with the schema from
`prisma/schema.prisma`, seeded with Thai text, an apostrophe in a name, `Role[]`/`committeeIds`
arrays, `committeeActions` jsonb and nulls; all eight tables came out md5-identical and a re-run
inserted zero rows.

Not verified: `npm run build`; the storage half of the migration script (no network path to either
bucket from where it was written — run `--dry-run` first); anything about the state of the new
Vercel project's environment variables.
