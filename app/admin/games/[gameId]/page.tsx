import { createClient } from "@/lib/supabase/server";
import { notFound } from "next/navigation";
import GameEditor from "@/components/admin/GameEditor";
import { GameWithRounds } from "@/lib/types";
import { sortGame } from "@/lib/game-utils";

export default async function GameEditorPage({
  params,
}: {
  params: Promise<{ gameId: string }>;
}) {
  const { gameId } = await params;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

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

  return <GameEditor game={sortGame(game)} />;
}
