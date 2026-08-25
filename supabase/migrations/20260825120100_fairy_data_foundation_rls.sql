-- Fairy Data Foundation (F-01): RLS policies for profiles + fairy_responses.
-- Enforces the PRD privacy guardrail at the database layer: a user can only
-- ever read or write their own rows.

alter table public.profiles enable row level security;
alter table public.fairy_responses enable row level security;

create policy "profiles_select_own"
  on public.profiles
  for select
  using (auth.uid() = id);

create policy "profiles_update_own"
  on public.profiles
  for update
  using (auth.uid() = id)
  with check (auth.uid() = id);

create policy "fairy_responses_select_own"
  on public.fairy_responses
  for select
  using (auth.uid() = user_id);

create policy "fairy_responses_insert_own"
  on public.fairy_responses
  for insert
  with check (auth.uid() = user_id);

create policy "fairy_responses_update_own"
  on public.fairy_responses
  for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create policy "fairy_responses_delete_own"
  on public.fairy_responses
  for delete
  using (auth.uid() = user_id);
