-- One webhook secret per user, stored as a hash (the secret itself is shown once, when created).
create table if not exists public.grade_webhooks (
  user_id uuid primary key references auth.users(id) on delete cascade,
  token_hash text not null,
  created_at timestamptz not null default now()
);

alter table public.grade_webhooks enable row level security;

drop policy if exists "Owner manages own grade webhook" on public.grade_webhooks;
create policy "Owner manages own grade webhook" on public.grade_webhooks
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

notify pgrst, 'reload schema';
