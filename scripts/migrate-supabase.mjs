#!/usr/bin/env node
/**
 * Migrate this app's Supabase project to a new one (new owner account).
 *
 * Copies:
 *   1. Table data  — old Postgres  -> new Postgres  (schema must already exist)
 *   2. Storage      — old `thesis-files` bucket -> new bucket (private, signed URLs)
 *
 * Prerequisites
 *   - The NEW Supabase project exists and its schema is created:
 *       set DATABASE_URL to the NEW project, then:  npx prisma db push
 *     (this repo has no prisma/migrations folder, so `db push` is the way)
 *   - A file `.env.migrate` next to package.json holding the six values below.
 *   - `npm install` has been run (uses `pg` and `@supabase/supabase-js` from node_modules).
 *
 * .env.migrate
 *   OLD_DATABASE_URL=postgresql://...      # old project, Connect -> URI
 *   OLD_SUPABASE_URL=https://xxx.supabase.co
 *   OLD_SERVICE_ROLE_KEY=eyJ...
 *   NEW_DATABASE_URL=postgresql://...
 *   NEW_SUPABASE_URL=https://yyy.supabase.co
 *   NEW_SERVICE_ROLE_KEY=eyJ...
 *
 * Usage
 *   node scripts/migrate-supabase.mjs --dry-run     # inspect both sides, copy nothing
 *   node scripts/migrate-supabase.mjs               # data + storage
 *   node scripts/migrate-supabase.mjs --skip-storage
 *   node scripts/migrate-supabase.mjs --skip-data
 *   node scripts/migrate-supabase.mjs --include-ephemeral   # also magic_tokens + rate_limits
 *   node scripts/migrate-supabase.mjs --force-storage       # re-upload files already in dest
 *
 * Safe to re-run: row inserts use ON CONFLICT DO NOTHING, uploads skip existing paths.
 */

import { readFileSync } from 'node:fs'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import pg from 'pg'
import { createClient } from '@supabase/supabase-js'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const BUCKET = 'thesis-files'
const BATCH = 500
const UPLOAD_CONCURRENCY = 4

const args = new Set(process.argv.slice(2))
const DRY = args.has('--dry-run')
const SKIP_DATA = args.has('--skip-data')
const SKIP_STORAGE = args.has('--skip-storage')
const INCLUDE_EPHEMERAL = args.has('--include-ephemeral')
const FORCE_STORAGE = args.has('--force-storage')

/** Parent-before-child: every FK target is copied before the table that points at it. */
const TABLES = [
  { name: 'users', key: 'id' },
  { name: 'submissions', key: 'id' },
  { name: 'workflow_steps', key: 'id' },
  { name: 'form_uploads', key: 'id' },
  { name: 'signatures', key: 'id' },
  { name: 'notifications', key: 'id' },
]
const EPHEMERAL = [
  { name: 'magic_tokens', key: 'id' },
  { name: 'rate_limits', key: 'key' },
]

// ---------------------------------------------------------------- env loading

function loadEnvFile(path) {
  let raw
  try {
    raw = readFileSync(path, 'utf8')
  } catch {
    die(`missing ${path}\n\nCreate it with the six OLD_*/NEW_* values — see the header of this script.`)
  }
  const out = {}
  for (const line of raw.replace(/^﻿/, '').split(/\r?\n/)) {
    const m = /^\s*([A-Z0-9_]+)\s*=\s*(.*)$/.exec(line)
    if (!m) continue
    let v = m[2].trim()
    if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) v = v.slice(1, -1)
    out[m[1]] = v
  }
  return out
}

function die(msg) {
  console.error(`\n✖ ${msg}\n`)
  process.exit(1)
}

const env = loadEnvFile(resolve(ROOT, '.env.migrate'))
const REQUIRED = [
  'OLD_DATABASE_URL', 'OLD_SUPABASE_URL', 'OLD_SERVICE_ROLE_KEY',
  'NEW_DATABASE_URL', 'NEW_SUPABASE_URL', 'NEW_SERVICE_ROLE_KEY',
]
const missing = REQUIRED.filter((k) => !env[k])
if (missing.length) die(`.env.migrate is missing: ${missing.join(', ')}`)
if (env.OLD_DATABASE_URL === env.NEW_DATABASE_URL) die('OLD_DATABASE_URL and NEW_DATABASE_URL are identical — refusing to run.')
if (env.OLD_SUPABASE_URL === env.NEW_SUPABASE_URL) die('OLD_SUPABASE_URL and NEW_SUPABASE_URL are identical — refusing to run.')

