"use client";

import { useState, useEffect, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { createClient } from "@/lib/supabase/client";
import { GameWithRounds, GameSession, SessionTeam, SessionTeamWithTeam, BoardState } from "@/lib/types";
import { formatDollars, findQuestion } from "@/lib/game-utils";
import { Star } from "lucide-react";
import { useRouter } from "next/navigation";

type Props = {
  session: GameSession;
  game: GameWithRounds;
  initialSessionTeams: SessionTeamWithTeam[];
};

export default function JeopardyBoard({ session: initialSession, game, initialSessionTeams }: Props) {
  const router = useRouter();

  const [session, setSession] = useState(initialSession);
  const [boardState, setBoardState] = useState<BoardState>(initialSession.board_state);
  const [sessionTeams, setSessionTeams] = useState(initialSessionTeams);
  const boardStateRef = useRef(initialSession.board_state); // kept for animation event dedup

  // Incorrect flash state
  const [showIncorrectFlash, setShowIncorrectFlash] = useState(false);
  const prevIncorrectEvent = useRef<string | null>(null);

  // Score drain animation
  const [drainEvent, setDrainEvent] = useState<{
    team_id: string;
    delta: number;
    event_id: string;
    teamName: string;
    teamColor: string;
  } | null>(null);
  const prevDrainEventId = useRef<string | null>(null);

  const currentRound = game.rounds.find((r) => r.id === session.current_round_id) ?? game.rounds[0];
  const activeQuestion = boardState.active_question
    ? findQuestion(game, boardState.active_question.question_id)
    : null;

  // Redirect when game ends
  useEffect(() => {
    if (boardState.screen === "leaderboard") {
      router.push(`/play/${session.id}/final`);
    }
  }, [boardState.screen, router, session.id]);

  // Detect incorrect flash + score drain events from board_state changes
  useEffect(() => {
    const incorrectEvent = boardState.active_question?.last_incorrect_event;
    if (incorrectEvent && incorrectEvent !== prevIncorrectEvent.current) {
      prevIncorrectEvent.current = incorrectEvent;
      setShowIncorrectFlash(true);
      setTimeout(() => setShowIncorrectFlash(false), 2200);
    }

    const ev = boardState.active_question?.score_delta_event;
    if (ev && ev.event_id !== prevDrainEventId.current) {
      prevDrainEventId.current = ev.event_id;
      const team = game.teams.find((t) => t.id === ev.team_id);
      setDrainEvent({
        ...ev,
        teamName: team?.name ?? "",
        teamColor: team?.color ?? "#FFDB58",
      });
      setTimeout(() => setDrainEvent(null), 2000);
    }
  }, [
    boardState.active_question?.last_incorrect_event,
    boardState.active_question?.score_delta_event,
    game.teams,
  ]);

  // Subscribe to Realtime changes for session board_state and team scores
  useEffect(() => {
    const supabase = createClient();

    const channel = supabase
      .channel(`session-${initialSession.id}`)
      .on(
        "postgres_changes",
        {
          event: "UPDATE",
          schema: "public",
          table: "game_sessions",
          filter: `id=eq.${initialSession.id}`,
        },
        (payload) => {
          const updated = payload.new as unknown as GameSession;
          const newBoardState = updated.board_state as BoardState;
          boardStateRef.current = newBoardState;
          setSession(updated);
          setBoardState(newBoardState);
        }
      )
      .on(
        "postgres_changes",
        {
          event: "UPDATE",
          schema: "public",
          table: "session_teams",
          filter: `session_id=eq.${initialSession.id}`,
        },
        (payload) => {
          const updated = payload.new as SessionTeam;
          setSessionTeams((prev) =>
            prev.map((st) => st.id === updated.id ? { ...st, score: updated.score } : st)
          );
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [initialSession.id]);

  const pickerTeam = boardState.active_question?.picking_team_id
    ? game.teams.find((t) => t.id === boardState.active_question?.picking_team_id)
    : null;

  return (
    <div className="h-screen w-screen flex flex-col overflow-hidden" style={{ backgroundColor: "#191970" }}>
      {/* Round header */}
      <div className="text-center py-2">
        <h2 className="text-[#FFDB58] font-black text-lg tracking-widest uppercase">
          {currentRound?.name ?? "Jeopardy"}
        </h2>
      </div>

      {/* Board grid */}
      <div className="flex-1 px-3 pb-2 overflow-hidden">
        {currentRound && (() => {
          const maxRows = Math.max(...currentRound.categories.map((c) => c.questions.length), 1);
          return (
            <div
              className="h-full grid gap-2"
              style={{
                gridTemplateColumns: `repeat(${currentRound.categories.length}, minmax(0, 1fr))`,
                gridTemplateRows: `auto repeat(${maxRows}, minmax(0, 1fr))`,
              }}
            >
              {/* Category headers */}
              {currentRound.categories.map((cat) => (
                <div
                  key={cat.id}
                  className="flex items-center justify-center rounded-lg px-2 py-2"
                  style={{ backgroundColor: "#0A0A3E" }}
                >
                  <span className="text-white font-black text-center uppercase tracking-wide leading-tight text-sm">
                    {cat.name}
                  </span>
                </div>
              ))}

              {/* Question tiles — row by row so points align horizontally */}
              {Array.from({ length: maxRows }, (_, rowIdx) =>
                currentRound.categories.map((cat) => {
                  const q = cat.questions[rowIdx];

                  if (!q) {
                    return (
                      <div
                        key={`empty-${cat.id}-${rowIdx}`}
                        className="rounded-lg"
                        style={{ backgroundColor: "#0a1040" }}
                      />
                    );
                  }

                  const revealed = boardState.revealed_questions.includes(q.id);
                  const isActive = boardState.active_question?.question_id === q.id;

                  return (
                    <motion.div
                      key={q.id}
                      className={`flex items-center justify-center rounded-lg cursor-default transition-all relative ${
                        revealed ? "opacity-20" : "tile-glow"
                      } ${isActive ? "ring-2 ring-[#FFDB58]" : ""}`}
                      style={{ backgroundColor: revealed ? "#0a1040" : "#0A0A3E" }}
                      whileHover={!revealed ? { scale: 1.02 } : {}}
                    >
                      {!revealed && (
                        <span className="text-[#FFDB58] font-black text-xl sm:text-2xl md:text-3xl">
                          ${q.points}
                        </span>
                      )}
                    </motion.div>
                  );
                })
              )}
            </div>
          );
        })()}

        {/* Final Jeopardy screen */}
        <AnimatePresence>
          {(boardState.screen === "final_wager" || boardState.screen === "final_question" || boardState.screen === "final_reveal") && (
            <motion.div
              key={boardState.screen}
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="absolute inset-0 flex items-center justify-center px-8"
              style={{ backgroundColor: "#191970" }}
            >
              <div className="text-center max-w-3xl w-full">
                <Star className="w-14 h-14 text-[#FFDB58] fill-[#FFDB58] mx-auto mb-4" />
                <h1 className="text-4xl font-black text-white tracking-widest uppercase mb-1">Final</h1>
                <h1 className="text-4xl font-black text-[#FFDB58] tracking-widest uppercase mb-6">Jeopardy</h1>

                {boardState.screen === "final_wager" && (
                  <>
                    {game.final_jeopardy_question?.category && (
                      <motion.div
                        initial={{ opacity: 0, y: 10 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ delay: 0.3 }}
                        className="text-3xl sm:text-4xl md:text-5xl font-black text-white uppercase tracking-widest mb-4"
                      >
                        {game.final_jeopardy_question.category}
                      </motion.div>
                    )}
                    <p className="text-white/50 text-lg font-chakra">Place your wagers...</p>
                  </>
                )}

                {(boardState.screen === "final_question" || boardState.screen === "final_reveal") && game.final_jeopardy_question && (
                  <motion.div
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.2 }}
                    className="space-y-4"
                  >
                    <div className="text-sm font-russo text-[#FFDB58]/60 uppercase tracking-widest">
                      {game.final_jeopardy_question.category}
                    </div>
                    <p className="text-white font-black text-2xl sm:text-3xl md:text-4xl leading-tight">
                      {game.final_jeopardy_question.text}
                    </p>
                    {boardState.screen === "final_reveal" && (
                      <motion.div
                        initial={{ opacity: 0, y: 10 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ delay: 0.4 }}
                        className="mt-4 px-4 py-3 rounded-xl border border-[#FFDB58]/30 bg-[#FFDB58]/8"
                      >
                        <div className="text-[10px] font-russo text-[#FFDB58]/50 uppercase tracking-widest mb-1">Answer</div>
                        <p className="text-[#FFDB58] font-black text-xl sm:text-2xl">{game.final_jeopardy_question.answer}</p>
                      </motion.div>
                    )}
                  </motion.div>
                )}
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* Active question overlay */}
      <AnimatePresence>
        {activeQuestion && boardState.screen !== "board" && (
          <motion.div
            initial={{ opacity: 0, y: "100%" }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: "100%" }}
            transition={{ type: "spring", damping: 25, stiffness: 300 }}
            className="absolute inset-0 flex flex-col items-center justify-center px-8"
            style={{
              backgroundColor: activeQuestion.is_double ? "#1a1000" : "#191970",
              borderTop: `4px solid ${activeQuestion.is_double ? "#FFDB58" : "#0A0A3E"}`,
            }}
          >
            {activeQuestion.is_double && (boardState.active_question?.phase === "wagering" || boardState.screen === "double_wager") && (
              <motion.div
                className="text-center mb-8"
                initial={{ scale: 0 }}
                animate={{ scale: 1 }}
                transition={{ type: "spring", damping: 15 }}
              >
                <Star className="w-12 h-12 text-[#FFDB58] fill-[#FFDB58] mx-auto mb-2" />
                <div className="text-4xl font-black text-[#FFDB58] tracking-widest uppercase">
                  Double Points!
                </div>
                {pickerTeam && (
                  <div className="mt-3 text-lg text-white/70">
                    <span style={{ color: pickerTeam.color }}>{pickerTeam.name}</span> is wagering...
                  </div>
                )}
              </motion.div>
            )}

            {boardState.active_question?.phase === "resolved" ? (
              /* Answer reveal overlay */
              <motion.div
                key="resolved"
                initial={{ opacity: 0, scale: 0.92 }}
                animate={{ opacity: 1, scale: 1 }}
                transition={{ type: "spring", damping: 20, stiffness: 300 }}
                className="max-w-3xl text-center w-full"
              >
                <motion.div
                  initial={{ y: -20, opacity: 0 }}
                  animate={{ y: 0, opacity: 1 }}
                  transition={{ delay: 0.1 }}
                  className={`text-5xl sm:text-6xl md:text-7xl font-black tracking-widest uppercase mb-6 ${
                    boardState.active_question.resolved_correct ? "text-[#228B22]" : "text-[#E0115F]"
                  }`}
                  style={{
                    textShadow: boardState.active_question.resolved_correct
                      ? "0 0 40px rgba(34,139,34,0.6)"
                      : "0 0 40px rgba(224,17,95,0.6)",
                  }}
                >
                  {boardState.active_question.resolved_correct ? "CORRECT!" : "INCORRECT!"}
                </motion.div>

                <motion.div
                  initial={{ y: 20, opacity: 0 }}
                  animate={{ y: 0, opacity: 1 }}
                  transition={{ delay: 0.25 }}
                  className="text-white/50 text-sm font-russo uppercase tracking-widest mb-3"
                >
                  The answer was
                </motion.div>

                <motion.div
                  initial={{ y: 20, opacity: 0 }}
                  animate={{ y: 0, opacity: 1 }}
                  transition={{ delay: 0.35 }}
                  className="text-white font-black text-2xl sm:text-3xl md:text-4xl leading-tight px-4 py-4 rounded-2xl border"
                  style={{
                    background: boardState.active_question.resolved_correct
                      ? "rgba(34,139,34,0.12)"
                      : "rgba(224,17,95,0.12)",
                    borderColor: boardState.active_question.resolved_correct
                      ? "rgba(34,139,34,0.4)"
                      : "rgba(224,17,95,0.4)",
                  }}
                >
                  {activeQuestion.answer || "—"}
                </motion.div>
              </motion.div>
            ) : boardState.active_question?.phase === "skipped" ? (
              /* Skipped — show answer, no verdict */
              <motion.div
                key="skipped"
                initial={{ opacity: 0, scale: 0.92 }}
                animate={{ opacity: 1, scale: 1 }}
                transition={{ type: "spring", damping: 20, stiffness: 300 }}
                className="max-w-3xl text-center w-full"
              >
                <motion.div
                  initial={{ y: -20, opacity: 0 }}
                  animate={{ y: 0, opacity: 1 }}
                  transition={{ delay: 0.1 }}
                  className="text-3xl sm:text-4xl font-black tracking-widest uppercase mb-6 text-[#808080]"
                  style={{ textShadow: "0 0 30px rgba(128,128,128,0.4)" }}
                >
                  No Answer
                </motion.div>

                <motion.div
                  initial={{ y: 20, opacity: 0 }}
                  animate={{ y: 0, opacity: 1 }}
                  transition={{ delay: 0.25 }}
                  className="text-white/50 text-sm font-russo uppercase tracking-widest mb-3"
                >
                  The answer was
                </motion.div>

                <motion.div
                  initial={{ y: 20, opacity: 0 }}
                  animate={{ y: 0, opacity: 1 }}
                  transition={{ delay: 0.35 }}
                  className="text-white font-black text-2xl sm:text-3xl md:text-4xl leading-tight px-4 py-4 rounded-2xl border border-white/15"
                  style={{ background: "rgba(255,255,255,0.05)" }}
                >
                  {activeQuestion.answer || "—"}
                </motion.div>
              </motion.div>
            ) : (boardState.screen === "question" || boardState.active_question?.phase === "judging" || boardState.active_question?.phase === "showing") && (
              <div className="max-w-3xl text-center">
                {activeQuestion.is_double && (
                  <div className="flex items-center justify-center gap-2 mb-4">
                    <Star className="w-5 h-5 text-[#FFDB58] fill-[#FFDB58]" />
                    <span className="text-[#FFDB58] font-bold text-lg">Double Points</span>
                    {boardState.active_question?.wager_amount && (
                      <span className="text-white/60 text-lg">
                        — Wager: {formatDollars(boardState.active_question.wager_amount)}
                      </span>
                    )}
                  </div>
                )}

                <div className="text-[#FFDB58] font-bold text-xl mb-4">
                  ${activeQuestion.points}
                </div>

                {activeQuestion.image_url && (
                  <motion.div
                    initial={{ opacity: 0, scale: 0.95 }}
                    animate={{ opacity: 1, scale: 1 }}
                    transition={{ delay: 0.1 }}
                    className="mb-6 flex justify-center"
                  >
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={activeQuestion.image_url}
                      alt="Question image"
                      className="max-h-64 sm:max-h-80 max-w-full rounded-xl object-contain shadow-2xl"
                    />
                  </motion.div>
                )}

                <motion.h2
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.2 }}
                  className="text-white font-black text-3xl sm:text-4xl md:text-5xl leading-tight"
                >
                  {activeQuestion.text || "Question text not set"}
                </motion.h2>

                {pickerTeam && (
                  <motion.div
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    transition={{ delay: 0.4 }}
                    className="mt-6 text-white/50 text-base"
                  >
                    Selected by{" "}
                    <span className="font-bold" style={{ color: pickerTeam.color }}>
                      {pickerTeam.name}
                    </span>
                  </motion.div>
                )}
              </div>
            )}

            {/* Incorrect flash overlay — shown on top of question */}
            <AnimatePresence>
              {showIncorrectFlash && (
                <motion.div
                  key="incorrect-flash"
                  className="absolute inset-0 flex items-center justify-center pointer-events-none"
                  style={{ backgroundColor: "rgba(224,17,95,0.18)" }}
                  initial={{ opacity: 0 }}
                  animate={{ opacity: [0, 1, 1, 0] }}
                  transition={{ duration: 2.0, times: [0, 0.08, 0.65, 1] }}
                >
                  <motion.div
                    className="font-russo font-black uppercase tracking-widest text-center select-none"
                    style={{
                      fontSize: "clamp(52px, 13vw, 100px)",
                      color: "#E0115F",
                      textShadow:
                        "0 0 60px rgba(224,17,95,0.9), 0 0 120px rgba(224,17,95,0.5)",
                    }}
                    initial={{ scale: 0.55, opacity: 0 }}
                    animate={{
                      scale: [0.55, 1.12, 1, 1, 0.95],
                      opacity: [0, 1, 1, 1, 0],
                    }}
                    transition={{ duration: 2.0, times: [0, 0.08, 0.18, 0.65, 1] }}
                  >
                    INCORRECT!
                  </motion.div>
                </motion.div>
              )}
            </AnimatePresence>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Score drain animation — fixed overlay, animates toward score bar */}
      <div
        className="fixed pointer-events-none z-50"
        style={{ left: "50%", top: "42%", transform: "translateX(-50%)" }}
      >
        <AnimatePresence>
          {drainEvent && (
            <motion.div
              key={drainEvent.event_id}
              className="flex flex-col items-center gap-1"
              initial={{ opacity: 1, scale: 1.2, y: 0 }}
              animate={{ opacity: 0, scale: 0.5, y: 420 }}
              transition={{ duration: 1.6, ease: [0.25, 0.46, 0.45, 0.94] }}
            >
              <span
                className="font-russo font-black text-3xl drop-shadow-lg"
                style={{ color: drainEvent.delta < 0 ? "#E0115F" : "#228B22" }}
              >
                {drainEvent.delta > 0 ? "+" : ""}{formatDollars(drainEvent.delta)}
              </span>
              <span
                className="font-chakra text-sm font-bold opacity-80"
                style={{ color: drainEvent.teamColor }}
              >
                {drainEvent.teamName}
              </span>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* Score bar */}
      <div
        className="flex items-center justify-center gap-2 px-4 py-3 border-t"
        style={{ backgroundColor: "#0A0A3E", borderColor: "#1A1A6E" }}
      >
        {[...sessionTeams]
          .sort((a, b) => b.score - a.score)
          .map((st, idx) => (
            <ScoreCard key={st.id} sessionTeam={st} rank={idx + 1} />
          ))}
      </div>
    </div>
  );
}

function ScoreCard({ sessionTeam, rank }: { sessionTeam: SessionTeamWithTeam; rank: number }) {
  const [prevScore, setPrevScore] = useState(sessionTeam.score);
  const [flash, setFlash] = useState<"up" | "down" | null>(null);
  const isFirst = rank === 1;

  useEffect(() => {
    if (sessionTeam.score !== prevScore) {
      setFlash(sessionTeam.score > prevScore ? "up" : "down");
      setPrevScore(sessionTeam.score);
      setTimeout(() => setFlash(null), 700);
    }
  }, [sessionTeam.score, prevScore]);

  const teamColor = sessionTeam.team?.color ?? "#ffffff";

  return (
    <div
      className={`relative flex flex-col items-center gap-0.5 px-4 rounded-xl flex-shrink-0 transition-all duration-300 ${
        isFirst ? "py-3" : "py-2"
      } ${
        flash === "up"
          ? "bg-green-900/40"
          : flash === "down"
          ? "bg-red-900/40"
          : isFirst
          ? "bg-white/5"
          : "bg-white/[0.03]"
      }`}
      style={{
        borderBottom: `3px solid ${teamColor}`,
        minWidth: isFirst ? 120 : 100,
        boxShadow: isFirst ? `0 0 18px ${teamColor}33` : undefined,
      }}
    >
      {isFirst && (
        <span className="absolute -top-2.5 left-1/2 -translate-x-1/2 text-[10px] font-bold text-[#FFDB58] tracking-widest">
          ★ LEAD
        </span>
      )}
      <span
        className={`font-black tracking-wide ${isFirst ? "text-xl" : "text-base"}`}
        style={{ color: teamColor }}
      >
        {sessionTeam.team?.name}
      </span>
      <span
        className={`font-black tabular-nums ${isFirst ? "text-2xl text-[#FFDB58]" : "text-lg text-[#FFDB58]/80"}`}
      >
        {formatDollars(sessionTeam.score)}
      </span>
      {!isFirst && (
        <span className="text-white/30 text-[10px] font-semibold">#{rank}</span>
      )}
    </div>
  );
}

