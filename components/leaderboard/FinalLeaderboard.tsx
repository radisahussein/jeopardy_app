"use client";

import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import { Game, SessionTeam, Team } from "@/lib/types";
import { formatDollars } from "@/lib/game-utils";
import { Trophy, Medal, Star } from "lucide-react";

type SessionTeamWithTeam = SessionTeam & { team: Team };

type Props = {
  game: Game;
  sessionTeams: SessionTeamWithTeam[];
  sessionId: string;
};

export default function FinalLeaderboard({ game, sessionTeams, sessionId }: Props) {
  const [show, setShow] = useState(false);

  useEffect(() => {
    const t = setTimeout(() => setShow(true), 300);
    return () => clearTimeout(t);
  }, []);

  const [first, second, third, ...rest] = sessionTeams;

  return (
    <div
      className="min-h-screen w-full flex flex-col items-center justify-center px-6 py-10 relative overflow-hidden"
      style={{ background: "linear-gradient(135deg, #191970 0%, #0F1050 50%, #191970 100%)" }}
    >
      {/* Background stars */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        {Array.from({ length: 30 }).map((_, i) => (
          <motion.div
            key={i}
            className="absolute w-1 h-1 bg-white rounded-full"
            style={{
              left: `${Math.random() * 100}%`,
              top: `${Math.random() * 100}%`,
              opacity: Math.random() * 0.5 + 0.1,
            }}
            animate={{ opacity: [0.1, 0.6, 0.1] }}
            transition={{
              duration: Math.random() * 3 + 2,
              repeat: Infinity,
              delay: Math.random() * 3,
            }}
          />
        ))}
      </div>

      {/* Title */}
      <motion.div
        initial={{ opacity: 0, y: -30 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.6 }}
        className="text-center mb-10"
      >
        <div className="flex items-center justify-center gap-3 mb-2">
          <Trophy className="w-10 h-10 text-[#FFDB58]" />
          <h1 className="text-5xl font-black text-white tracking-tight">
            FINAL SCORES
          </h1>
          <Trophy className="w-10 h-10 text-[#FFDB58]" />
        </div>
        <p className="text-[#FFDB58]/60 font-medium tracking-widest uppercase text-sm">
          {game.title}
        </p>
      </motion.div>

      {/* Podium (top 3) */}
      {show && sessionTeams.length >= 1 && (
        <div className="flex items-end justify-center gap-4 mb-10 w-full max-w-2xl">
          {/* 2nd place */}
          {second && (
            <motion.div
              initial={{ opacity: 0, y: 50 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.6, duration: 0.5 }}
              className="flex flex-col items-center flex-1"
            >
              <div
                className="w-12 h-12 rounded-full mb-3 flex items-center justify-center text-white font-black text-lg border-2 border-white/20"
                style={{ backgroundColor: second.team?.color }}
              >
                2
              </div>
              <div className="text-white font-bold text-sm text-center mb-1">{second.team?.name}</div>
              <div className="text-[#FFDB58] font-black text-xl">{formatDollars(second.score)}</div>
              <div
                className="mt-3 w-full rounded-t-lg flex items-end justify-center"
                style={{ height: 90, background: "linear-gradient(to top, #0A0A3E, #2a35a0)" }}
              >
                <Medal className="w-6 h-6 text-white/60 mb-3" />
              </div>
            </motion.div>
          )}

          {/* 1st place */}
          {first && (
            <motion.div
              initial={{ opacity: 0, y: 80 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.2, duration: 0.6, type: "spring", damping: 12 }}
              className="flex flex-col items-center flex-1"
            >
              <motion.div
                animate={{ rotate: [-5, 5, -5, 5, 0] }}
                transition={{ delay: 0.8, duration: 0.5 }}
              >
                <Star className="w-8 h-8 text-[#FFDB58] fill-[#FFDB58] mx-auto mb-2" />
              </motion.div>
              <div
                className="w-14 h-14 rounded-full mb-3 flex items-center justify-center text-white font-black text-xl border-2 border-[#FFDB58]"
                style={{ backgroundColor: first.team?.color }}
              >
                1
              </div>
              <div className="text-white font-bold text-base text-center mb-1">{first.team?.name}</div>
              <div className="text-[#FFDB58] font-black text-2xl">{formatDollars(first.score)}</div>
              <div
                className="mt-3 w-full rounded-t-lg flex items-end justify-center"
                style={{ height: 130, background: "linear-gradient(to top, #FFDB58, #FFD54F)" }}
              >
                <Trophy className="w-8 h-8 text-white/80 mb-3" />
              </div>
            </motion.div>
          )}

          {/* 3rd place */}
          {third && (
            <motion.div
              initial={{ opacity: 0, y: 50 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.9, duration: 0.5 }}
              className="flex flex-col items-center flex-1"
            >
              <div
                className="w-12 h-12 rounded-full mb-3 flex items-center justify-center text-white font-black text-lg border-2 border-white/20"
                style={{ backgroundColor: third.team?.color }}
              >
                3
              </div>
              <div className="text-white font-bold text-sm text-center mb-1">{third.team?.name}</div>
              <div className="text-[#FFDB58] font-black text-xl">{formatDollars(third.score)}</div>
              <div
                className="mt-3 w-full rounded-t-lg flex items-end justify-center"
                style={{ height: 60, background: "linear-gradient(to top, #0A0A3E, #2a35a0)" }}
              >
                <Medal className="w-5 h-5 text-white/60 mb-2" />
              </div>
            </motion.div>
          )}
        </div>
      )}

      {/* Remaining teams */}
      {rest.length > 0 && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 1.2 }}
          className="w-full max-w-md space-y-2"
        >
          {rest.map((st, i) => (
            <div
              key={st.id}
              className="flex items-center justify-between px-4 py-3 rounded-xl"
              style={{ backgroundColor: "rgba(255,255,255,0.05)", borderLeft: `3px solid ${st.team?.color}` }}
            >
              <div className="flex items-center gap-3">
                <span className="text-white/30 text-sm font-bold w-5">{i + 4}</span>
                <span className="text-white/70 text-sm font-medium">{st.team?.name}</span>
              </div>
              <span className="text-[#FFDB58] font-bold">{formatDollars(st.score)}</span>
            </div>
          ))}
        </motion.div>
      )}

      {/* Footer */}
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 1.5 }}
        className="mt-12 text-center"
      >
        <p className="text-white/20 text-xs tracking-widest uppercase">
          Thanks for playing · JeopardyHost
        </p>
      </motion.div>
    </div>
  );
}
