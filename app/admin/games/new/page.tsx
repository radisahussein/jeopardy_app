"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { ArrowLeft } from "lucide-react";
import { Game } from "@/lib/types";

export default function NewGamePage() {
  const router = useRouter();
  const [title, setTitle] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleCreate() {
    if (!title.trim()) return;
    setLoading(true);
    try {
      const supabase = createClient();
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Not authenticated");

      const { data: game, error: gameError } = await supabase
        .from("games")
        .insert({
          admin_id: user.id,
          title: title.trim(),
          wrong_answer_penalty: true,
          final_jeopardy_enabled: false,
        })
        .select()
        .single() as { data: Game | null; error: unknown };

      if (gameError || !game) throw gameError ?? new Error("Failed to create game");

      const { error: roundError } = await supabase
        .from("rounds")
        .insert({ game_id: game.id, name: "Round 1", order: 0 });

      if (roundError) throw roundError;

      toast.success("Game created!");
      router.push(`/admin/games/${game.id}`);
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Failed to create game");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="max-w-md mx-auto">
      <div className="flex items-center gap-3 mb-8">
        <Button variant="ghost" size="sm" onClick={() => router.back()}
          className="text-white/40 hover:text-white hover:bg-white/5 gap-1.5 -ml-2 font-chakra">
          <ArrowLeft className="w-4 h-4" />
          Back
        </Button>
        <div className="h-4 w-px bg-white/15" />
        <h1 className="font-russo text-xl text-white uppercase tracking-widest">New Game</h1>
      </div>

      <div className="j-card p-7 space-y-6">
        <div>
          <h2 className="font-russo text-base text-[#FFDB58] uppercase tracking-widest mb-1">Game Title</h2>
          <p className="text-white/40 text-sm font-chakra">Configure teams, rules, and questions after creation.</p>
        </div>

        <div className="space-y-2">
          <Label className="text-white/70 text-xs font-chakra uppercase tracking-wider">Title</Label>
          <Input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") handleCreate(); }}
            placeholder="e.g. Office Trivia Night"
            className="j-input h-11 font-chakra"
            autoFocus
          />
        </div>

        <div className="flex justify-end">
          <Button onClick={handleCreate} disabled={!title.trim() || loading}
            className="btn-gold h-10 px-6 text-sm rounded-lg">
            {loading ? "Creating..." : "Create Game"}
          </Button>
        </div>
      </div>
    </div>
  );
}
