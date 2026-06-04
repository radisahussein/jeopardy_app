"use client";

import { useRouter } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { LogOut, LayoutDashboard } from "lucide-react";

export default function AdminNav({ userEmail }: { userEmail: string }) {
  const router = useRouter();

  async function handleSignOut() {
    const supabase = createClient();
    await supabase.auth.signOut();
    router.push("/login");
    router.refresh();
  }

  return (
    <header className="sticky top-0 z-50 border-b border-white/10"
      style={{ background: "linear-gradient(180deg, #1C1C80 0%, #191970 100%)" }}>
      {/* Gold top accent line */}
      <div className="h-[2px] bg-gradient-to-r from-transparent via-[#FFDB58] to-transparent" />

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-14">
          {/* Logo */}
          <Link href="/admin/dashboard" className="flex items-center gap-3 group">
            <div className="w-8 h-8 rounded-lg bg-[#FFDB58] flex items-center justify-center shadow-[0_0_12px_rgba(255,219,88,0.4)] transition-all group-hover:shadow-[0_0_20px_rgba(255,219,88,0.6)]">
              <span className="text-xs font-russo text-[#191970] tracking-wider">J</span>
            </div>
            <div className="flex items-baseline gap-1">
              <span className="font-russo text-white text-sm tracking-widest uppercase">Jeopardy</span>
              <span className="font-russo text-[#FFDB58] text-sm tracking-widest uppercase">Host</span>
            </div>
          </Link>

          {/* Nav */}
          <nav className="flex items-center gap-2">
            <Link
              href="/admin/dashboard"
              className="flex items-center gap-1.5 text-white/50 hover:text-[#FFDB58] text-xs font-chakra font-medium uppercase tracking-wider px-3 py-1.5 rounded-lg hover:bg-white/5 transition-all"
            >
              <LayoutDashboard className="w-3.5 h-3.5" />
              Dashboard
            </Link>

            <div className="w-px h-4 bg-white/15 mx-1" />

            <span className="text-white/30 text-xs hidden sm:block font-chakra">{userEmail}</span>

            <Button
              variant="ghost"
              size="sm"
              onClick={handleSignOut}
              className="text-white/40 hover:text-red-400 hover:bg-red-500/10 h-8 w-8 p-0 ml-1"
            >
              <LogOut className="w-3.5 h-3.5" />
            </Button>
          </nav>
        </div>
      </div>
    </header>
  );
}
