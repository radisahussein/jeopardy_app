import { createClient } from "@/lib/supabase/server";
import { notFound } from "next/navigation";
import FinalLeaderboard from "@/components/leaderboard/FinalLeaderboard";
import { SessionTeamWithTeam } from "@/lib/types";

export default async function FinalPage({
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
  const session = rawSession as unknown as { id: string; game_id: string; ended_at: string | null } | null;

  if (!session) notFound();

  const { data: game } = await supabase
    .from("games")
    .select("*")
    .eq("id", session.game_id)
    .single();

  if (!game) notFound();

  const { data: sessionTeams } = await supabase
    .from("session_teams")
    .select("*, team:teams(*)")
    .eq("session_id", sessionId)
    .returns<SessionTeamWithTeam[]>();

  const sorted = [...(sessionTeams ?? [])].sort((a, b) => b.score - a.score);

  return <FinalLeaderboard game={game} sessionTeams={sorted} sessionId={sessionId} />;
}
