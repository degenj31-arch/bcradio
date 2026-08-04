import { useCallback, useEffect, useState } from "react";
import { Star } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useI18n } from "@/lib/i18n";
import { toast } from "sonner";

const DEVICE_KEY = "bcradio.device";
const MAX_STARS = 4;
const MAX_RATED_SECONDS = 20 * 60;

function deviceId(): string {
  try {
    let id = localStorage.getItem(DEVICE_KEY);
    if (!id) {
      id = crypto.randomUUID();
      localStorage.setItem(DEVICE_KEY, id);
    }
    return id;
  } catch {
    return "anon";
  }
}

export function SongRating({
  songId,
  durationSeconds,
}: {
  songId: string;
  durationSeconds: number;
}) {
  const { t, nf } = useI18n();
  const [avg, setAvg] = useState<number | null>(null);
  const [count, setCount] = useState(0);
  const [mine, setMine] = useState<number | null>(null);
  const [hover, setHover] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);

  const eligible = durationSeconds > 0 && durationSeconds < MAX_RATED_SECONDS;

  const load = useCallback(async () => {
    const { data, error } = await supabase
      .from("song_ratings")
      .select("rating, device_id")
      .eq("song_id", songId);
    if (error || !data) return;
    if (data.length) {
      setAvg(data.reduce((s, r) => s + Number(r.rating), 0) / data.length);
      setCount(data.length);
    } else {
      setAvg(null);
      setCount(0);
    }
    const id = deviceId();
    const own = data.find((r) => r.device_id === id);
    setMine(own ? Number(own.rating) : null);
  }, [songId]);

  useEffect(() => {
    if (!eligible) return;
    setAvg(null); setCount(0); setMine(null); setHover(null);
    load();
  }, [eligible, load]);

  if (!eligible) return null;

  const submit = async (value: number) => {
    setBusy(true);
    try {
      const { error } = await supabase
        .from("song_ratings")
        .upsert({ song_id: songId, device_id: deviceId(), rating: value }, { onConflict: "song_id,device_id" });
      if (error) throw error;
      setMine(value);
      await load();
      toast.success(t("ratingSaved"));
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Rating failed");
    } finally {
      setBusy(false);
    }
  };

  const shown = hover ?? mine ?? 0;

  return (
    <div className="mt-5 flex flex-col items-center gap-2">
      <div className="text-[10px] font-mono uppercase tracking-widest text-muted-foreground">
        {t("rateThisSong")}
      </div>

      <div className="flex items-center gap-1" onMouseLeave={() => setHover(null)}>
        {Array.from({ length: MAX_STARS }).map((_, i) => {
          const full = i + 1;
          const half = i + 0.5;
          const fill = Math.max(0, Math.min(1, shown - i)) * 100;
          return (
            <span key={i} className="relative w-8 h-8 sm:w-9 sm:h-9">
              <Star className="absolute inset-0 w-full h-full text-muted-foreground/50" />
              <span
                className="absolute inset-0 overflow-hidden transition-[width] duration-150"
                style={{ width: `${fill}%` }}
              >
                <Star className="w-8 h-8 sm:w-9 sm:h-9 text-amber fill-amber" />
              </span>
              <button
                type="button"
                disabled={busy}
                aria-label={`${half} stars`}
                onMouseEnter={() => setHover(half)}
                onClick={() => submit(half)}
                className="absolute left-0 top-0 h-full w-1/2 cursor-pointer disabled:cursor-wait"
              />
              <button
                type="button"
                disabled={busy}
                aria-label={`${full} stars`}
                onMouseEnter={() => setHover(full)}
                onClick={() => submit(full)}
                className="absolute right-0 top-0 h-full w-1/2 cursor-pointer disabled:cursor-wait"
              />
            </span>
          );
        })}
      </div>

      <div className="text-xs font-mono text-muted-foreground text-center">
        {avg != null ? (
          <>
            <span className="text-amber">{t("publicRating")}: {nf(avg, { minimumFractionDigits: 1, maximumFractionDigits: 1 })}/4</span>
            {" · "}
            {t("ratingsCount", { n: nf(count) })}
          </>
        ) : (
          t("noRatings")
        )}
        {mine != null && (
          <> · {t("yourRating")}: {nf(mine, { minimumFractionDigits: 1, maximumFractionDigits: 1 })}</>
        )}
      </div>
    </div>
  );
}
