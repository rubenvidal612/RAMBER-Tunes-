create table telegram_links (
  id uuid primary key default gen_random_uuid(),
  telegram_user_id bigint unique not null,
  user_id uuid references profiles(id) on delete cascade,
  telegram_username text,
  linked_at timestamp with time zone default now()
);
