import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Music4, Send, Trash2, X, Loader2, RefreshCw, Radio } from "lucide-react";
import { toast } from "sonner";

export type SongRequest = {
  id: string;
  title: string;
  artist: string | null;
  requester: string | null;
  created_at: string;
};

export type StationRequest = {
  id: string;
  name: string;
  number: number | string | null;
  genre: string | null;
  songs: string | null;
  note: string | null;
  requester: string | null;
  created_at: string;
};

export function RequestsPanel({
  open,
  onClose,
  adminMode,
}: {
  open: boolean;
  onClose: () => void;
  adminMode: boolean;
}) {
  const [tab, setTab] = useState<"song" | "station">("song");
  const [requests, setRequests] = useState<SongRequest[]>([]);
  const [stationReqs, setStationReqs] = useState<StationRequest[]>([]);
  const [sending, setSending] = useState(false);
  const [lastSync, setLastSync] = useState<Date | null>(null);

  const load = useCallback(async () => {
    const [songs, stations] = await Promise.all([
      supabase.from("song_requests").select("*").order("created_at", { ascending: false }).limit(100),
      supabase.from("station_requests").select("*").order("created_at", { ascending: false }).limit(100),
    ]);
    if (songs.error) console.error("[requests]", songs.error);
    else setRequests((songs.data ?? []) as SongRequest[]);
    if (stations.error) console.error("[station-requests]", stations.error);
    else setStationReqs((stations.data ?? []) as StationRequest[]);
    setLastSync(new Date());
  }, []);

  // Refresh every 10 seconds while the box is open.
  useEffect(() => {
    if (!open) return;
    load();
    const id = setInterval(load, 10_000);
    return () => clearInterval(id);
  }, [open, load]);

  if (!open) return null;

  const submitSong = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const form = e.currentTarget;
    const fd = new FormData(form);
    const title = String(fd.get("title") || "").trim().slice(0, 120);
    const artist = String(fd.get("artist") || "").trim().slice(0, 120) || null;
    const requester = String(fd.get("requester") || "").trim().slice(0, 60) || null;
    if (!title) return toast.error("Song title required");
    if (!artist) return toast.error("Artist required");
    setSending(true);
    const { error } = await supabase.from("song_requests").insert({ title, artist, requester });
    setSending(false);
    if (error) return toast.error(error.message);
    toast.success("Request sent to the studio");
    form.reset();
    load();
  };

  const submitStation = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const form = e.currentTarget;
    const fd = new FormData(form);
    const name = String(fd.get("name") || "").trim().slice(0, 80);
    const numRaw = String(fd.get("number") || "").trim();
    const number = numRaw ? Number(numRaw) : null;
    const genre = String(fd.get("genre") || "").trim().slice(0, 80) || null;
    const songs = String(fd.get("songs") || "").trim().slice(0, 600) || null;
    const note = String(fd.get("note") || "").trim().slice(0, 400) || null;
    const requester = String(fd.get("requester") || "").trim().slice(0, 60) || null;
    if (!name) return toast.error("Station name required");
    if (number != null && (!isFinite(number) || number < 87 || number > 108)) {
      return toast.error("Dial number must be between 87.0 and 108.0");
    }
    setSending(true);
    const { error } = await supabase
      .from("station_requests")
      .insert({ name, number, genre, songs, note, requester });
    setSending(false);
    if (error) return toast.error(error.message);
    toast.success("Station pitch sent to the studio");
    form.reset();
    load();
  };

  const removeSong = async (r: SongRequest) => {
    const { error } = await supabase.from("song_requests").delete().eq("id", r.id);
    if (error) return toast.error(error.message);
    setRequests((prev) => prev.filter((x) => x.id !== r.id));
  };

  const removeStation = async (r: StationRequest) => {
    const { error } = await supabase.from("station_requests").delete().eq("id", r.id);
    if (error) return toast.error(error.message);
    setStationReqs((prev) => prev.filter((x) => x.id !== r.id));
  };

  const inputCls = "bg-input border border-border rounded-md px-3 py-2 text-sm";

  return (
    <div className="fixed inset-0 z-40 flex items-end sm:items-center justify-center bg-background/80 backdrop-blur-sm p-0 sm:p-4">
      <div className="panel relative w-full max-w-2xl max-h-[92vh] overflow-y-auto p-4 sm:p-6 animate-scale-in">
        <button
          onClick={onClose}
          className="absolute right-3 top-3 p-2 rounded-md text-muted-foreground hover:text-foreground hover:bg-accent"
          aria-label="Close requests"
        >
          <X className="w-5 h-5" />
        </button>

        <div className="flex items-center gap-2">
          <Music4 className="w-5 h-5 text-amber" />
          <h3 className="font-display text-2xl dial-glow">Request Line</h3>
        </div>
        <p className="mt-1 text-xs text-muted-foreground">
          Ask for a song, or pitch a whole new station. Live board — refreshes every 10 seconds.
        </p>

        <div className="mt-4 flex gap-2">
          <button
            type="button"
            onClick={() => setTab("song")}
            className={`text-xs px-3 py-1.5 rounded-md border inline-flex items-center gap-1.5 ${
              tab === "song" ? "bg-amber/20 text-amber border-amber/40" : "bg-card border-border text-muted-foreground"
            }`}
          >
            <Music4 className="w-3.5 h-3.5" /> Song request
          </button>
          <button
            type="button"
            onClick={() => setTab("station")}
            className={`text-xs px-3 py-1.5 rounded-md border inline-flex items-center gap-1.5 ${
              tab === "station" ? "bg-amber/20 text-amber border-amber/40" : "bg-card border-border text-muted-foreground"
            }`}
          >
            <Radio className="w-3.5 h-3.5" /> Station request
          </button>
        </div>

        {tab === "song" ? (
          <form onSubmit={submitSong} className="mt-3 space-y-3 rounded-md border border-border bg-card/40 p-3 sm:p-4">
            <div className="grid sm:grid-cols-2 gap-3">
              <input name="title" placeholder="Song title" required maxLength={120} className={inputCls} />
              <input name="artist" placeholder="Artist" required maxLength={120} className={inputCls} />
            </div>
            <input name="requester" placeholder="Your name (optional)" maxLength={60} className={`w-full ${inputCls}`} />
            <button type="submit" disabled={sending}
              className="px-4 py-2 rounded-md bg-amber text-primary-foreground text-sm font-medium inline-flex items-center gap-2 disabled:opacity-60">
              {sending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
              {sending ? "Sending…" : "Send request"}
            </button>
          </form>
        ) : (
          <form onSubmit={submitStation} className="mt-3 space-y-3 rounded-md border border-border bg-card/40 p-3 sm:p-4">
            <div className="grid sm:grid-cols-2 gap-3">
              <input name="name" placeholder="Station name (e.g. Midnight Jazz)" required maxLength={80} className={inputCls} />
              <input name="number" type="number" step="0.1" min="87" max="108" placeholder="Dial number (e.g. 96.3)" className={`${inputCls} font-mono`} />
            </div>
            <input name="genre" placeholder="Genre / vibe (e.g. lo-fi jazz for late nights)" maxLength={80} className={`w-full ${inputCls}`} />
            <textarea name="songs" rows={3} maxLength={600}
              placeholder="Songs it should play (one per line, or comma separated)"
              className={`w-full ${inputCls} resize-y`} />
            <textarea name="note" rows={2} maxLength={400}
              placeholder="Anything else the studio should know (optional)"
              className={`w-full ${inputCls} resize-y`} />
            <input name="requester" placeholder="Your name (optional)" maxLength={60} className={`w-full ${inputCls}`} />
            <button type="submit" disabled={sending}
              className="px-4 py-2 rounded-md bg-amber text-primary-foreground text-sm font-medium inline-flex items-center gap-2 disabled:opacity-60">
              {sending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
              {sending ? "Sending…" : "Pitch station"}
            </button>
          </form>
        )}

        <div className="mt-5 flex items-center justify-between">
          <div className="text-xs uppercase tracking-widest text-muted-foreground">
            On the board · {tab === "song" ? requests.length : stationReqs.length}
          </div>
          <div className="inline-flex items-center gap-1.5 text-[10px] font-mono text-muted-foreground">
            <RefreshCw className="w-3 h-3" />
            {lastSync ? `synced ${lastSync.toLocaleTimeString()}` : "syncing…"}
          </div>
        </div>

        {adminMode && (
          <div className="mt-2 rounded-md border border-destructive/40 bg-destructive/10 px-3 py-1.5 text-[11px] font-mono text-destructive">
            Studio mode · delete controls unlocked
          </div>
        )}

        <div className="mt-3 space-y-2">
          {tab === "song" ? (
            <>
              {requests.length === 0 && (
                <div className="py-6 text-center text-sm text-muted-foreground">
                  No requests yet — be the first.
                </div>
              )}
              {requests.map((r) => (
                <div key={r.id} className="flex items-center gap-3 rounded-md border border-border bg-card px-3 py-2">
                  <Music4 className="w-4 h-4 text-amber shrink-0" />
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-sm font-medium">{r.title}</div>
                    <div className="truncate text-xs text-muted-foreground">
                      {r.artist}
                      {r.requester ? ` · requested by ${r.requester}` : ""}
                    </div>
                  </div>
                  {adminMode && (
                    <button onClick={() => removeSong(r)}
                      className="p-1 rounded text-destructive hover:bg-destructive/20 shrink-0"
                      aria-label={`Delete request ${r.title}`}>
                      <Trash2 className="w-4 h-4" />
                    </button>
                  )}
                </div>
              ))}
            </>
          ) : (
            <>
              {stationReqs.length === 0 && (
                <div className="py-6 text-center text-sm text-muted-foreground">
                  No station pitches yet — invent one.
                </div>
              )}
              {stationReqs.map((r) => (
                <div key={r.id} className="flex items-start gap-3 rounded-md border border-border bg-card px-3 py-2">
                  <Radio className="w-4 h-4 text-amber shrink-0 mt-0.5" />
                  <div className="min-w-0 flex-1">
                    <div className="text-sm font-medium truncate">
                      {r.name}
                      {r.number != null && (
                        <span className="ml-2 font-mono text-xs text-amber">{Number(r.number).toFixed(1)} FM</span>
                      )}
                    </div>
                    {r.genre && <div className="text-xs text-muted-foreground truncate">{r.genre}</div>}
                    {r.songs && (
                      <div className="mt-1 whitespace-pre-wrap break-words text-xs text-muted-foreground">{r.songs}</div>
                    )}
                    {r.note && <div className="mt-1 text-xs text-muted-foreground italic break-words">{r.note}</div>}
                    {r.requester && (
                      <div className="mt-1 text-[10px] font-mono uppercase tracking-widest text-muted-foreground">
                        pitched by {r.requester}
                      </div>
                    )}
                  </div>
                  {adminMode && (
                    <button onClick={() => removeStation(r)}
                      className="p-1 rounded text-destructive hover:bg-destructive/20 shrink-0"
                      aria-label={`Delete station request ${r.name}`}>
                      <Trash2 className="w-4 h-4" />
                    </button>
                  )}
                </div>
              ))}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
