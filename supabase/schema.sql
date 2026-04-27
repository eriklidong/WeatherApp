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

drop policy if exists "anon can upsert preferences" on public.user_preferences;
create policy "anon can upsert preferences"
  on public.user_preferences
  for all
  to anon
  using (true)
  with check (true);

drop policy if exists "anon can insert snapshots" on public.alert_snapshots;
create policy "anon can insert snapshots"
  on public.alert_snapshots
  for insert
  to anon
  with check (true);

drop policy if exists "anon can read own snapshots count" on public.alert_snapshots;
create policy "anon can read own snapshots count"
  on public.alert_snapshots
  for select
  to anon
  using (true);
