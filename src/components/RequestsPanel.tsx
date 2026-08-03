import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Music4, Send, Trash2, X, Loader2, RefreshCw } from "lucide-react";
import { toast } from "sonner";

export type SongRequest = {
  id: string;
  title: string;
  artist: string | null;
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
  const [requests, setRequests] = useState<SongRequest[]>([]);
  const [sending, setSending] = useState(false);
  const [lastSync, setLastSync] = useState<Date | null>(null);

  const load = useCallback(async () => {
    const { data, error } = await supabase
      .from("song_requests")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(100);
    if (error) { console.error("[requests]", error); return; }
    setRequests((data ?? []) as SongRequest[]);
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

  const submit = async (e: React.FormEvent<HTMLFormElement>) => {
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

  const remove = async (r: SongRequest) => {
    const { error } = await supabase.from("song_requests").delete().eq("id", r.id);
    if (error) return toast.error(error.message);
    setRequests((prev) => prev.filter((x) => x.id !== r.id));
  };

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
          Ask for a song and see what everyone else is requesting. Live board — refreshes every 10 seconds.
        </p>

        <form onSubmit={submit} className="mt-4 space-y-3 rounded-md border border-border bg-card/40 p-3 sm:p-4">
          <div className="grid sm:grid-cols-2 gap-3">
            <input name="title" placeholder="Song title" required maxLength={120}
              className="bg-input border border-border rounded-md px-3 py-2 text-sm" />
            <input name="artist" placeholder="Artist" required maxLength={120}
              className="bg-input border border-border rounded-md px-3 py-2 text-sm" />
          </div>
          <input name="requester" placeholder="Your name (optional)" maxLength={60}
            className="w-full bg-input border border-border rounded-md px-3 py-2 text-sm" />
          <button type="submit" disabled={sending}
            className="px-4 py-2 rounded-md bg-amber text-primary-foreground text-sm font-medium inline-flex items-center gap-2 disabled:opacity-60">
            {sending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
            {sending ? "Sending…" : "Send request"}
          </button>
        </form>

        <div className="mt-5 flex items-center justify-between">
          <div className="text-xs uppercase tracking-widest text-muted-foreground">
            On the board · {requests.length}
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
                <button onClick={() => remove(r)}
                  className="p-1 rounded text-destructive hover:bg-destructive/20 shrink-0"
                  aria-label={`Delete request ${r.title}`}>
                  <Trash2 className="w-4 h-4" />
                </button>
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
