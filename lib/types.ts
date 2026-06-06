export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[];

export type Database = {
  public: {
    Tables: {
      games: {
        Row: {
          id: string;
          admin_id: string;
          title: string;
          status: "draft" | "active" | "completed";
          wrong_answer_penalty: boolean;
          final_jeopardy_enabled: boolean;
          final_jeopardy_question: { category: string; text: string; answer: string } | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          admin_id: string;
          title: string;
          status?: "draft" | "active" | "completed";
          wrong_answer_penalty?: boolean;
          final_jeopardy_enabled?: boolean;
          final_jeopardy_question?: { category: string; text: string; answer: string } | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          admin_id?: string;
          title?: string;
          status?: "draft" | "active" | "completed";
          wrong_answer_penalty?: boolean;
          final_jeopardy_enabled?: boolean;
          final_jeopardy_question?: { category: string; text: string; answer: string } | null;
          updated_at?: string;
        };
        Relationships: [];
      };
      rounds: {
        Row: {
          id: string;
          game_id: string;
          name: string;
          order: number;
          created_at: string;
        };
        Insert: {
          id?: string;
          game_id: string;
          name?: string;
          order?: number;
        };
        Update: {
          id?: string;
          game_id?: string;
          name?: string;
          order?: number;
        };
        Relationships: [];
      };
      categories: {
        Row: {
          id: string;
          round_id: string;
          name: string;
          order: number;
          created_at: string;
        };
        Insert: {
          id?: string;
          round_id: string;
          name: string;
          order?: number;
        };
        Update: {
          id?: string;
          round_id?: string;
          name?: string;
          order?: number;
        };
        Relationships: [];
      };
      questions: {
        Row: {
          id: string;
          category_id: string;
          points: number;
          text: string;
          answer: string;
          order: number;
          is_double: boolean;
          double_type: "wagerable" | "static_max" | null;
          double_max_wager: number | null;
          is_final_jeopardy: boolean;
          image_url: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          category_id: string;
          points?: number;
          text?: string;
          answer?: string;
          order?: number;
          is_double?: boolean;
          double_type?: "wagerable" | "static_max" | null;
          double_max_wager?: number | null;
          is_final_jeopardy?: boolean;
          image_url?: string | null;
        };
        Update: {
          id?: string;
          category_id?: string;
          points?: number;
          text?: string;
          answer?: string;
          order?: number;
          is_double?: boolean;
          double_type?: "wagerable" | "static_max" | null;
          double_max_wager?: number | null;
          is_final_jeopardy?: boolean;
          image_url?: string | null;
        };
        Relationships: [];
      };
      teams: {
        Row: {
          id: string;
          game_id: string;
          name: string;
          color: string;
          order: number;
          created_at: string;
        };
        Insert: {
          id?: string;
          game_id: string;
          name: string;
          color?: string;
          order?: number;
        };
        Update: {
          id?: string;
          game_id?: string;
          name?: string;
          color?: string;
          order?: number;
        };
        Relationships: [];
      };
      game_sessions: {
        Row: {
          id: string;
          game_id: string;
          status: "active" | "final_jeopardy" | "completed";
          current_round_id: string | null;
          started_at: string;
          ended_at: string | null;
          board_state: Json;
        };
        Insert: {
          id?: string;
          game_id: string;
          status?: "active" | "final_jeopardy" | "completed";
          current_round_id?: string | null;
          started_at?: string;
          ended_at?: string | null;
          board_state?: Json;
        };
        Update: {
          id?: string;
          game_id?: string;
          status?: "active" | "final_jeopardy" | "completed";
          current_round_id?: string | null;
          ended_at?: string | null;
          board_state?: Json;
        };
        Relationships: [];
      };
      session_teams: {
        Row: {
          id: string;
          session_id: string;
          team_id: string;
          score: number;
        };
        Insert: {
          id?: string;
          session_id: string;
          team_id: string;
          score?: number;
        };
        Update: {
          id?: string;
          session_id?: string;
          team_id?: string;
          score?: number;
        };
        Relationships: [];
      };
      question_attempts: {
        Row: {
          id: string;
          session_id: string;
          question_id: string;
          picking_team_id: string;
          answering_team_id: string;
          is_correct: boolean;
          points_delta: number;
          wager_amount: number | null;
          attempted_at: string;
        };
        Insert: {
          id?: string;
          session_id: string;
          question_id: string;
          picking_team_id: string;
          answering_team_id: string;
          is_correct: boolean;
          points_delta: number;
          wager_amount?: number | null;
        };
        Update: {
          is_correct?: boolean;
          points_delta?: number;
        };
        Relationships: [];
      };
      final_jeopardy_submissions: {
        Row: {
          id: string;
          session_id: string;
          team_id: string;
          wager_amount: number;
          is_correct: boolean | null;
          submitted_at: string;
        };
        Insert: {
          id?: string;
          session_id: string;
          team_id: string;
          wager_amount: number;
          is_correct?: boolean | null;
        };
        Update: {
          wager_amount?: number;
          is_correct?: boolean | null;
        };
        Relationships: [];
      };
    };
    Views: Record<string, never>;
    Functions: {
      update_score_and_log_attempt: {
        Args: {
          p_session_id: string;
          p_question_id: string;
          p_picking_team_id: string;
          p_answering_team_id: string;
          p_is_correct: boolean;
          p_points_delta: number;
          p_wager_amount?: number | null;
        };
        Returns: void;
      };
    };
    Enums: Record<string, never>;
    CompositeTypes: Record<string, never>;
  };
};

// BoardState type (stored as JSON in DB)
export type BoardState = {
  screen:
    | "board"
    | "question"
    | "double_wager"
    | "final_wager"
    | "final_question"
    | "final_reveal"
    | "leaderboard";
  revealed_questions: string[];
  active_question: {
    question_id: string;
    phase: "picking_team" | "showing" | "wagering" | "judging" | "resolved" | "skipped";
    picking_team_id: string | null;
    answering_team_id: string | null;
    wager_amount: number | null;
    resolved_correct?: boolean;
    attempts?: Array<{ team_id: string; correct: boolean }>;
    last_incorrect_event?: string | null;
    last_incorrect_team_id?: string | null;
    score_delta_event?: { team_id: string; delta: number; event_id: string } | null;
  } | null;
};

// Row convenience types
export type Game = Database["public"]["Tables"]["games"]["Row"];
export type Round = Database["public"]["Tables"]["rounds"]["Row"];
export type Category = Database["public"]["Tables"]["categories"]["Row"];
export type Question = Database["public"]["Tables"]["questions"]["Row"];
export type Team = Database["public"]["Tables"]["teams"]["Row"];
export type GameSession = Omit<Database["public"]["Tables"]["game_sessions"]["Row"], "board_state"> & {
  board_state: BoardState;
};
export type SessionTeam = Database["public"]["Tables"]["session_teams"]["Row"];
export type QuestionAttempt = Database["public"]["Tables"]["question_attempts"]["Row"];
export type FinalJeopardySubmission = Database["public"]["Tables"]["final_jeopardy_submissions"]["Row"];

// Composed session team type used across components and pages
export type SessionTeamWithTeam = SessionTeam & { team: Team };

// Composed types
export type GameWithRounds = Game & {
  rounds: (Round & {
    categories: (Category & {
      questions: Question[];
    })[];
  })[];
  teams: Team[];
};

export type SessionWithDetails = GameSession & {
  game: Game;
  session_teams: (SessionTeam & { team: Team })[];
};
