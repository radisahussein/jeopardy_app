alter table public.games
  add column if not exists final_jeopardy_question jsonb default null;