// ------------------------------------------------------------------ postgres

function client(url) {
  // Supabase requires TLS; `sslmode=disable` in the URL (local Postgres) opts out.
  const ssl = /sslmode=disable/i.test(url) ? false : { rejectUnauthorized: false }
  return new pg.Client({ connectionString: url, ssl })
}

async function tableExists(c, name) {
  const { rows } = await c.query('SELECT to_regclass($1) AS reg', [`public.${name}`])
  return rows[0].reg !== null
}

async function count(c, name) {
  const { rows } = await c.query(`SELECT count(*)::int AS n FROM "${name}"`)
  return rows[0].n
}

/**
 * Copy one table. Rows travel as jsonb and are rebuilt on the target with
 * jsonb_populate_recordset(null::"table", ...), so Postgres itself handles enums,
 * text[]/enum[] arrays, jsonb columns and timestamps — no per-column type mapping.
 */
async function copyTable(src, dst, { name, key }) {
  const total = await count(src, name)
  if (total === 0) {
    console.log(`  ${name.padEnd(15)} 0 rows — nothing to copy`)
    return { name, copied: 0, total: 0 }
  }
  let offset = 0
  let copied = 0
  while (offset < total) {
    const { rows } = await src.query(
      `SELECT to_jsonb(t) AS r FROM "${name}" t ORDER BY "${key}" LIMIT $1 OFFSET $2`,
      [BATCH, offset],
    )
    if (!rows.length) break
    const payload = JSON.stringify(rows.map((r) => r.r))
    const res = await dst.query(
      `INSERT INTO "${name}" SELECT * FROM jsonb_populate_recordset(null::"${name}", $1::jsonb)
       ON CONFLICT DO NOTHING`,
      [payload],
    )
    copied += res.rowCount
    offset += rows.length
    process.stdout.write(`\r  ${name.padEnd(15)} ${offset}/${total} read, ${copied} inserted`)
  }
  process.stdout.write(`\r  ${name.padEnd(15)} ${total}/${total} read, ${copied} inserted${' '.repeat(12)}\n`)
  return { name, copied, total }
}

// ------------------------------------------------------------------- storage

async function walk(store, prefix = '') {
  const files = []
  let offset = 0
  for (;;) {
    const { data, error } = await store.list(prefix, { limit: 1000, offset })
    if (error) throw new Error(`list "${prefix || '/'}": ${error.message}`)
    if (!data?.length) break
    for (const entry of data) {
      const path = prefix ? `${prefix}/${entry.name}` : entry.name
      // Supabase returns folders as entries with a null id.
      if (entry.id === null) files.push(...(await walk(store, path)))
      else files.push({ path, size: entry.metadata?.size ?? 0, mime: entry.metadata?.mimetype })
    }
    if (data.length < 1000) break
    offset += data.length
  }
  return files
}

async function ensureBucket(oldSb, newSb) {
  const { data: existing } = await newSb.storage.getBucket(BUCKET)
  if (existing) {
    console.log(`  bucket "${BUCKET}" already exists on the new project (public=${existing.public})`)
    return
  }
  const { data: source } = await oldSb.storage.getBucket(BUCKET)
  const opts = {
    public: source?.public ?? false,
    fileSizeLimit: source?.file_size_limit ?? null,
    allowedMimeTypes: source?.allowed_mime_types ?? null,
  }
  if (DRY) {
    console.log(`  [dry-run] would create bucket "${BUCKET}" (public=${opts.public})`)
    return
  }
  const { error } = await newSb.storage.createBucket(BUCKET, opts)
  if (error) die(`could not create bucket "${BUCKET}": ${error.message}`)
  console.log(`  created bucket "${BUCKET}" (public=${opts.public})`)
}

