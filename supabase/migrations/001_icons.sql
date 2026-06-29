-- Icon Studio — icons table
-- Run once against your Supabase project via the SQL editor or CLI.

create table if not exists icons (
  id              uuid        primary key default gen_random_uuid(),
  name            text        not null,
  svg             text        not null,
  style           text        not null check (style in ('line', 'filled', 'duotone')),
  stroke_width    numeric     default 1.5,
  corners         text        not null default 'rounded' check (corners in ('rounded', 'sharp')),
  source          text        not null check (source in ('generated', 'uploaded', 'imported')),
  brand_availability  text[]  not null default array['reddoorz','sans','urbanview','lavana'],
  descriptive_tags    text[]  not null default array[]::text[],
  motion          jsonb,
  content_hash    text,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

-- Indexes for search and filtering
create index if not exists icons_brand_availability_idx on icons using gin(brand_availability);
create index if not exists icons_descriptive_tags_idx   on icons using gin(descriptive_tags);
create index if not exists icons_content_hash_idx       on icons (content_hash);
create index if not exists icons_style_idx              on icons (style);
create index if not exists icons_source_idx             on icons (source);

-- Auto-bump updated_at on every row update
create or replace function update_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists icons_updated_at on icons;
create trigger icons_updated_at
  before update on icons
  for each row execute function update_updated_at();

-- Row-level security (open while the tool is internal; add user auth later)
alter table icons enable row level security;

drop policy if exists "icons_select" on icons;
drop policy if exists "icons_all"    on icons;
create policy "icons_select" on icons for select using (true);
create policy "icons_all"    on icons for all    using (true);
