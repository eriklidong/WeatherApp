create table if not exists public.user_preferences (
  browser_id text primary key,
  filter_text text,
  map_lat double precision,
  map_lng double precision,
  zoom_level integer,
  updated_at timestamptz default now()
);

create table if not exists public.alert_snapshots (
  id bigint generated always as identity primary key,
  browser_id text not null,
  captured_at timestamptz default now(),
  total_alerts integer not null,
  severe_count_by_type jsonb not null
);

alter table public.user_preferences enable row level security;
alter table public.alert_snapshots enable row level security;

-- Migration notes for replacing permissive anon policies with row-scoped checks:
-- 1) Backfill/normalize browser_id values so legacy rows have a non-null identifier that
--    matches the request-scoped identifier your client sends in auth context.
-- 2) In deployments, replace policies in this order for each table:
--    drop policy ...; then create policy ... (to avoid overlapping permissive access).
-- 3) Set request.jwt.claim.browser_id (or equivalent authenticated request context)
--    before calling these tables from the client.

-- user_preferences: only allow access to rows matching request-bound browser_id.
drop policy if exists "anon can upsert preferences" on public.user_preferences;
drop policy if exists "anon can select own preferences" on public.user_preferences;
drop policy if exists "anon can insert own preferences" on public.user_preferences;
drop policy if exists "anon can update own preferences" on public.user_preferences;
drop policy if exists "anon can delete own preferences" on public.user_preferences;

create policy "anon can select own preferences"
  on public.user_preferences
  for select
  to anon
  using (browser_id = current_setting('request.jwt.claim.browser_id', true));

create policy "anon can insert own preferences"
  on public.user_preferences
  for insert
  to anon
  with check (browser_id = current_setting('request.jwt.claim.browser_id', true));

create policy "anon can update own preferences"
  on public.user_preferences
  for update
  to anon
  using (browser_id = current_setting('request.jwt.claim.browser_id', true))
  with check (browser_id = current_setting('request.jwt.claim.browser_id', true));

create policy "anon can delete own preferences"
  on public.user_preferences
  for delete
  to anon
  using (browser_id = current_setting('request.jwt.claim.browser_id', true));

-- alert_snapshots: only allow rows tied to request-bound browser_id.
drop policy if exists "anon can insert snapshots" on public.alert_snapshots;
drop policy if exists "anon can read own snapshots count" on public.alert_snapshots;
drop policy if exists "anon can insert own snapshots" on public.alert_snapshots;
drop policy if exists "anon can select own snapshots" on public.alert_snapshots;

create policy "anon can insert own snapshots"
  on public.alert_snapshots
  for insert
  to anon
  with check (browser_id = current_setting('request.jwt.claim.browser_id', true));

create policy "anon can select own snapshots"
  on public.alert_snapshots
  for select
  to anon
  using (browser_id = current_setting('request.jwt.claim.browser_id', true));
