-- Fairy Data Foundation (F-01): profiles + fairy_responses tables,
-- plus a trigger that auto-provisions a profiles row on signup.
-- RLS policies are added separately in 20260825120100_fairy_data_foundation_rls.sql.

create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  name text,
  birth_date date,
  about_me text check (about_me is null or char_length(about_me) <= 500),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.fairy_responses (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  question text not null,
  answer text not null,
  liked boolean not null default false,
  created_at timestamptz not null default now()
);

create index fairy_responses_user_liked_created_idx
  on public.fairy_responses (user_id, liked, created_at desc);

-- Auto-provision a profiles row whenever a new auth user signs up, so
-- downstream slices can always UPDATE and never need to handle a
-- missing-profile case. security definer + fixed search_path is the
-- standard Supabase pattern to avoid search-path hijacking.
create function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id) values (new.id);
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row
  execute function public.handle_new_user();
