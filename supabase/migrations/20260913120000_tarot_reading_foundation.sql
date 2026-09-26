-- Tarot Reading Foundation: tarot_readings table, storing one row per card
-- draw. Structurally parallel to fairy_responses (see
-- 20260825120000_fairy_data_foundation.sql). RLS policies are added
-- separately in 20260913120100_tarot_reading_foundation_rls.sql.

create table public.tarot_readings (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  question text,
  card_key text not null,
  orientation text not null check (orientation in ('upright', 'reversed')),
  answer text not null,
  liked boolean not null default false,
  created_at timestamptz not null default now()
);

create index tarot_readings_user_liked_created_idx
  on public.tarot_readings (user_id, liked, created_at desc);
