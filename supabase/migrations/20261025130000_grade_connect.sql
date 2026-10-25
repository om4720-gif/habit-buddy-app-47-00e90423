-- One-time connect requests: Ritual creates one, the grades app returns it with its secret.
create table if not exists public.grade_connect_states (
  state_hash text primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  expires_at timestamptz not null,
  created_at timestamptz not null default now()
);

alter table public.grade_connect_states enable row level security;

drop policy if exists "Owner manages own connect requests" on public.grade_connect_states;
create policy "Owner manages own connect requests" on public.grade_connect_states
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

grant all on public.grade_connect_states to service_role;

notify pgrst, 'reload schema';
