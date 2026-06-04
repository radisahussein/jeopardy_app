"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { GameWithRounds, GameSession, SessionTeamWithTeam, Question, BoardState, Json } from "@/lib/types";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";
import { formatDollars, calcPointsDelta, getMaxWager, findQuestion } from "@/lib/game-utils";
import {
  ExternalLink, CheckCircle2, XCircle, ChevronRight,
  ChevronLeft, Square, Trophy, Star, Flag, MinusCircle,
} from "lucide-react";

type Props = {
  session: GameSession;
  game: GameWithRounds;
  initialSessionTeams: SessionTeamWithTeam[];
};

export default function RunPanel({ session: initialSession, game, initialSessionTeams }: Props) {
  const router = useRouter();
  const supabase = createClient();

  const [session, setSession] = useState(initialSession);
  const [sessionTeams, setSessionTeams] = useState(initialSessionTeams);
  const [boardState, setBoardState] = useState<BoardState>(initialSession.board_state as BoardState);
  const [wagerInput, setWagerInput] = useState<number>(0);
  const [selectedPickerTeamId, setSelectedPickerTeamId] = useState<string | null>(null);
  const [currentGuesserTeamId, setCurrentGuesserTeamId] = useState<string | null>(null);
  const [finalWagers, setFinalWagers] = useState<Record<string, number>>({});
  const [endingGame, setEndingGame] = useState(false);

  // Hydrate finalWagers from DB when entering/resuming final jeopardy
  useEffect(() => {
    if (session.status !== "final_jeopardy") return;
    supabase
      .from("final_jeopardy_submissions")
      .select("team_id, wager_amount")
      .eq("session_id", session.id)
      .then(({ data }) => {
        if (data && data.length > 0) {
          setFinalWagers(Object.fromEntries(data.map((d) => [d.team_id, d.wager_amount])));
        }
      });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session.status, session.id]);

  const currentRound = game.rounds.find((r) => r.id === session.current_round_id) ?? game.rounds[0];
  const currentRoundIdx = game.rounds.findIndex((r) => r.id === currentRound?.id);

  const activeQuestion = boardState.active_question
    ? findQuestion(game, boardState.active_question.question_id)
    : null;

  const boardUrl = `${typeof window !== "undefined" ? window.location.origin : ""}/play/${session.id}`;

  async function updateBoardState(newState: Partial<BoardState>) {
    const merged = { ...boardState, ...newState } as BoardState;
    const { error } = await supabase
      .from("game_sessions")
      .update({ board_state: merged as unknown as Json })
      .eq("id", session.id);

    if (error) { toast.error("Failed to update board"); return; }
    setBoardState(merged);
  }

  function selectQuestion(questionId: string) {
    const q = findQuestion(game, questionId);
    if (!q) return;

    if (boardState.revealed_questions.includes(questionId)) {
      toast.error("Question already revealed");
      return;
    }

    setSelectedPickerTeamId(null);
    setCurrentGuesserTeamId(null);
    setWagerInput(0);

    updateBoardState({
      screen: q.is_double ? "double_wager" : "question",
      active_question: {
        question_id: questionId,
        phase: q.is_double ? "wagering" : "showing",
        picking_team_id: null,
        answering_team_id: null,
        wager_amount: null,
        attempts: [],
        last_incorrect_event: null,
        last_incorrect_team_id: null,
        score_delta_event: null,
      },
    });
  }

  async function confirmWager() {
    if (!activeQuestion || !selectedPickerTeamId) return;
    const maxWager = getMaxWager(
      activeQuestion,
      sessionTeams.find((st) => st.team_id === selectedPickerTeamId)?.score ?? 0
    );
    const finalWager = Math.min(Math.max(wagerInput, 5), maxWager);

    await updateBoardState({
      screen: "question",
      active_question: {
        ...boardState.active_question!,
        phase: "judging",
        picking_team_id: selectedPickerTeamId,
        answering_team_id: selectedPickerTeamId,
        wager_amount: finalWager,
      },
    });
  }

  // For double questions: single attempt with wager
  async function judgeDoubleAnswer(isCorrect: boolean) {
    if (!activeQuestion || !boardState.active_question) return;
    const pickerId = selectedPickerTeamId ?? boardState.active_question.picking_team_id;
    if (!pickerId) { toast.error("Select who picked first"); return; }

    const wagerAmount = boardState.active_question.wager_amount;
    const delta = calcPointsDelta(activeQuestion, isCorrect, wagerAmount, game.wrong_answer_penalty);
    const currentScore = sessionTeams.find((st) => st.team_id === pickerId)?.score ?? 0;
    const newScore = currentScore + delta;

    const { error } = await supabase.rpc("update_score_and_log_attempt", {
      p_session_id: session.id,
      p_question_id: activeQuestion.id,
      p_picking_team_id: pickerId,
      p_answering_team_id: pickerId,
      p_is_correct: isCorrect,
      p_points_delta: delta,
      p_wager_amount: wagerAmount,
    });
    if (error) { toast.error("Failed to record answer"); return; }

    setSessionTeams((prev) =>
      prev.map((st) => st.team_id === pickerId ? { ...st, score: newScore } : st)
    );

    const eventId = Date.now().toString();
    const newRevealed = [...boardState.revealed_questions, activeQuestion.id];

    await updateBoardState({
      screen: "question",
      revealed_questions: newRevealed,
      active_question: {
        ...boardState.active_question,
        phase: "resolved",
        resolved_correct: isCorrect,
        answering_team_id: pickerId,
        score_delta_event: { team_id: pickerId, delta, event_id: eventId },
        attempts: [{ team_id: pickerId, correct: isCorrect }],
      },
    });

    setSelectedPickerTeamId(null);
    setWagerInput(0);
    toast.success(isCorrect
      ? `+${formatDollars(delta)} for ${game.teams.find((t) => t.id === pickerId)?.name}`
      : `${formatDollars(delta)} for ${game.teams.find((t) => t.id === pickerId)?.name}`
    );
  }

  // For regular questions: mark wrong, stay on question for more guesses
  async function judgeIncorrect(answerTeamId: string) {
    if (!activeQuestion || !boardState.active_question) return;

    const delta = game.wrong_answer_penalty ? -activeQuestion.points : 0;
    const currentScore = sessionTeams.find((st) => st.team_id === answerTeamId)?.score ?? 0;
    const newScore = currentScore + delta;

    const { error } = await supabase.rpc("update_score_and_log_attempt", {
      p_session_id: session.id,
      p_question_id: activeQuestion.id,
      p_picking_team_id: answerTeamId,
      p_answering_team_id: answerTeamId,
      p_is_correct: false,
      p_points_delta: delta,
      p_wager_amount: null,
    });
    if (error) { toast.error("Failed to record answer"); return; }

    if (delta !== 0) {
      setSessionTeams((prev) =>
        prev.map((st) => st.team_id === answerTeamId ? { ...st, score: newScore } : st)
      );
    }

    const flashEventId = Date.now().toString();
    const newAttempts = [
      ...(boardState.active_question.attempts ?? []),
      { team_id: answerTeamId, correct: false },
    ];

    await updateBoardState({
      active_question: {
        ...boardState.active_question,
        phase: "showing",
        attempts: newAttempts,
        last_incorrect_event: flashEventId,
        last_incorrect_team_id: answerTeamId,
        score_delta_event: delta !== 0
          ? { team_id: answerTeamId, delta, event_id: flashEventId }
          : null,
      },
    });

    setCurrentGuesserTeamId(null);
    const teamName = game.teams.find((t) => t.id === answerTeamId)?.name ?? "Team";
    toast.error(delta !== 0
      ? `${teamName} wrong — ${formatDollars(Math.abs(delta))} deducted`
      : `${teamName} wrong`
    );
  }

  // For regular questions: mark correct, resolve
  async function judgeCorrect(answerTeamId: string) {
    if (!activeQuestion || !boardState.active_question) return;

    const delta = activeQuestion.points;
    const currentScore = sessionTeams.find((st) => st.team_id === answerTeamId)?.score ?? 0;
    const newScore = currentScore + delta;

    const { error } = await supabase.rpc("update_score_and_log_attempt", {
      p_session_id: session.id,
      p_question_id: activeQuestion.id,
      p_picking_team_id: answerTeamId,
      p_answering_team_id: answerTeamId,
      p_is_correct: true,
      p_points_delta: delta,
      p_wager_amount: null,
    });
    if (error) { toast.error("Failed to record answer"); return; }

    setSessionTeams((prev) =>
      prev.map((st) => st.team_id === answerTeamId ? { ...st, score: newScore } : st)
    );

    const eventId = Date.now().toString();
    const newAttempts = [
      ...(boardState.active_question.attempts ?? []),
      { team_id: answerTeamId, correct: true },
    ];
    const newRevealed = [...boardState.revealed_questions, activeQuestion.id];

    await updateBoardState({
      screen: "question",
      revealed_questions: newRevealed,
      active_question: {
        ...boardState.active_question,
        phase: "resolved",
        resolved_correct: true,
        answering_team_id: answerTeamId,
        attempts: newAttempts,
        score_delta_event: { team_id: answerTeamId, delta, event_id: eventId },
      },
    });

    setCurrentGuesserTeamId(null);
    toast.success(`+${formatDollars(delta)} for ${game.teams.find((t) => t.id === answerTeamId)?.name}`);
  }

  // Skip — no one answered, show answer without verdict
  async function skipQuestion() {
    if (!activeQuestion || !boardState.active_question) return;
    const newRevealed = [...boardState.revealed_questions, activeQuestion.id];
    await updateBoardState({
      screen: "question",
      revealed_questions: newRevealed,
      active_question: {
        ...boardState.active_question,
        phase: "skipped",
      },
    });
    setCurrentGuesserTeamId(null);
  }

  async function dismissResult() {
    await updateBoardState({
      screen: "board",
      active_question: null,
    });
  }

  async function cancelQuestion() {
    await updateBoardState({ screen: "board", active_question: null });
    setSelectedPickerTeamId(null);
    setCurrentGuesserTeamId(null);
    setWagerInput(0);
  }

  async function changeRound(direction: "next" | "prev") {
    const newIdx = direction === "next" ? currentRoundIdx + 1 : currentRoundIdx - 1;
    if (newIdx < 0 || newIdx >= game.rounds.length) return;

    const newRound = game.rounds[newIdx];
    await supabase.from("game_sessions").update({ current_round_id: newRound.id }).eq("id", session.id);
    setSession((s) => ({ ...s, current_round_id: newRound.id }));
    await updateBoardState({ screen: "board", active_question: null });
    toast.success(`Switched to ${newRound.name}`);
  }

  async function startFinalJeopardy() {
    await supabase.from("game_sessions").update({ status: "final_jeopardy" }).eq("id", session.id);
    await updateBoardState({ screen: "final_wager", active_question: null });
    setSession((s) => ({ ...s, status: "final_jeopardy" }));
  }

  async function submitFinalJeopardy() {
    for (const [teamId, wager] of Object.entries(finalWagers)) {
      await supabase.from("final_jeopardy_submissions").upsert({
        session_id: session.id,
        team_id: teamId,
        wager_amount: wager,
      });
    }
    await updateBoardState({ screen: "final_question" });
    toast.success("Wagers submitted. Show the question!");
  }

  async function judgeFinalJeopardy(teamId: string, isCorrect: boolean) {
    const wager = finalWagers[teamId] ?? 0;
    const delta = isCorrect ? wager : -wager;
    const currentScore = sessionTeams.find((st) => st.team_id === teamId)?.score ?? 0;
    const newScore = currentScore + delta;

    await supabase.from("final_jeopardy_submissions").upsert({
      session_id: session.id,
      team_id: teamId,
      wager_amount: wager,
      is_correct: isCorrect,
    });

    await supabase
      .from("session_teams")
      .update({ score: newScore })
      .eq("session_id", session.id)
      .eq("team_id", teamId);

    setSessionTeams((prev) =>
      prev.map((st) => st.team_id === teamId ? { ...st, score: newScore } : st)
    );

    toast.success(isCorrect ? `Correct! +$${wager}` : `Wrong! -$${wager}`);
  }

  async function endGame() {
    setEndingGame(true);
    try {
      await supabase
        .from("game_sessions")
        .update({ status: "completed", ended_at: new Date().toISOString() })
        .eq("id", session.id);

      await updateBoardState({ screen: "leaderboard" });
      toast.success("Game ended! Leaderboard is shown.");
    } catch {
      toast.error("Failed to end game");
    } finally {
      setEndingGame(false);
    }
  }

  const sortedSessionTeams = [...sessionTeams].sort((a, b) => b.score - a.score);

  return (
    <div className="max-w-2xl mx-auto pb-8">
      {/* Header */}
      <div className="flex items-center justify-between mb-5">
        <div>
          <h1 className="font-russo text-lg text-white uppercase tracking-widest">{game.title}</h1>
          <p className="text-xs text-white/40 font-chakra mt-0.5">{currentRound?.name ?? "No round"}</p>
        </div>
        <a href={boardUrl} target="_blank" rel="noopener noreferrer">
          <Button variant="ghost" size="sm" className="gap-1.5 text-xs font-chakra text-white/40 hover:text-[#FFDB58] hover:bg-[#FFDB58]/5 border border-white/10 hover:border-[#FFDB58]/20">
            <ExternalLink className="w-3.5 h-3.5" />
            Board
          </Button>
        </a>
      </div>

      {/* Score cards */}
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5 mb-5">
        {sortedSessionTeams.map((st, i) => (
          <div key={st.id} className="j-card p-3.5 relative overflow-hidden hover:border-[#FFDB58]/20 transition-all">
            <div className="absolute top-0 left-0 w-[3px] h-full rounded-r" style={{ backgroundColor: st.team?.color }} />
            <div className="pl-2.5">
              {i === 0 && <Trophy className="w-3 h-3 text-[#FFDB58] mb-1.5" />}
              <div className="font-russo text-xl text-[#FFDB58]">{formatDollars(st.score)}</div>
              <div className="text-[10px] text-white/40 truncate font-chakra uppercase tracking-wider mt-0.5">{st.team?.name}</div>
            </div>
          </div>
        ))}
      </div>

      {/* Main control area */}
      {session.status === "completed" ? (
        <div className="j-card p-6 text-center border-[#228B22]/20">
          <Trophy className="w-8 h-8 text-[#228B22] mx-auto mb-2" />
          <p className="font-russo text-[#228B22] uppercase tracking-widest text-base">Game Complete!</p>
          <p className="text-sm text-white/40 font-chakra mt-1">Leaderboard shown on board.</p>
          <a href={`/play/${session.id}/final`} target="_blank" rel="noopener noreferrer">
            <Button className="mt-4 bg-[#228B22]/20 hover:bg-[#228B22]/30 text-[#228B22] border border-[#228B22]/30 gap-2 font-chakra" size="sm">
              <ExternalLink className="w-3.5 h-3.5" />
              View Leaderboard
            </Button>
          </a>
        </div>
      ) : session.status === "final_jeopardy" ? (
        <FinalJeopardyPanel
          game={game}
          sessionTeams={sessionTeams}
          boardState={boardState}
          finalWagers={finalWagers}
          setFinalWagers={setFinalWagers}
          onSubmitWagers={submitFinalJeopardy}
          onJudge={judgeFinalJeopardy}
          onReveal={() => updateBoardState({ screen: "final_reveal" })}
          onEnd={endGame}
          finalQuestion={game.final_jeopardy_question ?? null}
        />
      ) : boardState.active_question ? (
        <ActiveQuestionPanel
          game={game}
          question={activeQuestion}
          boardState={boardState}
          sessionTeams={sessionTeams}
          selectedPickerTeamId={selectedPickerTeamId}
          setSelectedPickerTeamId={setSelectedPickerTeamId}
          currentGuesserTeamId={currentGuesserTeamId}
          setCurrentGuesserTeamId={setCurrentGuesserTeamId}
          wagerInput={wagerInput}
          setWagerInput={setWagerInput}
          onConfirmWager={confirmWager}
          onJudgeDouble={judgeDoubleAnswer}
          onJudgeCorrect={judgeCorrect}
          onJudgeIncorrect={judgeIncorrect}
          onSkip={skipQuestion}
          onCancel={cancelQuestion}
          onDismissResult={dismissResult}
        />
      ) : (
        <IdlePanel
          game={game}
          currentRound={currentRound}
          boardState={boardState}
          roundIdx={currentRoundIdx}
          onSelectQuestion={selectQuestion}
          onNextRound={() => changeRound("next")}
          onPrevRound={() => changeRound("prev")}
          onStartFinal={game.final_jeopardy_enabled ? startFinalJeopardy : undefined}
          onEndGame={endGame}
          endingGame={endingGame}
        />
      )}
    </div>
  );
}

