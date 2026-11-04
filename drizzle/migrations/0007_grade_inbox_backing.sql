CREATE TABLE public.grade_inbox_tokens (
  user_id uuid primary key,
  token text not null unique default encode(gen_random_bytes(24), 'hex'),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

ALTER TABLE public.grade_inbox_tokens ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can manage their own grade inbox token"
ON public.grade_inbox_tokens
FOR ALL
TO authenticated
USING (user_id = auth.uid())
WITH CHECK (user_id = auth.uid());

GRANT SELECT, INSERT, UPDATE, DELETE ON public.grade_inbox_tokens TO authenticated;
GRANT ALL ON public.grade_inbox_tokens TO service_role;

CREATE TABLE public.grade_inbox_checks (
  id bigint generated always as identity primary key,
  user_id uuid not null,
  checked_at timestamptz not null default now()
);

CREATE INDEX grade_inbox_checks_user_time_idx
ON public.grade_inbox_checks (user_id, checked_at);

ALTER TABLE public.grade_inbox_checks ENABLE ROW LEVEL SECURITY;

GRANT ALL ON public.grade_inbox_checks TO service_role;

CREATE OR REPLACE FUNCTION public.consume_grade_inbox_check(p_user_id uuid)
RETURNS TABLE (allowed boolean, checks_used integer, reset_at timestamptz)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  window_start timestamptz := now() - interval '24 hours';
  used integer;
  oldest timestamptz;
BEGIN
  DELETE FROM public.grade_inbox_checks WHERE checked_at < now() - interval '7 days';

  SELECT count(*), min(checked_at) INTO used, oldest
  FROM public.grade_inbox_checks
  WHERE user_id = p_user_id AND checked_at > window_start;

  IF used < 3 THEN
    INSERT INTO public.grade_inbox_checks (user_id) VALUES (p_user_id);
    RETURN QUERY SELECT true, used + 1, now() + interval '24 hours';
  ELSE
    RETURN QUERY SELECT false, used, oldest + interval '24 hours';
  END IF;
END;
$$;

REVOKE ALL ON FUNCTION public.consume_grade_inbox_check(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.consume_grade_inbox_check(uuid) TO service_role;
