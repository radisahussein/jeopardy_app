import { createClient } from "@/lib/supabase/server";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Plus, Play, Pencil, BarChart2, Trophy } from "lucide-react";
import { formatDistanceToNow } from "@/lib/date-utils";
import { Game, GameSession } from "@/lib/types";

export default async function DashboardPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  const { data: games } = await supabase
    .from("games")
    .select("*")
    .eq("admin_id", user!.id)
    .order("created_at", { ascending: false }) as { data: Game[] | null };

  const gameIds = (games ?? []).map((g) => g.id);

  const { data: sessions } = gameIds.length > 0
    ? await supabase
        .from("game_sessions")
        .select("id, status, game_id, started_at")
        .in("game_id", gameIds)
        .order("started_at", { ascending: false }) as { data: Pick<GameSession, "id" | "status" | "game_id" | "started_at">[] | null }
    : { data: [] as Pick<GameSession, "id" | "status" | "game_id" | "started_at">[] };

  const totalSessions = sessions?.length ?? 0;
  const completedSessions = sessions?.filter((s) => s.status === "completed").length ?? 0;

  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="font-russo text-3xl text-white uppercase tracking-widest">Dashboard</h1>
          <p className="text-white/40 text-sm mt-1 font-chakra">Manage your Jeopardy games</p>
        </div>
        <Link href="/admin/games/new">
          <Button className="btn-gold h-10 px-5 gap-2 text-sm rounded-lg">
            <Plus className="w-4 h-4" />
            New Game
          </Button>
        </Link>
      </div>

      {/* Stats strip */}
      <div className="grid grid-cols-3 gap-4">
        {[
          { value: games?.length ?? 0, label: "Total Games", icon: "🎮" },
          { value: totalSessions, label: "Sessions Played", icon: "▶" },
          { value: completedSessions, label: "Completed", icon: "🏆" },
        ].map((stat) => (
          <div key={stat.label} className="j-card p-5 relative overflow-hidden">
            <div className="absolute top-0 right-0 text-4xl opacity-10 p-3">{stat.icon}</div>
            <div className="font-russo text-4xl text-[#FFDB58] gold-glow">{stat.value}</div>
            <div className="text-white/50 text-xs mt-1 font-chakra uppercase tracking-wider">{stat.label}</div>
          </div>
        ))}
      </div>

      {/* Games list */}
      <div>
        <div className="flex items-center gap-3 mb-4">
          <h2 className="font-russo text-lg text-white uppercase tracking-widest">Your Games</h2>
          <div className="flex-1 h-px bg-gradient-to-r from-white/10 to-transparent" />
        </div>

        {!games || games.length === 0 ? (
          <div className="j-card p-16 text-center" style={{ borderStyle: "dashed" }}>
            <Trophy className="w-12 h-12 text-[#FFDB58]/30 mx-auto mb-4" />
            <p className="font-russo text-white/40 text-lg uppercase tracking-wider">No games yet</p>
            <p className="text-white/30 text-sm mt-2 font-chakra">Create your first Jeopardy game to get started</p>
            <Link href="/admin/games/new" className="mt-6 inline-block">
              <Button className="btn-gold h-10 px-6 gap-2 text-sm rounded-lg mt-2">
                <Plus className="w-4 h-4" />
                Create Game
              </Button>
            </Link>
          </div>
        ) : (
          <div className="grid gap-3">
            {games.map((game) => {
              const gameSessions = sessions?.filter((s) => s.game_id === game.id) ?? [];
              const activeSession = gameSessions.find((s) => s.status === "active");

              return (
                <div
                  key={game.id}
                  className="j-card px-5 py-4 flex items-center justify-between hover:border-[#FFDB58]/20 transition-all group"
                >
                  <div className="flex items-center gap-4">
                    <div className="w-10 h-10 rounded-xl bg-[#0A0A3E] flex items-center justify-center flex-shrink-0 border border-[#FFDB58]/20 group-hover:border-[#FFDB58]/40 transition-all">
                      <span className="font-russo text-[#FFDB58] text-base">J</span>
                    </div>
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="font-russo text-white tracking-wider uppercase text-sm">{game.title}</span>
                        <StatusBadge status={game.status} />
                      </div>
                      <div className="flex items-center gap-3 mt-0.5">
                        <span className="text-xs text-white/30 font-chakra">
                          {gameSessions.length} session{gameSessions.length !== 1 ? "s" : ""}
                        </span>
                        <span className="text-white/20">·</span>
                        <span className="text-xs text-white/30 font-chakra">
                          {formatDistanceToNow(game.created_at)}
                        </span>
                        {game.wrong_answer_penalty && (
                          <span className="text-[10px] text-[#FFDB58]/40 font-chakra uppercase tracking-wide">penalty on</span>
                        )}
                        {game.final_jeopardy_enabled && (
                          <span className="text-[10px] text-[#FFDB58]/40 font-chakra uppercase tracking-wide">final jeopardy</span>
                        )}
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center gap-1.5">
                    <Link href={`/admin/games/${game.id}`}>
                      <Button variant="ghost" size="sm"
                        className="text-white/40 hover:text-white hover:bg-white/5 gap-1.5 text-xs font-chakra h-8">
                        <Pencil className="w-3.5 h-3.5" />
                        Edit
                      </Button>
                    </Link>

                    {activeSession ? (
                      <Link href={`/admin/games/${game.id}/run/${activeSession.id}`}>
                        <Button size="sm" className="bg-bg-[#228B22]/15 hover:bg-[#228B22]/25 text-[#228B22] border border-[#228B22]/30 gap-1.5 text-xs font-chakra h-8 px-3">
                          <Play className="w-3 h-3 fill-[#228B22]" />
                          Resume
                        </Button>
                      </Link>
                    ) : (
                      <Link href={`/admin/games/${game.id}`}>
                        <Button size="sm" className="btn-gold h-8 px-3 gap-1.5 text-xs rounded-lg">
                          <Play className="w-3 h-3" />
                          Run
                        </Button>
                      </Link>
                    )}

                    {gameSessions.length > 0 && (
                      <Link href={`/admin/games/${game.id}/sessions/${gameSessions[0].id}`}>
                        <Button variant="ghost" size="sm"
                          className="text-white/40 hover:text-white hover:bg-white/5 gap-1.5 text-xs font-chakra h-8">
                          <BarChart2 className="w-3.5 h-3.5" />
                          Stats
                        </Button>
                      </Link>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

function StatusBadge({ status }: { status: string }) {
  if (status === "active") {
    return (
      <span className="text-[9px] font-chakra font-bold uppercase tracking-widest px-2 py-0.5 rounded-full bg-[#228B22]/15 text-[#228B22] border border-[#228B22]/25">
        Active
      </span>
    );
  }
  if (status === "completed") {
    return (
      <span className="text-[9px] font-chakra font-bold uppercase tracking-widest px-2 py-0.5 rounded-full bg-white/5 text-white/30 border border-white/10">
        Done
      </span>
    );
  }
  return (
    <span className="text-[9px] font-chakra font-bold uppercase tracking-widest px-2 py-0.5 rounded-full bg-[#FFDB58]/10 text-[#FFDB58]/60 border border-[#FFDB58]/20">
      Draft
    </span>
  );
}