async function copyStorage(oldSb, newSb) {
  await ensureBucket(oldSb, newSb)
  const from = oldSb.storage.from(BUCKET)
  const to = newSb.storage.from(BUCKET)

  const files = await walk(from)
  const bytes = files.reduce((a, f) => a + f.size, 0)
  console.log(`  ${files.length} file(s), ${(bytes / 1024 / 1024).toFixed(1)} MB in the old bucket`)
  if (!files.length || DRY) {
    if (DRY) files.slice(0, 10).forEach((f) => console.log(`  [dry-run] would copy ${f.path}`))
    if (DRY && files.length > 10) console.log(`  [dry-run] … and ${files.length - 10} more`)
    return { copied: 0, skipped: 0, failed: [] }
  }

  let present = new Set()
  if (!FORCE_STORAGE) {
    try {
      present = new Set((await walk(to)).map((f) => f.path))
      if (present.size) console.log(`  ${present.size} file(s) already on the new project — skipping those`)
    } catch {
      /* new bucket empty or unreadable; treat as nothing present */
    }
  }

  const queue = files.filter((f) => !present.has(f.path))
  let copied = 0
  const failed = []

  async function worker() {
    for (;;) {
      const f = queue.shift()
      if (!f) return
      try {
        const { data, error } = await from.download(f.path)
        if (error) throw new Error(`download: ${error.message}`)
        const body = Buffer.from(await data.arrayBuffer())
        const { error: upErr } = await to.upload(f.path, body, {
          upsert: true,
          contentType: f.mime || 'application/octet-stream',
        })
        if (upErr) throw new Error(`upload: ${upErr.message}`)
        copied++
        process.stdout.write(`\r  uploaded ${copied}/${files.length - present.size}${' '.repeat(20)}`)
      } catch (e) {
        failed.push({ path: f.path, reason: e.message })
      }
    }
  }
  await Promise.all(Array.from({ length: UPLOAD_CONCURRENCY }, worker))
  process.stdout.write('\n')
  return { copied, skipped: present.size, failed }
}

// ---------------------------------------------------------------------- main

const src = client(env.OLD_DATABASE_URL)
const dst = client(env.NEW_DATABASE_URL)
const oldSb = createClient(env.OLD_SUPABASE_URL, env.OLD_SERVICE_ROLE_KEY, { auth: { persistSession: false } })
const newSb = createClient(env.NEW_SUPABASE_URL, env.NEW_SERVICE_ROLE_KEY, { auth: { persistSession: false } })

console.log(`\nold: ${env.OLD_SUPABASE_URL}\nnew: ${env.NEW_SUPABASE_URL}`)
if (DRY) console.log('\n*** DRY RUN — nothing will be written ***')

try {
  await src.connect()
  await dst.connect()
} catch (e) {
  die(`could not connect: ${e.message}\n\nCheck both DATABASE_URLs (Supabase dashboard -> Connect -> URI) and that your network allows outbound Postgres.`)
}

const tables = INCLUDE_EPHEMERAL ? [...TABLES, ...EPHEMERAL] : TABLES

// The new project must already have the schema — otherwise every insert fails.
const absent = []
for (const t of tables) if (!(await tableExists(dst, t.name))) absent.push(t.name)
if (absent.length) {
  die(
    `the new database is missing table(s): ${absent.join(', ')}\n\n` +
      `Create the schema first — point DATABASE_URL at the NEW project and run:\n` +
      `    npx prisma db push`,
  )
}

console.log('\n— before —')
for (const t of tables) console.log(`  ${t.name.padEnd(15)} old=${await count(src, t.name)}  new=${await count(dst, t.name)}`)

if (!SKIP_DATA && !DRY) {
  console.log('\n— copying table data —')
  for (const t of tables) await copyTable(src, dst, t)
} else {
  console.log(`\n— table data ${DRY ? 'skipped (dry run)' : 'skipped (--skip-data)'} —`)
}

let storage = null
if (!SKIP_STORAGE) {
  console.log('\n— storage —')
  storage = await copyStorage(oldSb, newSb)
} else {
  console.log('\n— storage skipped (--skip-storage) —')
}

console.log('\n— after —')
for (const t of tables) console.log(`  ${t.name.padEnd(15)} old=${await count(src, t.name)}  new=${await count(dst, t.name)}`)

if (storage?.failed?.length) {
  console.log(`\n⚠ ${storage.failed.length} file(s) failed to copy:`)
  storage.failed.slice(0, 20).forEach((f) => console.log(`  ${f.path} — ${f.reason}`))
  console.log('  Re-run the script to retry just these (existing files are skipped).')
}

await src.end()
await dst.end()
console.log(DRY ? '\nDry run complete.\n' : '\nDone.\n')
