-- Feed grades that couldn't be placed in a category yet. The owner assigns them by hand.
create table if not exists public.unsorted_grades (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  course_id uuid not null references public.courses(id) on delete cascade,
  title text not null,
  score numeric not null,
  max_score numeric not null,
  created_at timestamptz not null default now(),
  unique (course_id, title)
);

alter table public.unsorted_grades enable row level security;

drop policy if exists "Owner reads own unsorted grades" on public.unsorted_grades;
drop policy if exists "Owner writes own unsorted grades" on public.unsorted_grades;
drop policy if exists "Owner changes own unsorted grades" on public.unsorted_grades;
drop policy if exists "Owner removes own unsorted grades" on public.unsorted_grades;

create policy "Owner reads own unsorted grades" on public.unsorted_grades
  for select using (auth.uid() = user_id);
create policy "Owner writes own unsorted grades" on public.unsorted_grades
  for insert with check (auth.uid() = user_id);
create policy "Owner changes own unsorted grades" on public.unsorted_grades
  for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "Owner removes own unsorted grades" on public.unsorted_grades
  for delete using (auth.uid() = user_id);