// ── Panels ───────────────────────────────────────────────────

function IdlePanel({
  game, currentRound, boardState, roundIdx,
  onSelectQuestion, onNextRound, onPrevRound, onStartFinal, onEndGame, endingGame,
}: {
  game: GameWithRounds;
  currentRound: typeof game.rounds[0] | undefined;
  boardState: BoardState;
  roundIdx: number;
  onSelectQuestion: (id: string) => void;
  onNextRound: () => void;
  onPrevRound: () => void;
  onStartFinal?: () => void;
  onEndGame: () => void;
  endingGame: boolean;
}) {
  return (
    <div className="space-y-3">
      <div className="j-card p-4 text-center">
        <p className="text-xs text-white/40 font-chakra">Tap a question tile below to activate it on the board.</p>
      </div>

      {currentRound && (
        <div className="j-card p-4 space-y-3">
          <h3 className="text-[10px] font-russo text-[#FFDB58]/60 uppercase tracking-widest">{currentRound.name}</h3>
          <div className="grid gap-3" style={{ gridTemplateColumns: `repeat(${Math.min(currentRound.categories.length, 3)}, minmax(0, 1fr))` }}>
            {currentRound.categories.map((cat) => (
              <div key={cat.id}>
                <div className="text-[9px] font-russo text-white/40 uppercase tracking-wider text-center mb-1.5 truncate">{cat.name}</div>
                <div className="space-y-1">
                  {cat.questions.map((q) => {
                    const revealed = boardState.revealed_questions.includes(q.id);
                    return (
                      <button key={q.id} disabled={revealed} onClick={() => onSelectQuestion(q.id)}
                        className={`w-full py-2 rounded-lg text-xs font-russo transition-all ${
                          revealed
                            ? "bg-white/3 text-white/15 cursor-not-allowed line-through"
                            : "bg-[#0A0A3E] text-[#FFDB58] hover:bg-[#1E2FA0] hover:shadow-[0_0_10px_rgba(255,219,88,0.2)]"
                        }`}
                      >
                        {q.is_double && <Star className="w-2.5 h-2.5 inline mr-0.5 fill-current" />}
                        ${q.points}
                      </button>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="j-card p-3 flex items-center justify-between gap-2">
        <Button variant="ghost" size="sm" onClick={onPrevRound} disabled={roundIdx <= 0}
          className="gap-1 text-xs font-chakra text-white/40 hover:text-white hover:bg-white/5 disabled:opacity-20">
          <ChevronLeft className="w-3.5 h-3.5" />
          Prev
        </Button>

        <div className="flex items-center gap-2">
          {onStartFinal && (
            <Button variant="ghost" size="sm" onClick={onStartFinal}
              className="gap-1 text-xs font-russo text-[#FFDB58]/60 hover:text-[#FFDB58] hover:bg-[#FFDB58]/10 border border-[#FFDB58]/20 uppercase tracking-wider">
              <Star className="w-3 h-3 fill-current" />
              Final
            </Button>
          )}
          <Button variant="ghost" size="sm" onClick={onEndGame} disabled={endingGame}
            className="gap-1 text-xs font-chakra text-red-400/60 hover:text-red-400 hover:bg-red-500/10 border border-red-500/20 disabled:opacity-20">
            <Flag className="w-3.5 h-3.5" />
            End
          </Button>
        </div>

        <Button variant="ghost" size="sm" onClick={onNextRound} disabled={roundIdx >= game.rounds.length - 1}
          className="gap-1 text-xs font-chakra text-white/40 hover:text-white hover:bg-white/5 disabled:opacity-20">
          Next
          <ChevronRight className="w-3.5 h-3.5" />
        </Button>
      </div>
    </div>
  );
}

function ActiveQuestionPanel({
  game, question, boardState, sessionTeams,
  selectedPickerTeamId, setSelectedPickerTeamId,
  currentGuesserTeamId, setCurrentGuesserTeamId,
  wagerInput, setWagerInput,
  onConfirmWager, onJudgeDouble, onJudgeCorrect, onJudgeIncorrect,
  onSkip, onCancel, onDismissResult,
}: {
  game: GameWithRounds;
  question: Question | null | undefined;
  boardState: BoardState;
  sessionTeams: SessionTeamWithTeam[];
  selectedPickerTeamId: string | null;
  setSelectedPickerTeamId: (id: string | null) => void;
  currentGuesserTeamId: string | null;
  setCurrentGuesserTeamId: (id: string | null) => void;
  wagerInput: number;
  setWagerInput: (n: number) => void;
  onConfirmWager: () => void;
  onJudgeDouble: (isCorrect: boolean) => void;
  onJudgeCorrect: (teamId: string) => void;
  onJudgeIncorrect: (teamId: string) => void;
  onSkip: () => void;
  onCancel: () => void;
  onDismissResult: () => void;
}) {
  if (!question) return null;
  const phase = boardState.active_question?.phase;
  const isDouble = question.is_double;
  const attempts = boardState.active_question?.attempts ?? [];

  // Build attempt count per team
  const attemptCounts: Record<string, number> = {};
  for (const a of attempts) {
    attemptCounts[a.team_id] = (attemptCounts[a.team_id] ?? 0) + 1;
  }

  // Question info card (shown always)
  const QuestionCard = () => (
    <div className={`rounded-xl p-5 border ${
      isDouble
        ? "bg-[#FFDB58]/8 border-[#FFDB58]/30 shadow-[0_0_20px_rgba(255,219,88,0.1)]"
        : "bg-[#0F1050] border-[#0A0A3E]"
    }`}>
      {isDouble && (
        <div className="flex items-center gap-1.5 mb-3">
          <Star className="w-4 h-4 text-[#FFDB58] fill-[#FFDB58]" />
          <span className="text-sm font-russo text-[#FFDB58] uppercase tracking-widest">Double Points!</span>
        </div>
      )}
      <div className="font-russo text-2xl text-[#FFDB58] mb-2">${question.points}</div>
      <div className="text-sm font-chakra text-white/80 leading-relaxed">
        {question.text || "(No question text)"}
      </div>
      <div className="mt-3 pt-3 border-t border-white/10 text-xs font-chakra text-white/40">
        <span className="text-[#FFDB58]/60 font-russo uppercase tracking-wider text-[10px]">Answer: </span>
        {question.answer || "(No answer)"}
      </div>
    </div>
  );

  // Resolved state
  if (phase === "resolved") {
    const isCorrect = boardState.active_question?.resolved_correct;
    return (
      <div className="space-y-3">
        <div className={`rounded-xl p-5 border text-center ${
          isCorrect
            ? "bg-[#228B22]/10 border-[#228B22]/40"
            : "bg-[#E0115F]/10 border-[#E0115F]/40"
        }`}>
          <div className={`font-russo text-3xl uppercase tracking-widest mb-2 ${
            isCorrect ? "text-[#228B22]" : "text-[#E0115F]"
          }`}>
            {isCorrect ? "✓ Correct!" : "✗ Incorrect!"}
          </div>
          <div className="text-xs font-russo text-white/40 uppercase tracking-widest mb-2">Answer</div>
          <div className="text-lg font-chakra text-white font-semibold">
            {question.answer || "(No answer)"}
          </div>
        </div>
        <Button onClick={onDismissResult} className="w-full btn-gold h-11 rounded-lg font-russo uppercase tracking-widest text-sm">
          Back to Board
        </Button>
      </div>
    );
  }

  // Skipped state
  if (phase === "skipped") {
    return (
      <div className="space-y-3">
        <div className="rounded-xl p-5 border bg-[#808080]/10 border-[#808080]/40 text-center">
          <div className="font-russo text-2xl text-[#808080] uppercase tracking-widest mb-2">No Answer</div>
          <div className="text-xs font-russo text-white/40 uppercase tracking-widest mb-2">The answer was</div>
          <div className="text-lg font-chakra text-white font-semibold">
            {question.answer || "(No answer)"}
          </div>
        </div>
        <Button onClick={onDismissResult} className="w-full btn-gold h-11 rounded-lg font-russo uppercase tracking-widest text-sm">
          Back to Board
        </Button>
      </div>
    );
  }

  const pickerScore = sessionTeams.find((st) => st.team_id === selectedPickerTeamId)?.score ?? 0;
  const maxWager = getMaxWager(question, pickerScore);

  // Double: wager input phase
  if (isDouble && (phase === "wagering" || phase === "picking_team")) {
    return (
      <div className="space-y-3">
        <QuestionCard />
        <div className="j-card p-4 space-y-3">
          <h3 className="text-[10px] font-russo text-[#FFDB58]/60 uppercase tracking-widest">Set Wager</h3>

          <div className="space-y-2">
            <p className="text-xs text-white/40 font-chakra">Who picked this question?</p>
            <div className="grid grid-cols-2 gap-2">
              {game.teams.map((t) => (
                <button key={t.id}
                  onClick={() => setSelectedPickerTeamId(t.id)}
                  className={`py-2 px-3 rounded-lg border text-xs font-chakra font-medium transition-all ${
                    selectedPickerTeamId === t.id
                      ? "border-[#FFDB58]/40 bg-[#FFDB58]/10 text-[#FFDB58]"
                      : "border-white/10 text-white/50 hover:border-white/20"
                  }`}
                  style={{ borderLeftColor: t.color, borderLeftWidth: 3 }}
                >
                  {t.name}
                </button>
              ))}
            </div>
          </div>

          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <p className="text-xs text-white/40 font-chakra">Wager amount</p>
              <span className="text-xs text-[#FFDB58]/50 font-russo">Max: {formatDollars(maxWager)}</span>
            </div>
            <Input type="number" value={wagerInput}
              onChange={(e) => setWagerInput(parseInt(e.target.value) || 0)}
              min={5} max={maxWager} className="j-input h-9 font-russo text-[#FFDB58]" />
          </div>

          <Button onClick={onConfirmWager} disabled={!selectedPickerTeamId || wagerInput < 5 || wagerInput > maxWager}
            className="w-full btn-gold h-10 rounded-lg font-russo disabled:opacity-40">
            Confirm Wager
          </Button>
        </div>
        <Button variant="ghost" onClick={onCancel}
          className="w-full text-white/25 hover:text-white/50 text-xs font-chakra">
          <Square className="w-3 h-3 mr-1.5" />
          Cancel / Return to Board
        </Button>
      </div>
    );
  }

  // Double: judging phase (single attempt)
  if (isDouble && phase === "judging") {
    return (
      <div className="space-y-3">
        <QuestionCard />
        <div className="grid grid-cols-2 gap-3">
          <Button onClick={() => onJudgeDouble(true)}
            className="h-16 bg-[#228B22]/20 hover:bg-[#228B22]/30 text-[#228B22] border border-[#228B22]/40 font-russo text-lg uppercase tracking-widest gap-2">
            <CheckCircle2 className="w-5 h-5" />
            Correct
          </Button>
          <Button onClick={() => onJudgeDouble(false)}
            className="h-16 bg-red-500/20 hover:bg-red-500/30 text-red-400 border border-red-500/40 font-russo text-lg uppercase tracking-widest gap-2">
            <XCircle className="w-5 h-5" />
            Wrong
          </Button>
        </div>
        <Button variant="ghost" onClick={onCancel}
          className="w-full text-white/25 hover:text-white/50 text-xs font-chakra">
          <Square className="w-3 h-3 mr-1.5" />
          Cancel / Return to Board
        </Button>
      </div>
    );
  }

  // Normal question: multi-attempt flow
  return (
    <div className="space-y-3">
      <QuestionCard />

      {/* Attempt log */}
      {attempts.length > 0 && (
        <div className="j-card p-3">
          <h3 className="text-[9px] font-russo text-white/30 uppercase tracking-widest mb-2">Attempts this question</h3>
          <div className="space-y-1">
            {game.teams.filter((t) => attemptCounts[t.id]).map((t) => (
              <div key={t.id} className="flex items-center gap-2">
                <div className="w-2 h-2 rounded-full flex-shrink-0" style={{ backgroundColor: t.color }} />
                <span className="text-xs text-white/60 font-chakra flex-1">{t.name}</span>
                <span className="text-xs text-[#E0115F]/70 font-russo">
                  ✗ ×{attemptCounts[t.id]}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Who is guessing? */}
      <div className="j-card p-4 space-y-3">
        <p className="text-[10px] font-russo text-white/40 uppercase tracking-widest">Who is guessing?</p>
        <div className="grid grid-cols-2 gap-2">
          {game.teams.map((t) => (
            <button key={t.id}
              onClick={() => setCurrentGuesserTeamId(currentGuesserTeamId === t.id ? null : t.id)}
              className={`py-2 px-3 rounded-lg border text-xs font-chakra font-medium transition-all text-left ${
                currentGuesserTeamId === t.id
                  ? "border-[#FFDB58]/40 bg-[#FFDB58]/10 text-[#FFDB58]"
                  : "border-white/10 text-white/50 hover:border-white/20"
              }`}
              style={{ borderLeftColor: t.color, borderLeftWidth: 3 }}
            >
              <span>{t.name}</span>
              {attemptCounts[t.id] ? (
                <span className="ml-1.5 text-[#E0115F]/60 text-[10px]">✗{attemptCounts[t.id]}</span>
              ) : null}
            </button>
          ))}
        </div>
      </div>

      {/* Judge buttons */}
      <div className="grid grid-cols-2 gap-3">
        <Button
          onClick={() => currentGuesserTeamId && onJudgeCorrect(currentGuesserTeamId)}
          disabled={!currentGuesserTeamId}
          className="h-16 bg-[#228B22]/20 hover:bg-[#228B22]/30 text-[#228B22] border border-[#228B22]/40 font-russo text-lg uppercase tracking-widest gap-2 disabled:opacity-30"
        >
          <CheckCircle2 className="w-5 h-5" />
          Correct
        </Button>
        <Button
          onClick={() => currentGuesserTeamId && onJudgeIncorrect(currentGuesserTeamId)}
          disabled={!currentGuesserTeamId}
          className="h-16 bg-red-500/20 hover:bg-red-500/30 text-red-400 border border-red-500/40 font-russo text-lg uppercase tracking-widest gap-2 disabled:opacity-30"
        >
          <XCircle className="w-5 h-5" />
          Wrong
        </Button>
      </div>

      {/* Skip */}
      <Button variant="ghost" onClick={onSkip}
        className="w-full h-10 text-[#808080]/60 hover:text-[#808080] text-xs font-chakra border border-white/5 hover:border-white/10 gap-1.5">
        <MinusCircle className="w-3.5 h-3.5" />
        Skip — No Answer (reveal answer, no points awarded)
      </Button>

      <Button variant="ghost" onClick={onCancel}
        className="w-full text-white/25 hover:text-white/50 text-xs font-chakra">
        <Square className="w-3 h-3 mr-1.5" />
        Cancel / Return to Board
      </Button>
    </div>
  );
}

function FinalJeopardyPanel({
  game, sessionTeams, boardState, finalWagers, setFinalWagers,
  onSubmitWagers, onJudge, onReveal, onEnd, finalQuestion,
}: {
  game: GameWithRounds;
  sessionTeams: SessionTeamWithTeam[];
  boardState: BoardState;
  finalWagers: Record<string, number>;
  setFinalWagers: (w: Record<string, number>) => void;
  onSubmitWagers: () => void;
  onJudge: (teamId: string, isCorrect: boolean) => void;
  onReveal: () => void;
  onEnd: () => void;
  finalQuestion: { category: string; text: string; answer: string } | null;
}) {
  const screen = boardState.screen;

  return (
    <div className="space-y-3">
      <div className="j-card p-4 border-[#FFDB58]/20 bg-[#FFDB58]/5">
        <div className="flex items-center gap-2 mb-1">
          <Star className="w-4 h-4 text-[#FFDB58] fill-[#FFDB58]" />
          <span className="font-russo text-[#FFDB58] uppercase tracking-widest text-sm">Final Jeopardy</span>
          {finalQuestion && (
            <span className="text-[10px] font-chakra text-[#FFDB58]/50 ml-1">— {finalQuestion.category}</span>
          )}
        </div>
        <p className="text-xs text-[#FFDB58]/50 font-chakra">
          {screen === "final_wager" && "Collect wagers from all teams, then submit."}
          {screen === "final_question" && "Question shown on board. Click Reveal when ready to judge."}
          {screen === "final_reveal" && "Judge each team's answer below."}
        </p>
      </div>

      {/* Admin-only question reference */}
      {finalQuestion && (screen === "final_question" || screen === "final_reveal") && (
        <div className="j-card p-4 border-[#FFDB58]/15">
          <div className="text-[9px] font-russo text-white/30 uppercase tracking-widest mb-2">Question (admin only)</div>
          <p className="text-sm font-chakra text-white/80 leading-relaxed mb-3">{finalQuestion.text}</p>
          <div className="pt-2.5 border-t border-white/8">
            <span className="text-[9px] font-russo text-[#FFDB58]/50 uppercase tracking-wider">Answer: </span>
            <span className="text-sm font-chakra text-white/70">{finalQuestion.answer}</span>
          </div>
        </div>
      )}

      {screen === "final_wager" && (
        <div className="j-card p-4 space-y-3">
          <h3 className="text-[10px] font-russo text-[#FFDB58]/60 uppercase tracking-widest">Team Wagers</h3>
          {sessionTeams.map((st) => (
            <div key={st.id} className="flex items-center gap-3">
              <div className="flex items-center gap-2 flex-1">
                <div className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ backgroundColor: st.team?.color }} />
                <span className="text-sm text-white/70 font-chakra">{st.team?.name}</span>
                <span className="text-xs text-white/30 font-russo">{formatDollars(st.score)}</span>
              </div>
              <Input type="number" value={finalWagers[st.team_id] ?? ""}
                onChange={(e) => setFinalWagers({ ...finalWagers, [st.team_id]: parseInt(e.target.value) || 0 })}
                placeholder="0" className="j-input h-8 w-24 text-sm font-russo text-[#FFDB58]"
                min={0} max={Math.max(st.score, 0)} />
            </div>
          ))}
          <Button onClick={onSubmitWagers} className="w-full btn-gold h-10 rounded-lg font-russo uppercase tracking-wider">
            Submit Wagers & Show Question
          </Button>
        </div>
      )}

      {screen === "final_question" && (
        <Button onClick={onReveal} className="w-full h-14 btn-gold rounded-lg font-russo text-base uppercase tracking-widest gap-2">
          <Star className="w-4 h-4 fill-current" />
          Reveal Answers & Judge
        </Button>
      )}

      {screen === "final_reveal" && (
        <div className="j-card p-4 space-y-2.5">
          <h3 className="text-[10px] font-russo text-[#FFDB58]/60 uppercase tracking-widest">Judge Each Team</h3>
          {sessionTeams.map((st) => (
            <div key={st.id} className="flex items-center gap-3 py-2 border-b border-white/5 last:border-0">
              <div className="flex items-center gap-2 flex-1">
                <div className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: st.team?.color }} />
                <span className="text-sm text-white/70 font-chakra">{st.team?.name}</span>
                <span className="text-xs text-[#FFDB58]/40 font-russo">
                  bet {formatDollars(finalWagers[st.team_id] ?? 0)}
                </span>
              </div>
              <div className="flex gap-2">
                <Button size="sm" onClick={() => onJudge(st.team_id, true)}
                  className="h-8 w-8 p-0 bg-[#228B22]/20 hover:bg-[#228B22]/30 text-[#228B22] border border-[#228B22]/30 text-sm font-russo">✓</Button>
                <Button size="sm" onClick={() => onJudge(st.team_id, false)}
                  className="h-8 w-8 p-0 bg-red-500/20 hover:bg-red-500/30 text-red-400 border border-red-500/30 text-sm font-russo">✗</Button>
              </div>
            </div>
          ))}
          <Button onClick={onEnd} className="w-full btn-gold h-10 rounded-lg font-russo uppercase tracking-wider mt-1">
            End Game & Show Leaderboard
          </Button>
        </div>
      )}
    </div>
  );
}

