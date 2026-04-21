"use client";

import { useEffect, useState } from "react";

export function TimedCountdown({ seconds = 5, onComplete }: { seconds?: number; onComplete: () => void }) {
  const [remaining, setRemaining] = useState(seconds);

  useEffect(() => {
    setRemaining(seconds);
    const interval = setInterval(() => {
      setRemaining((prev) => {
        if (prev <= 1) {
          clearInterval(interval);
          onComplete();
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
    return () => clearInterval(interval);
  }, [seconds, onComplete]);

  return (
    <div className="flex items-center gap-1.5">
      <svg className="w-5 h-5 -rotate-90" viewBox="0 0 20 20">
        <circle
          cx="10" cy="10" r="8"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          className="text-muted-foreground/20"
        />
        <circle
          cx="10" cy="10" r="8"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeDasharray={`${(remaining / seconds) * 50.27} 50.27`}
          strokeLinecap="round"
          className="text-amber-500 transition-all duration-1000"
        />
      </svg>
      <span className="text-xs font-mono text-amber-500 tabular-nums">{remaining}s</span>
    </div>
  );
}
