alter table if exists public.library_items
  add column if not exists accepted_at timestamptz null,
  add column if not exists delivered_at timestamptz null,
  add column if not exists delivery_status text null,
  add column if not exists accepted_via text null;

create index if not exists idx_library_items_delivery_status
  on public.library_items (user_id, delivery_status, created_at desc);
