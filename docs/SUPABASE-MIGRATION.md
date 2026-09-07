# Moving Supabase to the new owner account

The Supabase project in `.env.local` (`jttfcoisygcqqshghkmn`, Postgres at `aws-1-ap-southeast-1.pooler`)
belongs to the ex-intern's setup. These are the steps to stand up a fresh project under
**sukhum.s@cp.eng.chula.ac.th** and move everything across.

Run all of this on your own machine (PowerShell, in the repo root) — a cloud session can't
reach `supabase.co`, and the Cowork device bridge has no network access at all.

## 1. Create the new project

In the Supabase dashboard, signed in as the new owner:

1. **New project** → name e.g. `thesis-app-prod`, region **Southeast Asia (Singapore) `ap-southeast-1`**
   (same region as the old one — keeps latency to Vercel's Singapore edge sane).
2. Save the database password it generates; you cannot read it back later.
3. Wait for provisioning, then collect four values:

| Value | Where in the dashboard |
| --- | --- |
| `DATABASE_URL` | **Connect** → URI → *Transaction pooler*, port `6543` |
| `NEXT_PUBLIC_SUPABASE_URL` | **Project Settings → API** → Project URL |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | **Project Settings → API** → `anon` / publishable key |
| `SUPABASE_SERVICE_ROLE_KEY` | **Project Settings → API** → `service_role` (secret — server-side only) |

Note the app reads `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` *or* `NEXT_PUBLIC_SUPABASE_ANON_KEY`
(`src/lib/supabase.ts`), so either name works.

## 2. Create the schema

This repo has **no `prisma/migrations/` folder** — the schema was managed with `db push`, not
migrations. So don't run `prisma migrate deploy`; it would find nothing to apply.

```powershell
$env:DATABASE_URL = "<NEW pooler URI>"
npx prisma db push
```

That creates `users`, `submissions`, `workflow_steps`, `form_uploads`, `signatures`,
`magic_tokens`, `rate_limits`, `notifications` plus the enum types.

Optional, only if you want a clean demo dataset instead of the old data: `npm run db:seed`.

## 3. Copy data and files

`scripts/migrate-supabase.mjs` copies table rows and the `thesis-files` storage bucket from the
old project to the new one. Create `.env.migrate` in the repo root (it is covered by the `.env*`
line in `.gitignore`, so it won't be committed):

```
OLD_DATABASE_URL=<old pooler URI>
OLD_SUPABASE_URL=https://jttfcoisygcqqshghkmn.supabase.co
OLD_SERVICE_ROLE_KEY=<old service_role key from .env.local>
NEW_DATABASE_URL=<new pooler URI>
NEW_SUPABASE_URL=https://<new-ref>.supabase.co
NEW_SERVICE_ROLE_KEY=<new service_role key>
```

Then:

```powershell
node scripts/migrate-supabase.mjs --dry-run   # row counts both sides + file inventory
node scripts/migrate-supabase.mjs             # do it
```

Details worth knowing:

- Tables are copied parent-first (`users` → `submissions` → `workflow_steps` → `form_uploads` →
  `signatures` → `notifications`) so foreign keys never dangle.
- Rows travel as `jsonb` and are rebuilt with `jsonb_populate_recordset(null::"table", …)`, which
  lets Postgres handle the enum columns, `Role[]` / `committeeIds` arrays and the
  `committeeActions` JSON without hand-written type mapping.
- Inserts are `ON CONFLICT DO NOTHING` and uploads skip paths that already exist, so the script is
  safe to re-run — useful if a few large files time out.
- `magic_tokens` and `rate_limits` are skipped by default (short-lived; pass
  `--include-ephemeral` to bring them anyway).
- Storage paths are preserved exactly, so the `fileUrl` values in `form_uploads` keep resolving —
  nothing needs rewriting.
- The new bucket is created private, mirroring the old one; the app serves files through
  `createSignedUrl` (1 h expiry), so **do not** make it public.

## 4. Point the app at the new project

Update `.env.local` with the four new values, then:

```powershell
npm run dev
```

Log in and check one existing submission: the timeline renders (Postgres OK) and a file download
opens (storage + service-role key OK).

## 5. Update Vercel

In the Vercel project → **Settings → Environment Variables**, replace the same four values for
**Production, Preview and Development**, and check these while you're there:

- `NEXTAUTH_URL` — must be the deployed origin (e.g. `https://thesis-app.vercel.app`), **not**
  `http://localhost:3000` as it is in `.env.local`. NextAuth builds callback and magic-link URLs
  from it; a localhost value here sends every emailed login link to the user's own machine.
- `AUTH_SECRET` — required in production.
- `CRON_SECRET` — `vercel.json` schedules `/api/cron/exam-reminders` daily at 01:00 UTC. The guard
  is `if (secret && authHeader !== ...)`, so leaving it **unset makes the endpoint publicly
  callable** — anyone can fire exam-reminder emails at will. Set it.
- Email — two separate senders, both need credentials:
  - `src/lib/email.ts` (step notifications, finance mail, exam reminders) uses nodemailer with
    `SMTP_USER`/`SMTP_PASS` (Office 365, default host `smtp.office365.com:587`) or
    `GMAIL_USER`/`GMAIL_APP_PASSWORD`. **None of these are in `.env.local`** — with no credentials
    `sendMail()` logs `[email] … skipping` and returns success, so the app silently sends nothing.
- `DEMO_MODE` / `NEXT_PUBLIC_DEMO_MODE` — leave unset in production; they expose the one-click
  role-login endpoint (`/api/auth/demo`) and the `/demo` pages.

Redeploy after changing env vars — Vercel bakes `NEXT_PUBLIC_*` values in at build time, so an
existing deployment keeps the old Supabase URL until it is rebuilt.

## 6. Retire the old project

Once the new deployment is verified, and only then: pause (don't delete) the intern's Supabase
project for a couple of weeks as a rollback path, revoke its service-role key from any remaining
env files, and delete `VERCEL_OIDC_TOKEN` from `.env.local` — it's a leftover from the intern's
`vercel env pull` and belongs to their Vercel scope.
