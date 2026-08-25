-- Fairy Data Foundation (F-01) follow-up: keep profiles.updated_at fresh.
-- Without this, updated_at stays frozen at row-creation time forever since
-- nothing else refreshes it on UPDATE.

create function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger profiles_set_updated_at
  before update on public.profiles
  for each row
  execute function public.set_updated_at();
