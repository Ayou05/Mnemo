"use client";

import { useEffect, useState } from "react";

interface ConfettiPiece {
  id: number;
  left: number;
  color: string;
  delay: number;
  duration: number;
  size: number;
}

const COLORS = [
  "oklch(0.723 0.219 149)",  // green
  "oklch(0.541 0.281 293)",  // indigo
  "oklch(0.606 0.25 280)",   // violet
  "oklch(0.795 0.184 86)",   // yellow
  "oklch(0.7 0.2 20)",       // orange
  "oklch(0.65 0.2 340)",     // pink
];

export function Confetti({ active }: { active: boolean }) {
  const [pieces, setPieces] = useState<ConfettiPiece[]>([]);

  useEffect(() => {
    if (!active) {
      setPieces([]);
      return;
    }

    const newPieces: ConfettiPiece[] = Array.from({ length: 40 }, (_, i) => ({
      id: i,
      left: Math.random() * 100,
      color: COLORS[Math.floor(Math.random() * COLORS.length)],
      delay: Math.random() * 0.5,
      duration: 1.5 + Math.random() * 2,
      size: 6 + Math.random() * 6,
    }));
    setPieces(newPieces);

    const timer = setTimeout(() => setPieces([]), 4000);
    return () => clearTimeout(timer);
  }, [active]);

  if (pieces.length === 0) return null;

  return (
    <>
      {pieces.map((p) => (
        <div
          key={p.id}
          className="confetti-piece"
          style={{
            left: `${p.left}%`,
            backgroundColor: p.color,
            animationDelay: `${p.delay}s`,
            animationDuration: `${p.duration}s`,
            width: p.size,
            height: p.size,
            borderRadius: Math.random() > 0.5 ? "50%" : "2px",
          }}
        />
      ))}
    </>
  );
}

export function StreakMilestone({ milestone }: { milestone: string | null }) {
  if (!milestone) return null;

  return (
    <div className="fixed inset-0 flex items-center justify-center z-50 pointer-events-none">
      <div className="streak-pop text-center">
        <div className="text-6xl font-black bg-gradient-to-r from-amber-400 via-orange-500 to-red-500 bg-clip-text text-transparent drop-shadow-lg">
          {milestone}
        </div>
        <div className="text-lg font-bold text-amber-500 mt-1">
          🔥 连击达成！
        </div>
      </div>
    </div>
  );
}

export function ScoreDelta({ delta }: { delta: number }) {
  if (!delta || delta === 0) return null;

  return (
    <div className="score-delta absolute -top-2 right-0 text-sm font-bold text-emerald-500">
      +{delta}
    </div>
  );
}
