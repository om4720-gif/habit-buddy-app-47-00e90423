-- Records the last message the grades webhook received, so Settings can show it.
alter table public.grade_webhooks
  add column if not exists last_seen_at timestamptz,
  add column if not exists last_result text;

notify pgrst, 'reload schema';
