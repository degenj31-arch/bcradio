import { useEffect, useState } from "react";
import { isOffAir, msUntilOffAir } from "@/lib/youtube";
import { Moon, RadioTower } from "lucide-react";

const WINDOW_MS = 10 * 60 * 1000;

/**
 * Feature 20 — final countdown to sign-off.
 * Appears only in the last 10 minutes before the 10:00 PM ET silent hours.
 */
export function SignOffCountdown({ compact = false }: { compact?: boolean }) {
  const [ms, setMs] = useState(() => (isOffAir() ? Infinity : msUntilOffAir()));

  useEffect(() => {
    const id = setInterval(() => setMs(isOffAir() ? Infinity : msUntilOffAir()), 250);
    return () => clearInterval(id);
  }, []);

  if (!Number.isFinite(ms) || ms > WINDOW_MS) return null;

  const total = Math.max(0, Math.floor(ms / 1000));
  const mm = String(Math.floor(total / 60)).padStart(2, "0");
  const ss = String(total % 60).padStart(2, "0");
  const urgent = total <= 60;

  return (
    <div
      className={`signoff-shell relative overflow-hidden rounded-xl border px-4 ${
        compact ? "py-3" : "py-5"
      } text-center`}
      role="timer"
      aria-live="off"
    >
      <div className="signoff-scan pointer-events-none absolute inset-0" aria-hidden />
      <div className="relative flex items-center justify-center gap-2 text-[10px] sm:text-[11px] font-mono uppercase tracking-[0.28em] signoff-label">
        <RadioTower className="w-3.5 h-3.5" />
        Sign-off in
        <Moon className="w-3.5 h-3.5" />
      </div>
      <div
        className={`relative font-display leading-none tabular-nums signoff-digits ${
          urgent ? "signoff-urgent" : ""
        } ${compact ? "text-5xl sm:text-6xl mt-1" : "text-6xl sm:text-7xl md:text-8xl mt-2"}`}
      >
        {mm}
        <span className="signoff-colon">:</span>
        {ss}
      </div>
      <div className="relative mt-2 text-[10px] sm:text-xs font-mono text-muted-foreground">
        BCradio goes dark at 10:00 PM ET · silent hours until 7:00 AM
      </div>
      <div className="relative mt-3 h-1 rounded-full overflow-hidden bg-background/60">
        <div
          className="h-full signoff-bar transition-[width] duration-250 ease-linear"
          style={{ width: `${Math.max(0, Math.min(100, (ms / WINDOW_MS) * 100))}%` }}
        />
      </div>
    </div>
  );
}
