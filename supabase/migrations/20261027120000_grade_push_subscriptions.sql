-- Web Push device endpoints belong to the signed-in Ritual user.
create table if not exists public.grade_push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  endpoint text not null check (length(endpoint) <= 4096),
  created_at timestamptz not null default now(),
  constraint grade_push_subscriptions_user_endpoint_unique unique (user_id, endpoint),
  constraint grade_push_subscriptions_https_endpoint check (endpoint like 'https://%')
);

create index if not exists grade_push_subscriptions_user_id_idx
  on public.grade_push_subscriptions (user_id);

alter table public.grade_push_subscriptions enable row level security;

drop policy if exists "Owner manages own grade push subscriptions" on public.grade_push_subscriptions;
create policy "Owner manages own grade push subscriptions" on public.grade_push_subscriptions
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

grant select, insert, update, delete on public.grade_push_subscriptions to authenticated;
grant all on public.grade_push_subscriptions to service_role;

notify pgrst, 'reload schema';
