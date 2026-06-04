-- Atomic function: log attempt + update score in a single transaction.
-- Prevents score/attempt desync when one of the two DB calls would fail.
create or replace function update_score_and_log_attempt(
  p_session_id uuid,
  p_question_id uuid,
  p_picking_team_id uuid,
  p_answering_team_id uuid,
  p_is_correct boolean,
  p_points_delta int,
  p_wager_amount int default null
) returns void
language plpgsql
security definer
as $$
begin
  insert into public.question_attempts (
    session_id, question_id, picking_team_id, answering_team_id,
    is_correct, points_delta, wager_amount
  ) values (
    p_session_id, p_question_id, p_picking_team_id, p_answering_team_id,
    p_is_correct, p_points_delta, p_wager_amount
  );

  update public.session_teams
  set score = score + p_points_delta
  where session_id = p_session_id and team_id = p_answering_team_id;
end;
$$;
