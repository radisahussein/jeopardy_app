-- Performance indexes on FK columns (PostgreSQL auto-indexes PKs, not FKs)
create index if not exists idx_rounds_game_id on public.rounds(game_id);
create index if not exists idx_categories_round_id on public.categories(round_id);
create index if not exists idx_questions_category_id on public.questions(category_id);
create index if not exists idx_teams_game_id on public.teams(game_id);
create index if not exists idx_game_sessions_game_id on public.game_sessions(game_id);
create index if not exists idx_session_teams_session_id on public.session_teams(session_id);
create index if not exists idx_session_teams_team_id on public.session_teams(team_id);
create index if not exists idx_question_attempts_session_id on public.question_attempts(session_id);
create index if not exists idx_question_attempts_question_id on public.question_attempts(question_id);
create index if not exists idx_final_jeopardy_submissions_session_id on public.final_jeopardy_submissions(session_id);
