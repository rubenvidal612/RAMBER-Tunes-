alter table if exists public.suno_tasks
add column if not exists client_attempt_id text;

create unique index if not exists suno_tasks_voice_validate_client_attempt_unique
on public.suno_tasks (user_id, kind, client_attempt_id)
where kind = 'voice-validate' and client_attempt_id is not null;
