import { createClient } from "@/lib/supabase/server";
import { notFound } from "next/navigation";
import JeopardyBoard from "@/components/board/JeopardyBoard";
import { GameSession, GameWithRounds, SessionTeamWithTeam } from "@/lib/types";
import { sortGame } from "@/lib/game-utils";

export default async function PlayPage({
  params,
}: {
  params: Promise<{ sessionId: string }>;
}) {
  const { sessionId } = await params;
  const supabase = await createClient();

  const { data: rawSession } = await supabase
    .from("game_sessions")
    .select("*")
    .eq("id", sessionId)
    .single();
  const session = rawSession as unknown as GameSession | null;

  if (!session) notFound();

  const { data: game } = await supabase
    .from("games")
    .select(`
      *,
      teams(*),
      rounds(
        *,
        categories(
          *,
          questions(*)
        )
      )
    `)
    .eq("id", session.game_id)
    .returns<GameWithRounds[]>()
    .single();

  if (!game) notFound();

  const { data: sessionTeams } = await supabase
    .from("session_teams")
    .select("*, team:teams(*)")
    .eq("session_id", sessionId)
    .returns<SessionTeamWithTeam[]>();

  return (
    <JeopardyBoard
      session={session}
      game={sortGame(game)}
      initialSessionTeams={sessionTeams ?? []}
    />
  );
}
