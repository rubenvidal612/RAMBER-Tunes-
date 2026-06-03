insert into storage.buckets (id, name, public)
values ('telegram-audio', 'telegram-audio', true)
on conflict (id) do update set public = excluded.public;
