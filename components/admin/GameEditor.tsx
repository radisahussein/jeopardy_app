"use client";

import { useState, useRef } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { GameWithRounds, Round, Category, Question, Team } from "@/lib/types";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { toast } from "sonner";
import {
  Plus, Trash2, Pencil, Play, ArrowLeft, Star, ChevronRight,
  Copy, ExternalLink, Users, Upload, FileJson, Check, AlertTriangle,
  Settings2, ImageIcon, X,
} from "lucide-react";
import Link from "next/link";

const TEAM_COLORS = [
  "#EF4444", "#F97316", "#EAB308", "#22C55E",
  "#3B82F6", "#8B5CF6", "#EC4899", "#06B6D4",
];

// ── JSON import types ──────────────────────────────────────────
interface ImportQuestion {
  text: string;
  answer?: string;
  points: number;
  is_double?: boolean;
  double_type?: "wagerable" | "static_max";
  double_max_wager?: number;
}
interface ImportCategory { name: string; questions: ImportQuestion[] }
interface ImportRound { name: string; categories: ImportCategory[] }
interface ImportFinalJeopardy { category: string; text: string; answer: string }
interface ImportData { rounds: ImportRound[]; final_jeopardy?: ImportFinalJeopardy }

function validateImportData(raw: unknown): ImportData {
  if (!raw || typeof raw !== "object") throw new Error("Invalid JSON: expected an object");
  const obj = raw as Record<string, unknown>;
  if (!Array.isArray(obj.rounds)) throw new Error("JSON must have a top-level \"rounds\" array");
  if (obj.rounds.length === 0) throw new Error("\"rounds\" array is empty");

  for (let ri = 0; ri < obj.rounds.length; ri++) {
    const r = obj.rounds[ri] as Record<string, unknown>;
    if (!r.name || typeof r.name !== "string") throw new Error(`rounds[${ri}] missing \"name\"`);
    if (!Array.isArray(r.categories)) throw new Error(`rounds[${ri}] missing \"categories\" array`);

    for (let ci = 0; ci < (r.categories as unknown[]).length; ci++) {
      const c = (r.categories as Record<string, unknown>[])[ci];
      if (!c.name || typeof c.name !== "string") throw new Error(`rounds[${ri}].categories[${ci}] missing \"name\"`);
      if (!Array.isArray(c.questions)) throw new Error(`rounds[${ri}].categories[${ci}] missing \"questions\" array`);

      for (let qi = 0; qi < (c.questions as unknown[]).length; qi++) {
        const q = (c.questions as Record<string, unknown>[])[qi];
        if (typeof q.text !== "string" || !q.text) throw new Error(`rounds[${ri}].categories[${ci}].questions[${qi}] missing \"text\"`);
        if (typeof q.points !== "number" || q.points < 0) throw new Error(`rounds[${ri}].categories[${ci}].questions[${qi}] needs numeric \"points\" >= 0`);
      }
    }
  }

  if (obj.final_jeopardy !== undefined && obj.final_jeopardy !== null) {
    const fj = obj.final_jeopardy as Record<string, unknown>;
    if (typeof fj.category !== "string" || !fj.category) throw new Error("final_jeopardy.category must be a non-empty string");
    if (typeof fj.text !== "string" || !fj.text) throw new Error("final_jeopardy.text must be a non-empty string");
    if (typeof fj.answer !== "string" || !fj.answer) throw new Error("final_jeopardy.answer must be a non-empty string");
  }

  return obj as unknown as ImportData;
}

type Props = { game: GameWithRounds };

