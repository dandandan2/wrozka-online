-- Tarot Reading Foundation: RLS policies for tarot_readings. Same
-- ownership predicate pattern as fairy_responses (see
-- 20260825120100_fairy_data_foundation_rls.sql) — a user can only ever
-- read or write their own readings.

alter table public.tarot_readings enable row level security;

create policy "tarot_readings_select_own"
  on public.tarot_readings
  for select
  using (auth.uid() = user_id);

create policy "tarot_readings_insert_own"
  on public.tarot_readings
  for insert
  with check (auth.uid() = user_id);

create policy "tarot_readings_update_own"
  on public.tarot_readings
  for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create policy "tarot_readings_delete_own"
  on public.tarot_readings
  for delete
  using (auth.uid() = user_id);
