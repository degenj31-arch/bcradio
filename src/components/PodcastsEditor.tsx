import { useEffect, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { extractDuration, uploadAudio, fmtTime } from "@/lib/radio";
import { parseYouTubeId, fetchYouTubeDuration } from "@/lib/youtube";
import { fetchEpisodes, formatEpisodeDate, type PodcastEpisode } from "@/lib/podcasts";
import { ListMusic, Loader2, Mic, Trash2, Upload, Youtube } from "lucide-react";
import { fetchYouTubePlaylist } from "@/lib/youtube-playlist.functions";
import { toast } from "sonner";
import { PODCAST_CATEGORIES, episodeCategory } from "@/lib/podcast-categories";

export function PodcastsEditor() {
  const [episodes, setEpisodes] = useState<PodcastEpisode[]>([]);
  const [mode, setMode] = useState<"youtube" | "file">("youtube");
  const [busy, setBusy] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const load = async () => {
    try {
      setEpisodes(await fetchEpisodes());
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not load episodes");
    }
  };

  useEffect(() => {
    load();
  }, []);

  const nextNumber = () =>
    episodes.reduce((m, e) => Math.max(m, Number(e.episode_number ?? 0)), 0) + 1;

  const addYouTube = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const form = e.currentTarget;
    const fd = new FormData(form);
    const videoId = parseYouTubeId(String(fd.get("url") || ""));
    const title = String(fd.get("title") || "").trim();
    if (!videoId) return toast.error("Paste a valid YouTube link");
    if (!title) return toast.error("Title required");
    setBusy(true);
    try {
      let duration = 0;
      try {
        duration = await fetchYouTubeDuration(videoId);
      } catch {
        duration = 0;
      }
      const { error } = await supabase.from("podcast_episodes").insert({
        title,
        description: String(fd.get("description") || "").trim() || null,
        host: String(fd.get("host") || "").trim() || null,
        show_name: String(fd.get("show_name") || "").trim() || "BCradio Podcast",
        youtube_id: videoId,
        duration_seconds: duration,
        episode_number: nextNumber(),
        category: String(fd.get("category") || "") || null,
      } as never);
      if (error) throw error;
      toast.success(`✓ Episode "${title}" published`);
      form.reset();
      await load();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not add episode");
    } finally {
      setBusy(false);
    }
  };

  const addFile = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const form = e.currentTarget;
    const fd = new FormData(form);
    const file = fd.get("file") as File | null;
    const title = String(fd.get("title") || "").trim();
    if (!file || !file.size) return toast.error("Choose a recording first");
    if (!title) return toast.error("Title required");
    setBusy(true);
    try {
      let duration = 0;
      try {
        duration = await extractDuration(file);
      } catch {
        duration = 0;
      }
      toast.message("Uploading recording…");
      const path = await uploadAudio(file);
      const { error } = await supabase.from("podcast_episodes").insert({
        title,
        description: String(fd.get("description") || "").trim() || null,
        host: String(fd.get("host") || "").trim() || null,
        show_name: String(fd.get("show_name") || "").trim() || "BCradio Podcast",
        audio_url: path,
        duration_seconds: duration,
        episode_number: nextNumber(),
        category: String(fd.get("category") || "") || null,
      } as never);
      if (error) throw error;
      toast.success(`✓ Episode "${title}" published (${fmtTime(duration)})`);
      form.reset();
      if (fileRef.current) fileRef.current.value = "";
      await load();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Upload failed");
    } finally {
      setBusy(false);
    }
  };

  const remove = async (ep: PodcastEpisode) => {
    if (!confirm(`Delete "${ep.title}"?`)) return;
    if (ep.audio_url) await supabase.storage.from("radio-audio").remove([ep.audio_url]);
    const { error } = await supabase.from("podcast_episodes").delete().eq("id", ep.id);
    if (error) return toast.error(error.message);
    load();
  };

  const setCategory = async (ids: string[], category: string) => {
    const { error } = await supabase.from("podcast_episodes")
      .update({ category: category || null } as never).in("id", ids);
    if (error) return toast.error(error.message);
    toast.success(category ? `Marked as ${category}` : "Category cleared");
    load();
  };

  const showNames = [...new Set(episodes.map((e) => e.show_name).filter(Boolean))];

  const common = (
    <>
      <div className="grid sm:grid-cols-2 gap-3">
        <input name="title" placeholder="Episode title" required
          className="bg-input border border-border rounded-md px-3 py-2" />
        <input name="host" placeholder="Host (optional)"
          className="bg-input border border-border rounded-md px-3 py-2" />
      </div>
      <input name="show_name" list="bcradio-shows" placeholder="Show name — groups episodes together (default: BCradio Podcast)"
        className="w-full bg-input border border-border rounded-md px-3 py-2" />
      <datalist id="bcradio-shows">
        {[...new Set(episodes.map((e) => e.show_name).filter(Boolean))].map((s) => (
          <option key={s} value={s} />
        ))}
      </datalist>
      <select name="category" defaultValue=""
        className="w-full bg-input border border-border rounded-md px-3 py-2 text-sm">
        <option value="">Category (optional)</option>
        {PODCAST_CATEGORIES.map((c) => <option key={c.name} value={c.name}>{c.name}</option>)}
      </select>
      <textarea name="description" placeholder="Episode description (optional)" rows={3}
        className="w-full bg-input border border-border rounded-md px-3 py-2 text-sm" />
    </>
  );

  return (
    <div className="space-y-6">
      <div>
        <div className="flex items-center gap-2">
          <Mic className="w-5 h-5 text-amber" />
          <h3 className="font-display text-xl">Podcasts</h3>
        </div>
        <p className="text-xs text-muted-foreground mt-1">
          Publish on-demand episodes — upload a recording or pull one in from YouTube.
        </p>
      </div>

      <div className="flex gap-2">
        <button type="button" onClick={() => setMode("youtube")}
          className={`px-3 py-1.5 rounded-md text-sm flex items-center gap-1.5 ${
            mode === "youtube" ? "bg-amber text-primary-foreground" : "bg-accent text-muted-foreground"
          }`}>
          <Youtube className="w-4 h-4" /> From YouTube
        </button>
        <button type="button" onClick={() => setMode("file")}
          className={`px-3 py-1.5 rounded-md text-sm flex items-center gap-1.5 ${
            mode === "file" ? "bg-amber text-primary-foreground" : "bg-accent text-muted-foreground"
          }`}>
          <Upload className="w-4 h-4" /> Upload recording
        </button>
      </div>

      {mode === "youtube" ? (
        <form onSubmit={addYouTube} className="space-y-3">
          <input name="url" required placeholder="https://youtu.be/… episode link"
            className="w-full bg-input border border-border rounded-md px-3 py-2 font-mono text-sm" />
          {common}
          <button disabled={busy} type="submit"
            className="px-4 py-2 rounded-md bg-amber text-primary-foreground font-medium flex items-center gap-2 disabled:opacity-60">
            {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Youtube className="w-4 h-4" />}
            {busy ? "Publishing…" : "Publish episode"}
          </button>
        </form>
      ) : (
        <form onSubmit={addFile} className="space-y-3">
          <input ref={fileRef} name="file" type="file" accept="audio/*,video/*" required
            className="block w-full text-sm file:mr-3 file:px-3 file:py-2 file:rounded-md file:border-0 file:bg-accent file:text-foreground" />
          {common}
          <button disabled={busy} type="submit"
            className="px-4 py-2 rounded-md bg-amber text-primary-foreground font-medium flex items-center gap-2 disabled:opacity-60">
            {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Upload className="w-4 h-4" />}
            {busy ? "Uploading…" : "Upload & publish"}
          </button>
        </form>
      )}

      {showNames.length > 0 && (
        <div>
          <div className="text-xs uppercase tracking-widest text-muted-foreground mb-2">Label a whole podcast album</div>
          <div className="space-y-1">
            {showNames.map((name) => {
              const eps = episodes.filter((e) => e.show_name === name);
              const cats = [...new Set(eps.map(episodeCategory))];
              return (
                <div key={name} className="flex items-center gap-3 px-3 py-2 rounded-md bg-card/50 border border-border">
                  <div className="flex-1 min-w-0 text-sm truncate">{name} <span className="text-muted-foreground text-xs">· {eps.length} ep</span></div>
                  <select value={cats.length === 1 ? String(cats[0] ?? "") : ""} onChange={(e) => setCategory(eps.map((x) => x.id), e.target.value)}
                    className="bg-input border border-border rounded px-1.5 py-1 text-[11px]" aria-label="Album category">
                    <option value="">{cats.length > 1 ? "Mixed" : "No category"}</option>
                    {PODCAST_CATEGORIES.map((c) => <option key={c.name} value={c.name}>{c.name}</option>)}
                  </select>
                </div>
              );
            })}
          </div>
        </div>
      )}

      <div>
        <div className="text-xs uppercase tracking-widest text-muted-foreground mb-2">
          {episodes.length} episode{episodes.length === 1 ? "" : "s"}
        </div>
        <div className="space-y-1">
          {episodes.map((ep) => (
            <div key={ep.id} className="flex items-center gap-3 px-3 py-2 rounded-md bg-card/50 border border-border">
              <span className="font-mono text-xs text-muted-foreground w-8 shrink-0">#{ep.episode_number}</span>
              <div className="flex-1 min-w-0">
                <div className="text-sm truncate">{ep.title}</div>
                <div className="text-[11px] font-mono text-muted-foreground truncate">
                  {ep.show_name} · {formatEpisodeDate(ep.published_at)} · {fmtTime(Number(ep.duration_seconds))}
                </div>
              </div>
              <select value={episodeCategory(ep) ?? ""} onChange={(e) => setCategory([ep.id], e.target.value)}
                className="bg-input border border-border rounded px-1.5 py-1 text-[11px] max-w-[130px]" aria-label="Episode category">
                <option value="">No category</option>
                {PODCAST_CATEGORIES.map((c) => <option key={c.name} value={c.name}>{c.name}</option>)}
              </select>
              <button onClick={() => remove(ep)} className="p-1.5 rounded hover:bg-accent text-muted-foreground hover:text-destructive" aria-label="Delete episode">
                <Trash2 className="w-4 h-4" />
              </button>
            </div>
          ))}
          {episodes.length === 0 && (
            <div className="text-sm text-muted-foreground py-4">No episodes yet.</div>
          )}
        </div>
      </div>
    </div>
  );
}