export default function GameEditor({ game: initialGame }: Props) {
  const router = useRouter();
  const supabase = createClient();

  const [game, setGame] = useState(initialGame);
  const [selectedRoundId, setSelectedRoundId] = useState<string | null>(game.rounds[0]?.id ?? null);
  const [editingQuestion, setEditingQuestion] = useState<Question | null>(null);
  const [newCategoryName, setNewCategoryName] = useState("");
  const [addingCategory, setAddingCategory] = useState(false);
  const [sessionModal, setSessionModal] = useState<{ runUrl: string; boardUrl: string } | null>(null);
  const [launchingSession, setLaunchingSession] = useState(false);

  // Team edits: keyed by teamId, tracks unsaved name/color
  const [teamEdits, setTeamEdits] = useState<Record<string, { name: string; color: string }>>(
    () => Object.fromEntries(initialGame.teams.map((t) => [t.id, { name: t.name, color: t.color }]))
  );

  // JSON import
  const [jsonConfirmData, setJsonConfirmData] = useState<ImportData | null>(null);
  const [importingJson, setImportingJson] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const selectedRound = game.rounds.find((r) => r.id === selectedRoundId);
  const canStart = game.rounds.length > 0 && game.teams.length >= 2;

  // === Game settings ===
  async function updateGameSettings(fields: { wrong_answer_penalty?: boolean; final_jeopardy_enabled?: boolean }) {
    const { error } = await supabase.from("games").update(fields).eq("id", game.id);
    if (error) { toast.error("Failed to update settings"); return; }
    setGame((g) => ({ ...g, ...fields }));
    if (fields.final_jeopardy_enabled) setSelectedRoundId("__fj__");
  }

  async function updateFinalJeopardyQuestion(data: { category: string; text: string; answer: string } | null) {
    const { error } = await supabase
      .from("games")
      .update({ final_jeopardy_question: data })
      .eq("id", game.id);
    if (error) { toast.error("Failed to save Final Jeopardy"); return; }
    setGame((g) => ({ ...g, final_jeopardy_question: data }));
    toast.success("Final Jeopardy saved");
  }

  // === Round CRUD ===
  async function addRound() {
    const order = game.rounds.length;
    const { data, error } = await supabase
      .from("rounds")
      .insert({ game_id: game.id, name: `Round ${order + 1}`, order })
      .select()
      .single();

    if (error || !data) { toast.error("Failed to add round"); return; }
    const newRound = { ...data, categories: [] };
    setGame((g) => ({ ...g, rounds: [...g.rounds, newRound] }));
    setSelectedRoundId(data.id);
    toast.success("Round added");
  }

  async function deleteRound(roundId: string) {
    if (game.rounds.length <= 1) { toast.error("Game must have at least one round"); return; }
    const { error } = await supabase.from("rounds").delete().eq("id", roundId);
    if (error) { toast.error("Failed to delete round"); return; }
    const remaining = game.rounds.filter((r) => r.id !== roundId);
    setGame((g) => ({ ...g, rounds: remaining }));
    setSelectedRoundId(remaining[0]?.id ?? null);
    toast.success("Round deleted");
  }

  async function updateRoundName(roundId: string, name: string) {
    const { error } = await supabase.from("rounds").update({ name }).eq("id", roundId);
    if (error) { toast.error("Failed to update round"); return; }
    setGame((g) => ({ ...g, rounds: g.rounds.map((r) => r.id === roundId ? { ...r, name } : r) }));
  }

  // === Category CRUD ===
  async function addCategory() {
    if (!selectedRoundId || !newCategoryName.trim()) return;
    const order = selectedRound?.categories.length ?? 0;

    const { data, error } = await supabase
      .from("categories")
      .insert({ round_id: selectedRoundId, name: newCategoryName.trim(), order })
      .select()
      .single();

    if (error || !data) { toast.error("Failed to add category"); return; }

    const newCat = { ...data, questions: [] };
    setGame((g) => ({
      ...g,
      rounds: g.rounds.map((r) =>
        r.id === selectedRoundId ? { ...r, categories: [...r.categories, newCat] } : r
      ),
    }));
    setNewCategoryName("");
    setAddingCategory(false);
    toast.success("Category added");
  }

  async function deleteCategory(categoryId: string) {
    const { error } = await supabase.from("categories").delete().eq("id", categoryId);
    if (error) { toast.error("Failed to delete category"); return; }
    setGame((g) => ({
      ...g,
      rounds: g.rounds.map((r) =>
        r.id === selectedRoundId
          ? { ...r, categories: r.categories.filter((c) => c.id !== categoryId) }
          : r
      ),
    }));
    toast.success("Category deleted");
  }

  async function updateCategoryName(categoryId: string, name: string) {
    const { error } = await supabase.from("categories").update({ name }).eq("id", categoryId);
    if (error) { toast.error("Failed to update category"); return; }
    setGame((g) => ({
      ...g,
      rounds: g.rounds.map((r) => ({
        ...r,
        categories: r.categories.map((c) => c.id === categoryId ? { ...c, name } : c),
      })),
    }));
  }

  // === Question CRUD ===
  async function addQuestion(categoryId: string) {
    const cat = selectedRound?.categories.find((c) => c.id === categoryId);
    const order = cat?.questions.length ?? 0;
    const points = (order + 1) * 100;

    const { data, error } = await supabase
      .from("questions")
      .insert({ category_id: categoryId, points, order })
      .select()
      .single();

    if (error || !data) { toast.error("Failed to add question"); return; }

    setGame((g) => ({
      ...g,
      rounds: g.rounds.map((r) => ({
        ...r,
        categories: r.categories.map((c) =>
          c.id === categoryId ? { ...c, questions: [...c.questions, data] } : c
        ),
      })),
    }));
    setEditingQuestion(data);
  }

  async function saveQuestion(q: Question) {
    const { error } = await supabase
      .from("questions")
      .update({
        text: q.text,
        answer: q.answer,
        points: q.points,
        is_double: q.is_double,
        double_type: q.is_double ? q.double_type : null,
        double_max_wager: q.is_double && q.double_type === "static_max" ? q.double_max_wager : null,
        is_final_jeopardy: q.is_final_jeopardy,
        image_url: q.image_url ?? null,
      })
      .eq("id", q.id);

    if (error) { toast.error("Failed to save question"); return; }

    setGame((g) => ({
      ...g,
      rounds: g.rounds.map((r) => ({
        ...r,
        categories: r.categories.map((c) => ({
          ...c,
          questions: c.questions.map((question) => question.id === q.id ? q : question),
        })),
      })),
    }));
    setEditingQuestion(null);
    toast.success("Question saved");
  }

  async function deleteQuestion(questionId: string, categoryId: string) {
    const { error } = await supabase.from("questions").delete().eq("id", questionId);
    if (error) { toast.error("Failed to delete question"); return; }

    setGame((g) => ({
      ...g,
      rounds: g.rounds.map((r) => ({
        ...r,
        categories: r.categories.map((c) =>
          c.id === categoryId
            ? { ...c, questions: c.questions.filter((q) => q.id !== questionId) }
            : c
        ),
      })),
    }));
    if (editingQuestion?.id === questionId) setEditingQuestion(null);
    toast.success("Question deleted");
  }

  // === Teams CRUD ===
  async function addTeam() {
    const order = game.teams.length;
    const color = TEAM_COLORS[order % TEAM_COLORS.length];
    const name = `Team ${order + 1}`;

    const { data, error } = await supabase
      .from("teams")
      .insert({ game_id: game.id, name, color, order })
      .select()
      .single();

    if (error || !data) { toast.error("Failed to add team"); return; }

    setGame((g) => ({ ...g, teams: [...g.teams, data] }));
    setTeamEdits((e) => ({ ...e, [data.id]: { name: data.name, color: data.color } }));
  }

  async function removeTeam(teamId: string) {
    const { error } = await supabase.from("teams").delete().eq("id", teamId);
    if (error) { toast.error("Failed to remove team"); return; }

    setGame((g) => ({ ...g, teams: g.teams.filter((t) => t.id !== teamId) }));
    setTeamEdits((e) => {
      const copy = { ...e };
      delete copy[teamId];
      return copy;
    });
  }

  async function saveTeamName(teamId: string) {
    const edit = teamEdits[teamId];
    const team = game.teams.find((t) => t.id === teamId);
    if (!edit || !team || edit.name === team.name) return;
    if (!edit.name.trim()) { setTeamEdits((e) => ({ ...e, [teamId]: { ...e[teamId], name: team.name } })); return; }

    const { error } = await supabase.from("teams").update({ name: edit.name.trim() }).eq("id", teamId);
    if (error) { toast.error("Failed to save team name"); return; }
    setGame((g) => ({ ...g, teams: g.teams.map((t) => t.id === teamId ? { ...t, name: edit.name.trim() } : t) }));
  }

  async function saveTeamColor(teamId: string, color: string) {
    setTeamEdits((e) => ({ ...e, [teamId]: { ...e[teamId], color } }));
    const { error } = await supabase.from("teams").update({ color }).eq("id", teamId);
    if (error) { toast.error("Failed to save team color"); return; }
    setGame((g) => ({ ...g, teams: g.teams.map((t) => t.id === teamId ? { ...t, color } : t) }));
  }

  // === Session launch ===
  async function startSession() {
    if (game.teams.length < 2) {
      toast.error("Add at least 2 teams before starting a session");
      return;
    }
    setLaunchingSession(true);
    try {
      const { data: session, error } = await supabase
        .from("game_sessions")
        .insert({
          game_id: game.id,
          current_round_id: game.rounds[0]?.id ?? null,
          board_state: {
            screen: "board" as const,
            revealed_questions: [] as string[],
            active_question: null,
          },
        })
        .select()
        .single();

      if (error || !session) throw error ?? new Error("Failed to create session");

      const teamRows = game.teams.map((t) => ({ session_id: session.id, team_id: t.id, score: 0 }));
      await supabase.from("session_teams").insert(teamRows);

      const origin = window.location.origin;
      const runUrl = `${origin}/admin/games/${game.id}/run/${session.id}`;
      const boardUrl = `${origin}/play/${session.id}`;

      setSessionModal({ runUrl, boardUrl });
    } catch {
      toast.error("Failed to start session");
    } finally {
      setLaunchingSession(false);
    }
  }

  // === JSON Import ===
  function handleJsonFileInput(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    e.target.value = "";

    if (file.size > 5 * 1024 * 1024) {
      toast.error("File too large. Maximum 5 MB.");
      return;
    }

    const reader = new FileReader();
    reader.onload = (ev) => {
      try {
        const raw = JSON.parse(ev.target?.result as string);
        const data = validateImportData(raw);
        setJsonConfirmData(data);
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "Invalid JSON file");
      }
    };
    reader.readAsText(file);
  }

  async function executeJsonImport(data: ImportData) {
    setImportingJson(true);
    try {
      const currentRoundCount = game.rounds.length;
      const newRounds: (Round & { categories: (Category & { questions: Question[] })[] })[] = [];

      for (let ri = 0; ri < data.rounds.length; ri++) {
        const ir = data.rounds[ri];
        const { data: round, error: roundError } = await supabase
          .from("rounds")
          .insert({ game_id: game.id, name: ir.name, order: currentRoundCount + ri })
          .select()
          .single();

        if (roundError || !round) throw roundError ?? new Error("Failed to create round");

        // Batch insert all categories for this round
        const { data: insertedCats, error: catsBatchError } = await supabase
          .from("categories")
          .insert(ir.categories.map((ic, ci) => ({ round_id: round.id, name: ic.name, order: ci })))
          .select();

        if (catsBatchError || !insertedCats) throw catsBatchError ?? new Error("Failed to create categories");

        const sortedCats = [...insertedCats].sort((a, b) => a.order - b.order);
        const newCats: (Category & { questions: Question[] })[] = [];

        for (let ci = 0; ci < ir.categories.length; ci++) {
          const cat = sortedCats[ci];
          const ic = ir.categories[ci];

          if (ic.questions.length === 0) {
            newCats.push({ ...cat, questions: [] });
            continue;
          }

          // Batch insert all questions for this category
          const { data: insertedQs, error: qsBatchError } = await supabase
            .from("questions")
            .insert(ic.questions.map((iq, qi) => ({
              category_id: cat.id,
              text: iq.text,
              answer: iq.answer ?? "",
              points: iq.points,
              order: qi,
              is_double: iq.is_double ?? false,
              double_type: iq.is_double ? (iq.double_type ?? "wagerable") : null,
              double_max_wager: iq.is_double && iq.double_type === "static_max" ? (iq.double_max_wager ?? null) : null,
              is_final_jeopardy: false,
            })))
            .select();

          if (qsBatchError || !insertedQs) throw qsBatchError ?? new Error("Failed to create questions");

          const questions = [...insertedQs].sort((a, b) => a.order - b.order) as Question[];
          newCats.push({ ...cat, questions });
        }

        newRounds.push({ ...round, categories: newCats });
      }

      // Import final_jeopardy if present
      if (data.final_jeopardy) {
        await supabase
          .from("games")
          .update({ final_jeopardy_question: data.final_jeopardy })
          .eq("id", game.id);
        setGame((g) => ({ ...g, final_jeopardy_question: data.final_jeopardy ?? null }));
      }

      setGame((g) => ({ ...g, rounds: [...g.rounds, ...newRounds] }));
      if (newRounds.length > 0 && !selectedRoundId) setSelectedRoundId(newRounds[0].id);
      if (newRounds.length > 0 && game.rounds.length === 0) setSelectedRoundId(newRounds[0].id);

      setJsonConfirmData(null);

      const totalCats = data.rounds.reduce((s, r) => s + r.categories.length, 0);
      const totalQs = data.rounds.reduce((s, r) => s + r.categories.reduce((ss, c) => ss + c.questions.length, 0), 0);
      const fjNote = data.final_jeopardy ? " + Final Jeopardy" : "";
      toast.success(`Imported ${data.rounds.length} round(s), ${totalCats} categories, ${totalQs} questions${fjNote}`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Import failed");
    } finally {
      setImportingJson(false);
    }
  }

  // ── Render ──────────────────────────────────────────────────
  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Link href="/admin/dashboard">
            <Button variant="ghost" size="sm" className="text-white/40 hover:text-white hover:bg-white/5 gap-1.5 -ml-2 font-chakra">
              <ArrowLeft className="w-4 h-4" />
              Dashboard
            </Button>
          </Link>
          <div className="h-4 w-px bg-white/15" />
          <h1 className="font-russo text-lg text-white uppercase tracking-widest">{game.title}</h1>
          {game.wrong_answer_penalty && (
            <span className="text-[9px] font-chakra font-bold uppercase tracking-widest px-2 py-0.5 rounded-full bg-[#FFDB58]/10 text-[#FFDB58]/60 border border-[#FFDB58]/20">Penalty</span>
          )}
          {game.final_jeopardy_enabled && (
            <span className="text-[9px] font-chakra font-bold uppercase tracking-widest px-2 py-0.5 rounded-full bg-[#FFDB58]/10 text-[#FFDB58]/60 border border-[#FFDB58]/20">Final Jeopardy</span>
          )}
        </div>

        <div className="flex items-center gap-2">
          {/* Import JSON */}
          <input
            ref={fileInputRef}
            type="file"
            accept=".json,application/json"
            className="hidden"
            onChange={handleJsonFileInput}
          />
          <a
            href="/jeopardy-template.json"
            download="jeopardy-template.json"
            className="inline-flex items-center gap-1.5 text-white/25 hover:text-white/50 font-chakra text-xs h-9 px-2 transition-colors"
            title="Download JSON template"
          >
            <FileJson className="w-3.5 h-3.5" />
            Template
          </a>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => fileInputRef.current?.click()}
            className="gap-1.5 text-white/40 hover:text-[#FFDB58] hover:bg-[#FFDB58]/5 border border-white/10 hover:border-[#FFDB58]/20 font-chakra text-xs h-9 px-3"
          >
            <Upload className="w-3.5 h-3.5" />
            Import JSON
          </Button>

          <Button
            onClick={startSession}
            disabled={launchingSession || game.rounds.length === 0}
            title={!canStart && game.teams.length < 2 ? "Add at least 2 teams first" : undefined}
            className="btn-gold h-9 px-4 gap-2 text-sm rounded-lg disabled:opacity-40"
          >
            <Play className="w-4 h-4" />
            {launchingSession ? "Starting..." : "Start Session"}
          </Button>
        </div>
      </div>

      <div className="flex gap-5">
        {/* Left sidebar */}
        <div className="w-64 flex-shrink-0">
          <div className="j-card overflow-hidden">
            {/* Rounds */}
            <div className="px-3 py-2.5 border-b border-white/8 flex items-center justify-between">
              <span className="text-[10px] font-russo text-[#FFDB58]/70 uppercase tracking-widest">Rounds</span>
              <Button variant="ghost" size="sm" onClick={addRound}
                className="h-6 w-6 p-0 text-white/30 hover:text-[#FFDB58] hover:bg-[#FFDB58]/10">
                <Plus className="w-3.5 h-3.5" />
              </Button>
            </div>
            <div className="p-1.5 space-y-0.5">
              {game.rounds.map((round) => (
                <RoundItem
                  key={round.id}
                  round={round}
                  isSelected={round.id === selectedRoundId}
                  onSelect={() => setSelectedRoundId(round.id)}
                  onDelete={() => deleteRound(round.id)}
                  onRename={(name) => updateRoundName(round.id, name)}
                />
              ))}
              {game.rounds.length === 0 && (
                <p className="text-[10px] text-white/20 text-center py-2 font-chakra">No rounds</p>
              )}
              {game.final_jeopardy_enabled && (
                <button
                  onClick={() => setSelectedRoundId("__fj__")}
                  className={`w-full flex items-center gap-2 px-2.5 py-2 rounded-md text-left transition-all mt-1 border-t border-white/8 pt-2 ${
                    selectedRoundId === "__fj__"
                      ? "bg-[#FFDB58]/10 text-[#FFDB58]"
                      : "text-[#FFDB58]/50 hover:text-[#FFDB58] hover:bg-[#FFDB58]/5"
                  }`}
                >
                  <Star className="w-3 h-3 fill-current flex-shrink-0" />
                  <span className="text-[10px] font-russo uppercase tracking-widest">Final Jeopardy</span>
                  {game.final_jeopardy_question && (
                    <Check className="w-2.5 h-2.5 ml-auto flex-shrink-0 opacity-60" />
                  )}
                </button>
              )}
            </div>

            {/* Settings */}
            <div className="border-t border-white/8 px-3 py-2.5">
              <div className="flex items-center gap-1.5 mb-2.5">
                <Settings2 className="w-3 h-3 text-[#FFDB58]/50" />
                <span className="text-[10px] font-russo text-[#FFDB58]/70 uppercase tracking-widest">Settings</span>
              </div>
              <div className="space-y-2">
                <SidebarToggle
                  label="Wrong Answer Penalty"
                  enabled={game.wrong_answer_penalty}
                  onChange={(v) => updateGameSettings({ wrong_answer_penalty: v })}
                />
                <SidebarToggle
                  label="Final Jeopardy"
                  enabled={game.final_jeopardy_enabled}
                  onChange={(v) => updateGameSettings({ final_jeopardy_enabled: v })}
                />
              </div>
            </div>

            {/* Teams */}
            <div className="border-t border-white/8 px-3 py-2.5">
              <div className="flex items-center justify-between mb-2.5">
                <div className="flex items-center gap-1.5">
                  <Users className="w-3 h-3 text-[#FFDB58]/50" />
                  <span className="text-[10px] font-russo text-[#FFDB58]/70 uppercase tracking-widest">
                    Teams ({game.teams.length})
                  </span>
                </div>
              </div>

              <div className="space-y-1.5">
                {game.teams.map((team) => {
                  const edit = teamEdits[team.id] ?? { name: team.name, color: team.color };
                  return (
                    <div key={team.id} className="flex items-center gap-1.5">
                      {/* Color picker */}
                      <div className="relative flex-shrink-0">
                        <div
                          className="w-5 h-5 rounded-md border border-white/20 cursor-pointer hover:scale-110 transition-transform"
                          style={{ backgroundColor: edit.color }}
                        />
                        <input
                          type="color"
                          value={edit.color}
                          onChange={(e) => saveTeamColor(team.id, e.target.value)}
                          className="absolute inset-0 opacity-0 w-full h-full cursor-pointer rounded-md"
                        />
                      </div>

                      {/* Name */}
                      <input
                        value={edit.name}
                        onChange={(e) => setTeamEdits((prev) => ({
                          ...prev,
                          [team.id]: { ...prev[team.id], name: e.target.value },
                        }))}
                        onBlur={() => saveTeamName(team.id)}
                        onKeyDown={(e) => { if (e.key === "Enter") (e.target as HTMLInputElement).blur(); }}
                        className="flex-1 min-w-0 bg-white/5 border border-white/10 rounded px-1.5 py-0.5 text-xs text-white font-chakra focus:outline-none focus:border-[#FFDB58]/40 focus:bg-white/8"
                        style={{ borderLeftColor: edit.color, borderLeftWidth: 2 }}
                      />

                      {/* Delete */}
                      <button
                        onClick={() => removeTeam(team.id)}
                        className="flex-shrink-0 text-white/20 hover:text-red-400 transition-colors"
                      >
                        <Trash2 className="w-3 h-3" />
                      </button>
                    </div>
                  );
                })}
              </div>

              <button
                onClick={addTeam}
                className="mt-2 w-full flex items-center justify-center gap-1 py-1.5 rounded-lg border border-dashed border-white/10 text-white/25 text-[10px] hover:border-[#FFDB58]/30 hover:text-[#FFDB58]/50 transition-all font-chakra"
              >
                <Plus className="w-3 h-3" />
                Add Team
              </button>

              {game.teams.length < 2 && (
                <p className="mt-1.5 text-[9px] text-[#E0115F]/60 font-chakra flex items-center gap-1">
                  <AlertTriangle className="w-2.5 h-2.5" />
                  Need at least 2 teams to start
                </p>
              )}
            </div>
          </div>
        </div>

        {/* Main: categories grid or FJ editor */}
        <div className="flex-1 min-w-0">
          {selectedRoundId === "__fj__" ? (
            <FinalJeopardyEditor
              question={game.final_jeopardy_question ?? null}
              onSave={updateFinalJeopardyQuestion}
            />
          ) : !selectedRound ? (
            <div className="j-card p-12 text-center" style={{ borderStyle: "dashed" }}>
              <p className="text-white/30 font-chakra">No rounds yet. Add a round or import JSON to get started.</p>
            </div>
          ) : (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <h2 className="font-russo text-sm text-white/70 uppercase tracking-widest">{selectedRound.name}</h2>
                {addingCategory ? (
                  <div className="flex items-center gap-2">
                    <Input
                      value={newCategoryName}
                      onChange={(e) => setNewCategoryName(e.target.value)}
                      placeholder="Category name"
                      className="j-input h-8 w-48 text-sm font-chakra"
                      onKeyDown={(e) => { if (e.key === "Enter") addCategory(); if (e.key === "Escape") setAddingCategory(false); }}
                      autoFocus
                    />
                    <Button size="sm" onClick={addCategory} className="h-8 btn-gold px-3 rounded-lg text-xs">Add</Button>
                    <Button size="sm" variant="ghost" onClick={() => setAddingCategory(false)}
                      className="h-8 text-white/40 hover:text-white font-chakra">Cancel</Button>
                  </div>
                ) : (
                  <Button variant="ghost" size="sm" onClick={() => setAddingCategory(true)}
                    className="gap-1.5 text-xs font-chakra text-white/40 hover:text-[#FFDB58] hover:bg-[#FFDB58]/5 border border-white/10 hover:border-[#FFDB58]/20 h-8">
                    <Plus className="w-3.5 h-3.5" />
                    Add Category
                  </Button>
                )}
              </div>

              {selectedRound.categories.length === 0 ? (
                <div className="j-card p-12 text-center" style={{ borderStyle: "dashed" }}>
                  <FileJson className="w-8 h-8 text-white/15 mx-auto mb-3" />
                  <p className="text-white/30 text-sm font-chakra mb-1">No categories yet.</p>
                  <p className="text-white/20 text-xs font-chakra">Add a category manually or import a JSON file.</p>
                </div>
              ) : (
                <div className="grid gap-4" style={{ gridTemplateColumns: `repeat(${Math.min(selectedRound.categories.length, 4)}, minmax(0, 1fr))` }}>
                  {selectedRound.categories.map((category) => (
                    <CategoryColumn
                      key={category.id}
                      category={category}
                      onDeleteCategory={() => deleteCategory(category.id)}
                      onRenameCategory={(name) => updateCategoryName(category.id, name)}
                      onAddQuestion={() => addQuestion(category.id)}
                      onEditQuestion={setEditingQuestion}
                      onDeleteQuestion={(qId) => deleteQuestion(qId, category.id)}
                    />
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Question editor dialog */}
      {editingQuestion && (
        <QuestionEditor
          question={editingQuestion}
          onSave={saveQuestion}
          onClose={() => setEditingQuestion(null)}
        />
      )}

      {/* JSON import confirmation */}
      {jsonConfirmData && (
        <JsonImportModal
          data={jsonConfirmData}
          importing={importingJson}
          onConfirm={() => executeJsonImport(jsonConfirmData)}
          onClose={() => setJsonConfirmData(null)}
        />
      )}

      {/* Session launched modal */}
      {sessionModal && (
        <SessionLaunchModal
          runUrl={sessionModal.runUrl}
          boardUrl={sessionModal.boardUrl}
          onClose={() => setSessionModal(null)}
          onRun={() => {
            setSessionModal(null);
            router.push(sessionModal.runUrl);
          }}
        />
      )}
    </div>
  );
}

// ── Sub-components ──────────────────────────────────────────

function FinalJeopardyEditor({
  question,
  onSave,
}: {
  question: { category: string; text: string; answer: string } | null;
  onSave: (data: { category: string; text: string; answer: string } | null) => Promise<void>;
}) {
  const [category, setCategory] = useState(question?.category ?? "");
  const [text, setText] = useState(question?.text ?? "");
  const [answer, setAnswer] = useState(question?.answer ?? "");
  const [saving, setSaving] = useState(false);

  async function handleSave() {
    if (!category.trim() || !text.trim() || !answer.trim()) {
      return;
    }
    setSaving(true);
    await onSave({ category: category.trim(), text: text.trim(), answer: answer.trim() });
    setSaving(false);
  }

  return (
    <div className="j-card p-6 space-y-5">
      <div className="flex items-center gap-2 mb-1">
        <Star className="w-4 h-4 text-[#FFDB58] fill-[#FFDB58]" />
        <h2 className="font-russo text-sm text-[#FFDB58] uppercase tracking-widest">Final Jeopardy</h2>
      </div>
      <p className="text-xs text-white/30 font-chakra -mt-3">
        Category shown during wagering. Question revealed after all wagers are placed.
      </p>

      <div className="space-y-1.5">
        <Label className="text-[10px] font-russo text-white/50 uppercase tracking-widest">Category</Label>
        <Input
          value={category}
          onChange={(e) => setCategory(e.target.value)}
          placeholder="e.g. World History"
          className="j-input font-chakra"
        />
      </div>

      <div className="space-y-1.5">
        <Label className="text-[10px] font-russo text-white/50 uppercase tracking-widest">Question</Label>
        <textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="This battle in 1815 ended Napoleon's rule..."
          rows={4}
          className="w-full rounded-lg px-3 py-2.5 text-sm font-chakra text-white bg-[#0A0A3E] border border-white/10 focus:border-[#FFDB58]/40 focus:outline-none focus:ring-0 resize-none placeholder:text-white/20 transition-colors"
        />
      </div>

      <div className="space-y-1.5">
        <Label className="text-[10px] font-russo text-white/50 uppercase tracking-widest">Answer</Label>
        <Input
          value={answer}
          onChange={(e) => setAnswer(e.target.value)}
          placeholder="The Battle of Waterloo"
          className="j-input font-chakra"
        />
      </div>

      <Button
        onClick={handleSave}
        disabled={saving || !category.trim() || !text.trim() || !answer.trim()}
        className="btn-gold h-10 px-6 rounded-lg font-russo uppercase tracking-widest text-sm disabled:opacity-40"
      >
        {saving ? "Saving..." : question ? "Update Final Jeopardy" : "Save Final Jeopardy"}
      </Button>
    </div>
  );
}

function SidebarToggle({
  label, enabled, onChange,
}: {
  label: string; enabled: boolean; onChange: (v: boolean) => void;
}) {
  return (
    <div
      onClick={() => onChange(!enabled)}
      className="flex items-center gap-2 cursor-pointer group"
    >
      <div className={`w-4 h-4 rounded border flex items-center justify-center flex-shrink-0 transition-all ${
        enabled ? "bg-[#FFDB58] border-[#FFDB58]" : "border-white/20 bg-transparent group-hover:border-white/40"
      }`}>
        {enabled && <Check className="w-2.5 h-2.5 text-[#191970]" />}
      </div>
      <span className="text-[10px] text-white/50 group-hover:text-white/70 font-chakra transition-colors">{label}</span>
    </div>
  );
}

function RoundItem({
  round, isSelected, onSelect, onDelete, onRename,
}: {
  round: Round & { categories: Category[] };
  isSelected: boolean;
  onSelect: () => void;
  onDelete: () => void;
  onRename: (name: string) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(round.name);

  function handleBlur() {
    setEditing(false);
    if (name.trim() && name !== round.name) onRename(name.trim());
  }

  return (
    <div
      className={`group flex items-center gap-1.5 px-2.5 py-2 rounded-lg cursor-pointer transition-all ${
        isSelected
          ? "bg-[#FFDB58]/10 border border-[#FFDB58]/25 shadow-[0_0_8px_rgba(255,219,88,0.1)]"
          : "hover:bg-white/5 border border-transparent"
      }`}
      onClick={() => { if (!editing) onSelect(); }}
    >
      {editing ? (
        <Input
          value={name}
          onChange={(e) => setName(e.target.value)}
          onBlur={handleBlur}
          onKeyDown={(e) => { if (e.key === "Enter") handleBlur(); if (e.key === "Escape") { setName(round.name); setEditing(false); } }}
          className="h-6 text-xs px-1.5 flex-1 j-input font-chakra"
          autoFocus
          onClick={(e) => e.stopPropagation()}
        />
      ) : (
        <>
          <ChevronRight className={`w-3 h-3 flex-shrink-0 transition-transform ${isSelected ? "rotate-90 text-[#FFDB58]" : "text-white/20"}`} />
          <span className={`text-xs font-russo uppercase tracking-wide truncate flex-1 ${isSelected ? "text-[#FFDB58]" : "text-white/60"}`}>{round.name}</span>
          <span className={`text-[10px] flex-shrink-0 font-chakra ${isSelected ? "text-[#FFDB58]/60" : "text-white/20"}`}>{round.categories.length}</span>
          <button onClick={(e) => { e.stopPropagation(); setEditing(true); }}
            className="opacity-0 group-hover:opacity-100 transition-opacity">
            <Pencil className="w-2.5 h-2.5 text-white/30 hover:text-white/70" />
          </button>
          <button onClick={(e) => { e.stopPropagation(); onDelete(); }}
            className="opacity-0 group-hover:opacity-100 transition-opacity">
            <Trash2 className="w-2.5 h-2.5 text-white/30 hover:text-red-400" />
          </button>
        </>
      )}
    </div>
  );
}

function CategoryColumn({
  category, onDeleteCategory, onRenameCategory, onAddQuestion, onEditQuestion, onDeleteQuestion,
}: {
  category: Category & { questions: Question[] };
  onDeleteCategory: () => void;
  onRenameCategory: (name: string) => void;
  onAddQuestion: () => void;
  onEditQuestion: (q: Question) => void;
  onDeleteQuestion: (id: string) => void;
}) {
  const [editingName, setEditingName] = useState(false);
  const [name, setName] = useState(category.name);

  function handleNameBlur() {
    setEditingName(false);
    if (name.trim() && name !== category.name) onRenameCategory(name.trim());
  }

  return (
    <div className="rounded-xl overflow-hidden border border-white/8 shadow-lg">
      <div className="p-3 group relative" style={{ background: "linear-gradient(180deg, #0A0A3E 0%, #0D1565 100%)" }}>
        <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-[#FFDB58]/30 to-transparent" />
        <div className="flex items-center justify-between gap-2">
          {editingName ? (
            <Input value={name} onChange={(e) => setName(e.target.value)}
              onBlur={handleNameBlur}
              onKeyDown={(e) => { if (e.key === "Enter") handleNameBlur(); }}
              className="h-7 text-xs j-input px-2 flex-1 font-russo uppercase tracking-wider"
              autoFocus />
          ) : (
            <h3 className="text-xs font-russo text-white uppercase tracking-widest truncate flex-1 cursor-pointer"
              onDoubleClick={() => setEditingName(true)}>
              {category.name}
            </h3>
          )}
          <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
            <button onClick={() => setEditingName(true)}>
              <Pencil className="w-2.5 h-2.5 text-white/50 hover:text-white" />
            </button>
            <button onClick={onDeleteCategory}>
              <Trash2 className="w-2.5 h-2.5 text-white/50 hover:text-red-400" />
            </button>
          </div>
        </div>
      </div>

      <div className="p-2 space-y-1.5 bg-[#0A0F35]">
        {category.questions.map((q) => (
          <QuestionTileAdmin key={q.id} question={q}
            onEdit={() => onEditQuestion(q)}
            onDelete={() => onDeleteQuestion(q.id)} />
        ))}
        <button onClick={onAddQuestion}
          className="w-full py-2.5 rounded-lg border border-dashed border-white/10 text-white/25 text-xs hover:border-[#FFDB58]/30 hover:text-[#FFDB58]/50 transition-all flex items-center justify-center gap-1 font-chakra">
          <Plus className="w-3 h-3" />
          Add Question
        </button>
      </div>
    </div>
  );
}

function QuestionTileAdmin({ question, onEdit, onDelete }: { question: Question; onEdit: () => void; onDelete: () => void }) {
  return (
    <div
      className="group flex items-center justify-between px-3 py-2 rounded-lg bg-white/3 hover:bg-[#0A0A3E]/30 cursor-pointer border border-transparent hover:border-[#FFDB58]/15 transition-all"
      onClick={onEdit}
    >
      <div className="flex items-center gap-2 min-w-0">
        <span className="text-sm font-russo text-[#FFDB58] flex-shrink-0">${question.points}</span>
        {question.is_double && <Star className="w-3 h-3 text-[#FFDB58] fill-[#FFDB58] flex-shrink-0" />}
        <span className="text-xs text-white/40 truncate font-chakra">{question.text || "No text set"}</span>
      </div>
      <button onClick={(e) => { e.stopPropagation(); onDelete(); }}
        className="opacity-0 group-hover:opacity-100 ml-2 flex-shrink-0">
        <Trash2 className="w-3 h-3 text-white/30 hover:text-red-400" />
      </button>
    </div>
  );
}

function QuestionEditor({ question: initialQ, onSave, onClose }: { question: Question; onSave: (q: Question) => void; onClose: () => void }) {
  const [q, setQ] = useState(initialQ);
  const [uploading, setUploading] = useState(false);
  const imageInputRef = useRef<HTMLInputElement>(null);
  const supabase = createClient();

  function update(fields: Partial<Question>) { setQ((prev) => ({ ...prev, ...fields })); }

  async function handleImageUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 10 * 1024 * 1024) {
      toast.error("Image must be under 10 MB");
      return;
    }
    setUploading(true);
    const ext = file.name.split(".").pop();
    const path = `${q.id}-${Date.now()}.${ext}`;
    const { error } = await supabase.storage.from("question-images").upload(path, file, { upsert: true });
    if (error) {
      toast.error("Image upload failed");
      setUploading(false);
      return;
    }
    const { data } = supabase.storage.from("question-images").getPublicUrl(path);
    update({ image_url: data.publicUrl });
    setUploading(false);
    e.target.value = "";
  }

  async function removeImage() {
    if (!q.image_url) return;
    const path = q.image_url.split("/question-images/")[1];
    if (path) await supabase.storage.from("question-images").remove([path]);
    update({ image_url: null });
  }

  return (
    <Dialog open onOpenChange={(open) => { if (!open) onClose(); }}>
      <DialogContent className="max-w-lg bg-[#0F1050] border-white/10 text-white">
        <DialogHeader>
          <DialogTitle className="font-russo text-white uppercase tracking-widest text-base">Edit Question</DialogTitle>
        </DialogHeader>
        <div className="space-y-4 mt-2">
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label className="text-xs font-russo text-white/50 uppercase tracking-wider">Point Value</Label>
              <Input type="number" value={q.points}
                onChange={(e) => update({ points: parseInt(e.target.value) || 0 })}
                className="j-input h-9 font-russo text-[#FFDB58]" min={0} step={100} />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs font-russo text-white/50 uppercase tracking-wider">Display Order</Label>
              <Input type="number" value={q.order}
                onChange={(e) => update({ order: parseInt(e.target.value) || 0 })}
                className="j-input h-9 font-chakra" min={0} />
            </div>
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs font-russo text-white/50 uppercase tracking-wider">Question Text</Label>
            <textarea value={q.text} onChange={(e) => update({ text: e.target.value })}
              placeholder="Enter the question text..."
              rows={3}
              className="w-full px-3 py-2.5 text-sm rounded-lg resize-none font-chakra bg-white/6 border border-white/12 text-white placeholder:text-white/30 focus:outline-none focus:ring-2 focus:ring-[#FFDB58]/20 focus:border-[#FFDB58]/50" />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs font-russo text-white/50 uppercase tracking-wider">Answer (host only)</Label>
            <Input value={q.answer} onChange={(e) => update({ answer: e.target.value })}
              placeholder="The correct answer..."
              className="j-input h-9 font-chakra" />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs font-russo text-white/50 uppercase tracking-wider">Image (optional)</Label>
            <input ref={imageInputRef} type="file" accept="image/*" className="hidden" onChange={handleImageUpload} />
            {q.image_url ? (
              <div className="relative rounded-lg overflow-hidden border border-white/10 bg-black/20">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={q.image_url} alt="Question image" className="w-full max-h-40 object-contain" />
                <button
                  onClick={removeImage}
                  className="absolute top-2 right-2 bg-black/60 hover:bg-black/80 text-white rounded-full p-1 transition-colors"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              </div>
            ) : (
              <button
                onClick={() => imageInputRef.current?.click()}
                disabled={uploading}
                className="w-full flex items-center justify-center gap-2 h-20 rounded-lg border border-dashed border-white/15 text-white/30 hover:border-white/30 hover:text-white/50 transition-colors disabled:opacity-50"
              >
                <ImageIcon className="w-4 h-4" />
                <span className="text-xs font-chakra">{uploading ? "Uploading…" : "Click to upload image"}</span>
              </button>
            )}
          </div>
          <div className="space-y-3 pt-1">
            <div
              className={`flex items-center gap-3 p-3 rounded-xl border cursor-pointer transition-all ${
                q.is_double ? "bg-[#FFDB58]/8 border-[#FFDB58]/30" : "bg-white/3 border-white/8 hover:border-white/15"
              }`}
              onClick={() => update({ is_double: !q.is_double, double_type: q.is_double ? null : "wagerable" })}
            >
              <Star className={`w-4 h-4 ${q.is_double ? "text-[#FFDB58] fill-[#FFDB58]" : "text-white/20"}`} />
              <div>
                <div className="text-sm font-russo text-white uppercase tracking-wider">Double Points</div>
                <div className="text-xs text-white/40 font-chakra">Team wagers points before the question</div>
              </div>
            </div>
            {q.is_double && (
              <div className="ml-3 space-y-2.5 p-3 bg-white/3 rounded-lg border border-white/8">
                <label className="flex items-center gap-2.5 cursor-pointer">
                  <input type="radio" checked={q.double_type === "wagerable"}
                    onChange={() => update({ double_type: "wagerable", double_max_wager: null })}
                    className="accent-[#FFDB58]" />
                  <span className="text-sm text-white/70 font-chakra">Team chooses wager (up to their score)</span>
                </label>
                <div className="flex items-center gap-3">
                  <label className="flex items-center gap-2.5 cursor-pointer">
                    <input type="radio" checked={q.double_type === "static_max"}
                      onChange={() => update({ double_type: "static_max" })}
                      className="accent-[#FFDB58]" />
                    <span className="text-sm text-white/70 font-chakra">Fixed max wager</span>
                  </label>
                  {q.double_type === "static_max" && (
                    <Input type="number" value={q.double_max_wager ?? ""}
                      onChange={(e) => update({ double_max_wager: parseInt(e.target.value) || null })}
                      placeholder="1000"
                      className="j-input h-8 w-24 text-sm font-russo text-[#FFDB58]" min={0} />
                  )}
                </div>
              </div>
            )}
          </div>
          <div className="flex justify-between pt-2">
            <Button variant="ghost" onClick={onClose} className="text-white/40 hover:text-white font-chakra">Cancel</Button>
            <Button onClick={() => onSave(q)} className="btn-gold h-9 px-5 rounded-lg text-sm">Save Question</Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function JsonImportModal({
  data, importing, onConfirm, onClose,
}: {
  data: ImportData;
  importing: boolean;
  onConfirm: () => void;
  onClose: () => void;
}) {
  const totalCats = data.rounds.reduce((s, r) => s + r.categories.length, 0);
  const totalQs = data.rounds.reduce((s, r) => s + r.categories.reduce((ss, c) => ss + c.questions.length, 0), 0);
  const doubles = data.rounds.reduce((s, r) =>
    s + r.categories.reduce((ss, c) => ss + c.questions.filter((q) => q.is_double).length, 0), 0);

  return (
    <Dialog open onOpenChange={(open) => { if (!open && !importing) onClose(); }}>
      <DialogContent className="max-w-md bg-[#0F1050] border-white/10 text-white">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 font-russo text-white uppercase tracking-widest text-base">
            <FileJson className="w-5 h-5 text-[#FFDB58]" />
            Import JSON
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4 mt-2">
          {/* Summary stats */}
          <div className="grid grid-cols-3 gap-2">
            {[
              { value: data.rounds.length, label: "Rounds" },
              { value: totalCats, label: "Categories" },
              { value: totalQs, label: "Questions" },
            ].map((s) => (
              <div key={s.label} className="bg-white/5 rounded-xl p-3 text-center border border-white/8">
                <div className="font-russo text-2xl text-[#FFDB58]">{s.value}</div>
                <div className="text-[10px] text-white/40 font-chakra uppercase tracking-wider mt-0.5">{s.label}</div>
              </div>
            ))}
          </div>

          {doubles > 0 && (
            <div className="flex items-center gap-2 text-xs text-[#FFDB58]/70 font-chakra">
              <Star className="w-3 h-3 fill-[#FFDB58] text-[#FFDB58]" />
              {doubles} double point question{doubles !== 1 ? "s" : ""}
            </div>
          )}
          {data.final_jeopardy && (
            <div className="flex items-start gap-2 rounded-lg bg-[#FFDB58]/6 border border-[#FFDB58]/20 px-3 py-2.5">
              <Star className="w-3 h-3 fill-[#FFDB58] text-[#FFDB58] mt-0.5 flex-shrink-0" />
              <div>
                <div className="text-xs font-russo text-[#FFDB58] uppercase tracking-wider">Final Jeopardy included</div>
                <div className="text-[10px] text-[#FFDB58]/60 font-chakra mt-0.5">Category: {data.final_jeopardy.category}</div>
              </div>
            </div>
          )}

          {/* Round list */}
          <div className="space-y-1.5 max-h-48 overflow-y-auto">
            {data.rounds.map((r, i) => (
              <div key={i} className="flex items-center justify-between px-3 py-2 rounded-lg bg-white/4 border border-white/8">
                <span className="text-xs font-russo text-white uppercase tracking-wider">{r.name}</span>
                <div className="flex items-center gap-2 text-[10px] text-white/30 font-chakra">
                  <span>{r.categories.length} cat</span>
                  <span>·</span>
                  <span>{r.categories.reduce((s, c) => s + c.questions.length, 0)} q</span>
                </div>
              </div>
            ))}
          </div>

          <p className="text-xs text-white/30 font-chakra">
            These rounds will be <span className="text-white/50">appended</span> to any existing rounds.
          </p>

          <div className="flex items-center justify-between pt-1">
            <Button variant="ghost" onClick={onClose} disabled={importing}
              className="text-white/40 hover:text-white font-chakra">Cancel</Button>
            <Button onClick={onConfirm} disabled={importing} className="btn-gold h-9 px-5 rounded-lg text-sm gap-2">
              <Upload className="w-3.5 h-3.5" />
              {importing ? "Importing..." : "Import"}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function SessionLaunchModal({ runUrl, boardUrl, onClose, onRun }: { runUrl: string; boardUrl: string; onClose: () => void; onRun: () => void }) {
  function copyToClipboard(text: string) {
    navigator.clipboard.writeText(text);
    toast.success("Copied to clipboard");
  }

  return (
    <Dialog open onOpenChange={(open) => { if (!open) onClose(); }}>
      <DialogContent className="max-w-lg bg-[#0F1050] border-white/10 text-white">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-[#228B22]/20 border border-[#228B22]/30 flex items-center justify-center">
              <Play className="w-3.5 h-3.5 text-[#228B22] fill-[#228B22]" />
            </div>
            <span className="font-russo text-white uppercase tracking-widest text-base">Session Live!</span>
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-4 mt-2">
          <p className="text-sm text-white/40 font-chakra">Open these URLs on the correct devices.</p>
          <div className="space-y-3">
            <UrlCard label="Presentation Board (TV / Main Screen)" url={boardUrl} onCopy={() => copyToClipboard(boardUrl)} />
            <UrlCard label="Host Controls (Phone / Second Device)" url={runUrl} onCopy={() => copyToClipboard(runUrl)} />
          </div>
          <div className="flex items-center justify-between pt-2">
            <Button variant="ghost" onClick={onClose} className="text-white/40 hover:text-white font-chakra">Close</Button>
            <Button onClick={onRun} className="btn-gold h-9 px-5 rounded-lg text-sm gap-2">
              Open Host Controls
              <ExternalLink className="w-3.5 h-3.5" />
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function UrlCard({ label, url, onCopy }: { label: string; url: string; onCopy: () => void }) {
  return (
    <div className="rounded-xl p-3 bg-white/4 border border-white/8">
      <div className="text-[10px] font-russo text-[#FFDB58]/60 uppercase tracking-widest mb-2">{label}</div>
      <div className="flex items-center gap-2">
        <code className="text-xs text-white/60 flex-1 break-all font-chakra bg-black/30 rounded px-2 py-1">{url}</code>
        <Button variant="ghost" size="sm" onClick={onCopy} className="h-7 w-7 p-0 flex-shrink-0 text-white/30 hover:text-[#FFDB58]">
          <Copy className="w-3.5 h-3.5" />
        </Button>
        <a href={url} target="_blank" rel="noopener noreferrer">
          <Button variant="ghost" size="sm" className="h-7 w-7 p-0 flex-shrink-0 text-white/30 hover:text-[#FFDB58]">
            <ExternalLink className="w-3.5 h-3.5" />
          </Button>
        </a>
      </div>
    </div>
  );
}
