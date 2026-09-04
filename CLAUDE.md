# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

@AGENTS.md
@HANDOFF.md

## Commands

```bash
npm run dev          # dev server (localhost:3000)
npm run build        # prisma generate && next build — run before committing non-trivial changes
npm run lint         # eslint (flat config, eslint-config-next core-web-vitals + typescript)
npm run db:migrate   # prisma migrate dev (see note below — this repo has no migrations dir)
npm run db:seed      # tsx prisma/seed.ts
npm run db:studio    # prisma studio
```

There is no test runner configured (no Jest/Vitest, no test files under `src/`). Playwright is a
devDependency but there is no `playwright.config.*` or `e2e/` directory in this repo — treat it as
unused until one is added. Verify changes by running `npm run build` and exercising the flow
manually (dev server + browser), not by writing/running automated tests.

**Migrations**: `prisma/migrations/` does not exist — the schema has always been managed with
`prisma db push`, not `prisma migrate`. Running `npm run db:migrate` / `prisma migrate deploy`
against a fresh database will not create any schema. Use `npx prisma db push` instead. See
`docs/SUPABASE-MIGRATION.md` for the Supabase ownership-transfer procedure if you're touching
database/env config.

## Architecture

Next.js 16 App Router, one Postgres database (Supabase), server-fetched state — **not** a SPA with
client-only state. The full behavioral spec (workflow steps, roles, email rules, upload gating,
UI conventions) lives in `AGENTS.md` (imported above); this section is only the map of *where*
things live.

```
src/app/api/**              all business logic — route handlers are the source of truth
src/app/dashboard/<role>/** thin pages per role, mostly wrapping shared components
src/components/**           RoleSubmissionDetail, SignatureButton, CommitteeSignPanel,
                             WorkflowTimeline, FileList, FileUploader — the shared UI that
                             every role dashboard is built from
src/context/AppContext.tsx  client state cache; polls the API, exposes actions
                             (approveCurrentStep, committeeSign, adminOverrideStep, ...)
src/lib/
  prisma.ts                 Prisma singleton (globalThis-cached — see AGENTS.md, do not "fix")
  auth.ts                   NextAuth v5 config (credentials + JWT session)
  email.ts                  nodemailer step/finance notifications
  supabase.ts               Storage helpers (private `thesis-files` bucket) — uploadFile/deleteFile
                             use the service-role key; getSignedUrl mints 1h download URLs, served
                             via GET /api/upload/[uploadId]/signed-url (gated by the same
                             submission-involvement check as the rest of the API)
  utils.ts                  getStepName(), ROLE_LABELS/ROLE_GRADIENT/ROLE_EMOJI, formatDate, cn
  workflow.ts                dead stub file left over from an earlier mock build — ignore it,
                             real workflow logic is in src/app/api/submissions/**
  roleRoutes.ts              maps the 4 account-level roles to dashboard paths
prisma/schema.prisma         DB schema — source of truth for models/enums
```

**Files are never served by public URL** — `FormUpload.fileUrl` stores a bare storage path, not a
public link (the bucket is private). Any preview/download must go through
`GET /api/upload/[uploadId]/signed-url` to resolve a short-lived signed URL first; see
`previewFile`/`downloadFile` in `src/lib/utils.ts` for the client-side pattern.

**Two role systems, don't conflate them**: `User.roles: Role[]` (`SUPER_ADMIN | ADMIN | STUDENT |
PROFESSOR`) is the literal account type in the DB/session (`src/types/index.ts`, `roleRoutes.ts`).
A `PROFESSOR` account additionally plays *contextual* roles per submission (`ADVISOR`,
`CO_ADVISOR`, `PROGRAM_CHAIR`, `HEAD_EXAM_COMMITTEE`, `EXAM_COMMITTEE`,
`INVITED_EXAM_COMMITTEE`) — these are plain strings on `WorkflowStep.role` / submission fields
(`advisorId`, `committeeIds`, etc.), not part of the `Role` enum. The workflow step sequences
(`PROPOSAL_ROLES` / `THESIS_ROLES`) that define these contextual roles per step live in
`src/app/api/submissions/route.ts`.

**`docs/ARCHITECTURE.md` and `docs/RECIPES.md` are stale** — they describe a pre-database version
of this app (all state in `AppContext` + `localStorage`, no Prisma/NextAuth/Supabase). That
version no longer exists; don't follow their instructions. `AGENTS.md` is the accurate, current
description of app behavior.
