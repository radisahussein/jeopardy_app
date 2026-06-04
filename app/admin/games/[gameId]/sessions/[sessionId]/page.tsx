import { createClient } from "@/lib/supabase/server";
import { notFound } from "next/navigation";
import { formatDollars } from "@/lib/game-utils";
import { formatDistanceToNow } from "@/lib/date-utils";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { ArrowLeft, CheckCircle2, XCircle, Trophy } from "lucide-react";
import { SessionTeam, Team, QuestionAttempt, Question } from "@/lib/types";

type SessionTeamWithTeam = SessionTeam & { team: Team };
type AttemptWithQuestion = QuestionAttempt & { question: Question | null };

export default async function SessionStatsPage({
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
    .single();
  const session = rawSession as unknown as { id: string; game_id: string; started_at: string; ended_at: string | null } | null;

  if (!session) notFound();

  const { data: game } = await supabase
    .from("games")
    .select("*, teams(*)")
    .eq("id", gameId)
    .eq("admin_id", user!.id)
    .returns<Array<{ id: string; title: string; teams: Team[] }>>()
    .single();

  if (!game) notFound();

  const { data: sessionTeams } = await supabase
    .from("session_teams")
    .select("*, team:teams(*)")
    .eq("session_id", sessionId)
    .order("score", { ascending: false })
    .returns<SessionTeamWithTeam[]>();

  const { data: attempts } = await supabase
    .from("question_attempts")
    .select("*, question:questions(*)")
    .eq("session_id", sessionId)
    .order("attempted_at", { ascending: true })
    .returns<AttemptWithQuestion[]>();

  const teamStats = (sessionTeams ?? []).map((st) => {
    const teamAttempts = (attempts ?? []).filter((a) => a.answering_team_id === st.team_id);
    const correct = teamAttempts.filter((a) => a.is_correct).length;
    const wrong = teamAttempts.filter((a) => !a.is_correct).length;
    const earned = teamAttempts.filter((a) => a.is_correct).reduce((s, a) => s + a.points_delta, 0);
    const lost = teamAttempts.filter((a) => !a.is_correct).reduce((s, a) => s + Math.abs(a.points_delta), 0);

    const tierMap: Record<number, { correct: number; wrong: number }> = {};
    teamAttempts.forEach((a) => {
      const pts = a.question?.points ?? 0;
      if (!tierMap[pts]) tierMap[pts] = { correct: 0, wrong: 0 };
      if (a.is_correct) tierMap[pts].correct++;
      else tierMap[pts].wrong++;
    });

    return { ...st, correct, wrong, earned, lost, tierMap };
  });

  const winner = teamStats[0];
  const duration = session.ended_at
    ? Math.round((new Date(session.ended_at).getTime() - new Date(session.started_at).getTime()) / 60000)
    : null;

  return (
    <div className="space-y-6 max-w-4xl">
      {/* Header */}
      <div className="flex items-center gap-3">
        <Link href={`/admin/games/${gameId}`}>
          <Button variant="ghost" size="sm"
            className="text-white/40 hover:text-white hover:bg-white/5 gap-1.5 -ml-2 font-chakra">
            <ArrowLeft className="w-4 h-4" />
            Back to Editor
          </Button>
        </Link>
        <div className="h-4 w-px bg-white/15" />
        <div>
          <h1 className="font-russo text-lg text-white uppercase tracking-widest">
            {game.title} — Session Stats
          </h1>
          <p className="text-xs text-white/40 font-chakra mt-0.5">
            Played {formatDistanceToNow(session.started_at)}
            {duration ? ` · ${duration} min` : ""}
          </p>
        </div>
      </div>

      {/* Summary strip */}
      <div className="grid grid-cols-4 gap-3">
        {[
          { value: attempts?.length ?? 0, label: "Questions Answered", color: "text-white" },
          { value: attempts?.filter((a) => a.is_correct).length ?? 0, label: "Correct", color: "text-[#228B22]" },
          { value: attempts?.filter((a) => !a.is_correct).length ?? 0, label: "Wrong", color: "text-[#E0115F]" },
        ].map((s) => (
          <div key={s.label} className="j-card p-4">
            <div className={`font-russo text-2xl ${s.color}`}>{s.value}</div>
            <div className="text-xs text-white/40 font-chakra mt-0.5">{s.label}</div>
          </div>
        ))}
        <div className="j-card p-4">
          {winner && (
            <>
              <div className="flex items-center gap-1.5 mb-0.5">
                <Trophy className="w-3.5 h-3.5 text-[#FFDB58]" />
                <div className="font-russo text-sm text-white truncate uppercase tracking-wider">{winner.team?.name}</div>
              </div>
              <div className="text-xs text-white/40 font-chakra">Winner · {formatDollars(winner.score)}</div>
            </>
          )}
        </div>
      </div>

      {/* Per-team breakdown */}
      <div>
        <div className="flex items-center gap-3 mb-3">
          <h2 className="font-russo text-sm text-white uppercase tracking-widest">Team Performance</h2>
          <div className="flex-1 h-px bg-gradient-to-r from-white/10 to-transparent" />
        </div>
        <div className="space-y-3">
          {teamStats.map((st, i) => (
            <div key={st.id} className="j-card overflow-hidden">
              <div className="flex items-center justify-between px-5 py-3 border-b border-white/8">
                <div className="flex items-center gap-3">
                  <span className="text-sm text-white/30 font-russo w-5">#{i + 1}</span>
                  <div className="w-3 h-3 rounded-full flex-shrink-0" style={{ backgroundColor: st.team?.color }} />
                  <span className="font-russo text-white uppercase tracking-wider text-sm">{st.team?.name}</span>
                </div>
                <span className="font-russo text-xl text-[#FFDB58] gold-glow">{formatDollars(st.score)}</span>
              </div>

              <div className="px-5 py-3 flex items-center gap-6">
                <div className="flex items-center gap-1.5">
                  <CheckCircle2 className="w-4 h-4 text-[#228B22]" />
                  <span className="text-sm text-white/70 font-chakra">{st.correct} correct</span>
                  <span className="text-xs text-[#228B22]/70 font-chakra">(+{formatDollars(st.earned)})</span>
                </div>
                <div className="flex items-center gap-1.5">
                  <XCircle className="w-4 h-4 text-[#E0115F]/70" />
                  <span className="text-sm text-white/70 font-chakra">{st.wrong} wrong</span>
                  {st.lost > 0 && (
                    <span className="text-xs text-[#E0115F]/70 font-chakra">(-{formatDollars(st.lost)})</span>
                  )}
                </div>
              </div>

              {Object.keys(st.tierMap).length > 0 && (
                <div className="px-5 pb-3 flex flex-wrap gap-2">
                  {(Object.entries(st.tierMap) as [string, { correct: number; wrong: number }][])
                    .sort(([a], [b]) => Number(a) - Number(b))
                    .map(([pts, counts]) => (
                      <div key={pts} className="flex items-center gap-1.5 bg-white/5 border border-white/8 rounded-lg px-2.5 py-1 text-xs font-chakra">
                        <span className="font-russo text-[#FFDB58]/80">${pts}</span>
                        <span className="text-[#228B22]">{counts.correct}✓</span>
                        {counts.wrong > 0 && <span className="text-[#E0115F]/70">{counts.wrong}✗</span>}
                      </div>
                    ))}
                </div>
              )}
            </div>
          ))}
        </div>
      </div>

      {/* Question log */}
      {attempts && attempts.length > 0 && (
        <div>
          <div className="flex items-center gap-3 mb-3">
            <h2 className="font-russo text-sm text-white uppercase tracking-widest">Question Log</h2>
            <div className="flex-1 h-px bg-gradient-to-r from-white/10 to-transparent" />
          </div>
          <div className="j-card overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-white/8">
                  <th className="text-left px-4 py-2.5 text-[10px] font-russo text-[#FFDB58]/60 uppercase tracking-widest">Team</th>
                  <th className="text-left px-4 py-2.5 text-[10px] font-russo text-[#FFDB58]/60 uppercase tracking-widest">Question</th>
                  <th className="text-right px-4 py-2.5 text-[10px] font-russo text-[#FFDB58]/60 uppercase tracking-widest">Result</th>
                  <th className="text-right px-4 py-2.5 text-[10px] font-russo text-[#FFDB58]/60 uppercase tracking-widest">Points</th>
                </tr>
              </thead>
              <tbody>
                {attempts.map((attempt) => {
                  const ansTeam = game.teams?.find((t: Team) => t.id === attempt.answering_team_id);
                  return (
                    <tr key={attempt.id} className="border-b border-white/5 last:border-0">
                      <td className="px-4 py-2.5">
                        <div className="flex items-center gap-2">
                          <div className="w-2 h-2 rounded-full flex-shrink-0" style={{ backgroundColor: ansTeam?.color }} />
                          <span className="text-white/70 font-chakra">{ansTeam?.name ?? "Unknown"}</span>
                        </div>
                      </td>
                      <td className="px-4 py-2.5 text-white/40 max-w-xs truncate font-chakra">
                        <span className="font-russo text-[#FFDB58]/70 mr-2">${attempt.question?.points}</span>
                        {attempt.question?.text}
                      </td>
                      <td className="px-4 py-2.5 text-right">
                        {attempt.is_correct ? (
                          <span className="text-[9px] font-russo font-bold uppercase tracking-widest px-2 py-0.5 rounded-full bg-[#228B22]/15 text-[#228B22] border border-[#228B22]/25">
                            Correct
                          </span>
                        ) : (
                          <span className="text-[9px] font-russo font-bold uppercase tracking-widest px-2 py-0.5 rounded-full bg-[#E0115F]/15 text-[#E0115F] border border-[#E0115F]/25">
                            Wrong
                          </span>
                        )}
                      </td>
                      <td className={`px-4 py-2.5 text-right font-russo text-sm ${
                        attempt.points_delta >= 0 ? "text-[#228B22]" : "text-[#E0115F]"
                      }`}>
                        {attempt.points_delta >= 0 ? "+" : ""}{formatDollars(attempt.points_delta)}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
