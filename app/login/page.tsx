"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";

export default function LoginPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const router = useRouter();

  async function handleLogin(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);

    try {
      const supabase = createClient();
      const { error } = await supabase.auth.signInWithPassword({
        email,
        password,
      });

      if (error) {
        toast.error(error.message);
        return;
      }

      router.push("/admin/dashboard");
      router.refresh();
    } catch {
      toast.error("Login failed. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-[#191970]">
      <div className="w-full max-w-md px-6">
        {/* Logo / Title */}
        <div className="text-center mb-10">
          <div className="inline-block mb-4">
            <div className="w-16 h-16 rounded-2xl bg-[#FFDB58] flex items-center justify-center mx-auto mb-4">
              <span className="text-3xl font-black text-[#191970]">J</span>
            </div>
          </div>
          <h1 className="text-4xl font-black text-white tracking-tight">
            JEOPARDY<span className="text-[#FFDB58]">HOST</span>
          </h1>
          <p className="text-white/50 mt-2 text-sm">Sign in to manage your games</p>
        </div>

        {/* Card */}
        <div className="bg-white/5 border border-white/10 rounded-2xl p-8 backdrop-blur-sm">
          <form onSubmit={handleLogin} className="space-y-5">
            <div className="space-y-2">
              <Label htmlFor="email" className="text-white/80 text-sm font-medium">
                Email
              </Label>
              <Input
                id="email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@example.com"
                required
                className="bg-white/5 border-white/20 text-white placeholder:text-white/30 focus:border-[#FFDB58] focus:ring-[#FFDB58]/20 h-11"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="password" className="text-white/80 text-sm font-medium">
                Password
              </Label>
              <Input
                id="password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                required
                className="bg-white/5 border-white/20 text-white placeholder:text-white/30 focus:border-[#FFDB58] focus:ring-[#FFDB58]/20 h-11"
              />
            </div>

            <Button
              type="submit"
              disabled={loading}
              className="w-full h-11 bg-[#FFDB58] hover:bg-[#FFE680] text-[#191970] font-bold text-base transition-all"
            >
              {loading ? "Signing in..." : "Sign In"}
            </Button>
          </form>
        </div>
      </div>
    </div>
  );
}
