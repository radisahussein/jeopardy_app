import { createClient } from "@/lib/supabase/server";
import { notFound } from "next/navigation";
import RunPanel from "@/components/admin/RunPanel";
import { GameSession, GameWithRounds, SessionTeamWithTeam } from "@/lib/types";
import { sortGame } from "@/lib/game-utils";

export default async function RunPage({
  params,
}: {
  params: Promise<{ gameId: string; sessionId: string }>;
}) {
  const { gameId, sessionId } = await params;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  const { data: rawSession } = await supabase
    .from("game_sessions")
    .select("*")
    .eq("id", sessionId)
    .eq("game_id", gameId)
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
    .eq("id", gameId)
    .eq("admin_id", user!.id)
    .returns<GameWithRounds[]>()
    .single();

  if (!game) notFound();

  const { data: sessionTeams } = await supabase
    .from("session_teams")
    .select("*, team:teams(*)")
    .eq("session_id", sessionId)
    .returns<SessionTeamWithTeam[]>();

  return (
    <RunPanel
      session={session}
      game={sortGame(game)}
      initialSessionTeams={sessionTeams ?? []}
    />
  );
}
