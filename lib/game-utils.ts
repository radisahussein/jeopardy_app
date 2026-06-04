import { BoardState, GameWithRounds, Question } from "@/lib/types";

export function getInitialBoardState(): BoardState {
  return {
    screen: "board",
    revealed_questions: [],
    active_question: null,
  };
}

export function calcPointsDelta(
  question: Question,
  isCorrect: boolean,
  wagerAmount: number | null,
  wrongAnswerPenalty: boolean
): number {
  const basePoints = wagerAmount ?? question.points;

  if (isCorrect) return basePoints;
  if (!wrongAnswerPenalty) return 0;
  return -basePoints;
}

export function getMaxWager(
  question: Question,
  currentScore: number
): number {
  if (!question.is_double) return 0;

  if (question.double_type === "static_max" && question.double_max_wager) {
    return question.double_max_wager;
  }

  // Wagerable: max is current score, min is $5 (always can bet something)
  return Math.max(currentScore, 5);
}

export function formatDollars(amount: number): string {
  if (amount < 0) return `-$${Math.abs(amount).toLocaleString()}`;
  return `$${amount.toLocaleString()}`;
}

export function isQuestionRevealed(boardState: BoardState, questionId: string): boolean {
  return boardState.revealed_questions.includes(questionId);
}

export function findQuestion(game: GameWithRounds, questionId: string): Question | undefined {
  for (const round of game.rounds) {
    for (const category of round.categories) {
      const q = category.questions.find((q) => q.id === questionId);
      if (q) return q;
    }
  }
}

export function sortGame(game: GameWithRounds): GameWithRounds {
  return {
    ...game,
    teams: [...(game.teams ?? [])].sort((a, b) => a.order - b.order),
    rounds: [...(game.rounds ?? [])]
      .sort((a, b) => a.order - b.order)
      .map((r) => ({
        ...r,
        categories: [...(r.categories ?? [])]
          .sort((a, b) => a.order - b.order)
          .map((c) => ({
            ...c,
            questions: [...(c.questions ?? [])].sort((a, b) => a.order - b.order),
          })),
      })),
  };
}
