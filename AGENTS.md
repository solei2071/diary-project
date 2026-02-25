# AGENTS.md

## Cursor Cloud specific instructions

### Overview
Daily Flow Diary — a Next.js 14 (App Router) personal diary/planner PWA with Supabase backend (PostgreSQL + Auth). Single-project repo (not a monorepo).

### Services
| Service | Port | Purpose |
|---------|------|---------|
| Next.js dev server | 3000 | `npm run dev` — the main application |
| Supabase (local) | 54321 (API), 54322 (DB), 54323 (Studio), 54324 (Mailpit) | `supabase start` — PostgreSQL, Auth, and email testing |

### Running locally
1. Start Docker: `sudo dockerd &>/tmp/dockerd.log &` (if not already running), then `sudo chmod 666 /var/run/docker.sock`
2. Start Supabase: `supabase start` (from `/workspace`)
3. Apply schema: `docker exec -i supabase_db_workspace psql -U postgres -d postgres < supabase/schema.sql`
4. Start dev server: `npm run dev`

### Key caveats
- The Supabase client in `src/lib/supabase.ts` throws at module load if `NEXT_PUBLIC_SUPABASE_URL` or `NEXT_PUBLIC_SUPABASE_ANON_KEY` are missing. Both must be set in `.env.local`.
- For local dev, use `supabase status -o env` to retrieve the `ANON_KEY` and `API_URL` values.
- The app works without login — users can create todos, log activities, and write notes. Auth (magic link) is only required when saving/syncing data to Supabase. Local Supabase includes Mailpit at port 54324 for testing magic link emails.
- `supabase/schema.sql` is not in the migrations folder. It must be applied manually after `supabase start` or `supabase db reset`.
- Standard commands: see `package.json` scripts — `npm run lint`, `npm run build`, `npm run dev`.
