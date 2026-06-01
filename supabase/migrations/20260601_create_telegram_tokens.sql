create table telegram_tokens (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references profiles(id) on delete cascade,
  token text not null,
  used boolean default false,
  created_at timestamp with time zone default now()
);
