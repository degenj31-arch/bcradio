import { useEffect, useMemo, useState } from "react";

/**
 * The tune-in ceremony: a mechanical radio dial that spins up, hunts across the
 * band, overshoots, and finally locks onto the target frequency. Everything is
 * CSS/SVG — no assets, no audio.
 */
export function TuningDial({
  frequency,
  color = "#f59e0b",
  label,
}: {
  frequency: number;
  color?: string;
  label?: string;
}) {
  const [phase, setPhase] = useState<"spin" | "hunt" | "lock">("spin");
  const [readout, setReadout] = useState(88.1);

  // Ticker of frequencies scanning toward the target.
  useEffect(() => {
    let raf = 0;
    const start = performance.now();
    const from = 87.5;
    const to = frequency;
    const tick = (t: number) => {
      const p = Math.min(1, (t - start) / 1900);
      // ease-out with a little overshoot wobble
      const eased = 1 - Math.pow(1 - p, 3);
      const wobble = p < 1 ? Math.sin(p * 26) * (1 - p) * 1.6 : 0;
      setReadout(from + (to - from) * eased + wobble);
      if (p < 1) raf = requestAnimationFrame(tick);
      else setReadout(to);
    };
    raf = requestAnimationFrame(tick);
    const t1 = setTimeout(() => setPhase("hunt"), 700);
    const t2 = setTimeout(() => setPhase("lock"), 1750);
    return () => { cancelAnimationFrame(raf); clearTimeout(t1); clearTimeout(t2); };
  }, [frequency]);

  const ticks = useMemo(() => Array.from({ length: 60 }, (_, i) => i), []);
  const bands = useMemo(() => Array.from({ length: 14 }, (_, i) => 87.9 + i * 0.8), []);

  return (
    <div className="tune-stage relative mx-auto w-full max-w-sm select-none" data-phase={phase}>
      <div className="tune-halo pointer-events-none absolute inset-0" style={{ ["--dial" as string]: color }} />

      {/* Rotating dial face */}
      <div className="relative mx-auto aspect-square w-56 sm:w-64">
        <div className="tune-ring absolute inset-0 rounded-full" style={{ ["--dial" as string]: color }} />
        <div className="tune-ring-2 absolute inset-3 rounded-full" />

        {/* tick marks */}
        <div className="tune-rotor absolute inset-0">
          {ticks.map((i) => {
            const major = i % 5 === 0;
            return (
              <span
                key={i}
                className="absolute left-1/2 top-1/2 origin-top"
                style={{
                  height: major ? 18 : 10,
                  width: major ? 2 : 1,
                  background: major ? color : "oklch(0.7 0.03 75 / 45%)",
                  transform: `rotate(${i * 6}deg) translate(-50%, -50%) translateY(-104px)`,
                  opacity: major ? 0.95 : 0.5,
                }}
              />
            );
          })}
        </div>

        {/* sweeping needle */}
        <div className="tune-needle absolute inset-0">
          <span
            className="absolute left-1/2 top-1/2 block w-[3px] rounded-full"
            style={{
              height: 104,
              marginLeft: -1.5,
              marginTop: -104,
              background: `linear-gradient(to top, transparent, ${color})`,
              boxShadow: `0 0 14px ${color}`,
            }}
          />
        </div>

        {/* sweep cone */}
        <div className="tune-sweep absolute inset-0 rounded-full" style={{ ["--dial" as string]: color }} />

        {/* knob hub */}
        <div className="station-knob tune-hub absolute left-1/2 top-1/2 h-16 w-16 -translate-x-1/2 -translate-y-1/2 rounded-full" />

        {/* readout */}
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <div
            className="font-display text-3xl sm:text-4xl leading-none dial-glow tabular-nums"
            style={{ color }}
          >
            {readout.toFixed(1)}
          </div>
          <div className="mt-1 font-mono text-[9px] uppercase tracking-[0.35em] text-muted-foreground">
            {phase === "lock" ? "locked" : phase === "hunt" ? "hunting" : "spinning"}
          </div>
        </div>
      </div>

      {/* linear band scale under the dial */}
      <div className="tune-band relative mt-5 h-10 overflow-hidden rounded-md border border-border bg-panel/70">
        <div className="tune-band-strip absolute inset-y-0 flex items-center gap-6 px-4 font-mono text-[10px] text-muted-foreground">
          {bands.concat(bands).map((b, i) => (
            <span key={i} className="flex flex-col items-center gap-1">
              <span className="h-3 w-px bg-border" />
              {b.toFixed(1)}
            </span>
          ))}
        </div>
        <div
          className="tune-band-marker absolute inset-y-0 left-1/2 w-[2px]"
          style={{ background: color, boxShadow: `0 0 12px ${color}` }}
        />
        <div className="tune-scan pointer-events-none absolute inset-0" />
      </div>

      <div className="mt-3 text-center font-mono text-[10px] uppercase tracking-[0.3em] text-muted-foreground">
        {phase === "lock" ? `signal locked${label ? " · " + label : ""}` : "acquiring carrier…"}
      </div>
      <div className="mt-2 flex justify-center gap-1" aria-hidden>
        {Array.from({ length: 12 }).map((_, i) => (
          <span
            key={i}
            className="tune-meter h-3 w-1 rounded-sm"
            style={{ background: color, animationDelay: `${i * 0.06}s` }}
          />
        ))}
      </div>
    </div>
  );
}
