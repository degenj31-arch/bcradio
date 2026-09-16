import { useEffect, useRef, useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { supabase } from "@/integrations/supabase/client";
import { extractDuration, uploadAudio, fmtTime } from "@/lib/radio";
import { parseYouTubeId, fetchYouTubeDuration, formatOffAirWindow, parseScheduleTime, formatScheduleTime } from "@/lib/youtube";
import { fetchCommercials, type Commercial } from "@/lib/commercials";
import type { Station, Song } from "@/lib/radio";
import { X, Plus, Trash2, Pencil, ArrowUp, ArrowDown, Upload, Radio, Loader2, Save, Youtube, Megaphone, Bell, Monitor, Mic, ListMusic } from "lucide-react";
import { sendTestBroadcast } from "@/lib/push";
import { fetchYouTubePlaylist } from "@/lib/youtube-playlist.functions";
import { PodcastsEditor } from "@/components/PodcastsEditor";
import { toast } from "sonner";

type Props = { open: boolean; onClose: () => void };

// Pull a YouTube link (and a possible title) out of anything dragged in from
// a browser tab, the YouTube app, or a bookmark.
function extractDroppedYouTube(dt: DataTransfer | null): { url: string; title: string } | null {
  if (!dt) return null;
  const raw = [
    dt.getData("text/uri-list"),
    dt.getData("text/x-moz-url"),
    dt.getData("text/plain"),
  ].filter(Boolean);
  const html = dt.getData("text/html");
  if (html) raw.push(...(html.match(/https?:\/\/[^"'\s<>]+/g) ?? []));
  const lines = raw.flatMap((r) => r.split(/[\r\n]+/)).map((s) => s.trim()).filter(Boolean);
  const link = lines.find((l) => /^https?:\/\//i.test(l) && parseYouTubeId(l));
  if (!link) return null;
  const title = lines.find((l) => !/^https?:\/\//i.test(l)) ?? "";
  return { url: link, title };
}

export function StudioModal({ open, onClose }: Props) {
  const [stations, setStations] = useState<Station[]>([]);
  const [songs, setSongs] = useState<Record<string, Song[]>>({});
  const [commercials, setCommercials] = useState<Commercial[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [view, setView] = useState<"station" | "commercials" | "podcasts">("station");
  const [loading, setLoading] = useState(false);
  const [mobileShowEditor, setMobileShowEditor] = useState(false);
  const navigate = useNavigate();

  const refresh = async (keepId?: string | null) => {
    const { data: st } = await supabase.from("stations").select("*").order("number");
    const { data: sg } = await supabase.from("songs").select("*").order("position");
    setStations(st ?? []);
    const grouped: Record<string, Song[]> = {};
    (sg ?? []).forEach((s) => { (grouped[s.station_id] ??= []).push(s); });
    setSongs(grouped);
    setCommercials(await fetchCommercials());
    const next = keepId ?? selectedId ?? st?.[0]?.id ?? null;
    setSelectedId(next);
  };

  useEffect(() => { if (open) refresh(); /* eslint-disable-next-line */ }, [open]);

  if (!open) return null;

  const selected = stations.find((s) => s.id === selectedId) ?? null;
  const selectedSongs = selectedId ? songs[selectedId] ?? [] : [];

  const addStation = async () => {
    const usedNumbers = new Set(stations.map(s => Number(s.number)));
    let n = 88.1;
    while (usedNumbers.has(n)) n = Math.round((n + 0.2) * 10) / 10;
    const { data, error } = await supabase.from("stations").insert({
      number: n, name: "New Station", tagline: "Untitled broadcast", color: "#f59e0b",
    }).select().single();
    if (error) return toast.error(error.message);
    await refresh(data.id);
    setMobileShowEditor(true);
  };

  const deleteStation = async (id: string) => {
    if (!confirm("Delete this station and all its songs?")) return;
    const { error } = await supabase.from("stations").delete().eq("id", id);
    if (error) return toast.error(error.message);
    await refresh(null);
    setMobileShowEditor(false);
  };

  const selectStation = (id: string) => {
    setSelectedId(id);
    setView("station");
    setMobileShowEditor(true);
  };

  const openCommercials = () => {
    setView("commercials");
    setMobileShowEditor(true);
  };

  const openPodcasts = () => {
    setView("podcasts");
    setMobileShowEditor(true);
  };

  const handlePlaylistAdd = async (url: string) => {
    if (!selectedId) { toast.error("Pick a station first"); return; }
    setLoading(true);
    try {
      toast.message("Reading that playlist from YouTube…");
      const { items } = await fetchYouTubePlaylist({ data: { url } });
      let pos = (selectedSongs[selectedSongs.length - 1]?.position ?? -1) + 1;
      const rows = items.map((it) => ({
        station_id: selectedId,
        title: it.title,
        artist: null,
        audio_url: null,
        youtube_id: it.videoId,
        duration_seconds: it.durationSeconds || 180,
        position: pos++,
      }));
      const { error } = await supabase.from("songs").insert(rows);
      if (error) throw error;
      toast.success(`✓ Added ${rows.length} song${rows.length === 1 ? "" : "s"} from that playlist`);
      await refresh(selectedId);
    } catch (err) {
      console.error("[playlist]", err);
      toast.error(err instanceof Error ? err.message : "Could not read that playlist");
    } finally { setLoading(false); }
  };


  const handleFileUpload = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!selectedId) { toast.error("Pick a station first"); return; }
    const form = e.currentTarget;
    const fd = new FormData(form);
    const file = fd.get("file") as File | null;
    const title = String(fd.get("title") || "").trim();
    const artist = String(fd.get("artist") || "").trim() || null;
    if (!file || !file.size) return toast.error("Please choose a file");
    if (!title) return toast.error("Title required");
    setLoading(true);
    try {
      toast.message(`Reading "${file.name}"…`);
      let duration = 0;
      try { duration = await extractDuration(file); }
      catch (err) {
        console.error("[duration]", err);
        toast.error("Could not read media length — using 60s. Edit later if needed.");
        duration = 60;
      }
      toast.message("Uploading to cloud…");
      const path = await uploadAudio(file);
      const nextPos = (selectedSongs[selectedSongs.length - 1]?.position ?? -1) + 1;
      const { error } = await supabase.from("songs").insert({
        station_id: selectedId, title, artist, audio_url: path, youtube_id: null,
        duration_seconds: duration, position: nextPos,
      });
      if (error) throw error;
      toast.success(`✓ Added "${title}" (${fmtTime(duration)})`);
      form.reset();
      await refresh(selectedId);
    } catch (err) {
      console.error("[upload]", err);
      toast.error(err instanceof Error ? err.message : "Upload failed");
    } finally { setLoading(false); }
  };

  const handleYouTubeAdd = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!selectedId) { toast.error("Pick a station first"); return; }
    const form = e.currentTarget;
    const fd = new FormData(form);
    const url = String(fd.get("url") || "").trim();
    const title = String(fd.get("title") || "").trim();
    const artist = String(fd.get("artist") || "").trim() || null;
    const showVideo = fd.get("show_video") === "on";
    const videoId = parseYouTubeId(url);
    if (!videoId) return toast.error("Paste a valid YouTube URL (e.g. https://youtu.be/…)");
    if (!title) return toast.error("Title required");
    setLoading(true);
    try {
      toast.message("Reading video length from YouTube…");
      let duration = 0;
      try { duration = await fetchYouTubeDuration(videoId); }
      catch (err) {
        console.error("[yt-duration]", err);
        toast.error("Could not read length — using 180s. Edit later if needed.");
        duration = 180;
      }
      const nextPos = (selectedSongs[selectedSongs.length - 1]?.position ?? -1) + 1;
      const { error } = await supabase.from("songs").insert({
        station_id: selectedId, title, artist, audio_url: null, youtube_id: videoId,
        duration_seconds: duration, position: nextPos, show_video: showVideo,
      });
      if (error) throw error;
      toast.success(`✓ Added "${title}" (${fmtTime(duration)})`);
      form.reset();
      await refresh(selectedId);
    } catch (err) {
      console.error("[yt-add]", err);
      toast.error(err instanceof Error ? err.message : "Failed to add");
    } finally { setLoading(false); }
  };

  const updateSong = async (id: string, patch: Partial<Song>) => {
    const { error } = await supabase.from("songs").update(patch).eq("id", id);
    if (error) return toast.error(error.message);
    refresh(selectedId);
  };

  const deleteSong = async (s: Song) => {
    if (!confirm(`Delete "${s.title}"?`)) return;
    if (s.audio_url) {
      await supabase.storage.from("radio-audio").remove([s.audio_url]).catch(() => {});
    }
    const { error } = await supabase.from("songs").delete().eq("id", s.id);
    if (error) return toast.error(error.message);
    refresh(selectedId);
  };

  const move = async (s: Song, dir: -1 | 1) => {
    const list = selectedSongs;
    const i = list.findIndex((x) => x.id === s.id);
    const j = i + dir;
    if (j < 0 || j >= list.length) return;
    const a = list[i], b = list[j];
    await supabase.from("songs").update({ position: b.position }).eq("id", a.id);
    await supabase.from("songs").update({ position: a.position }).eq("id", b.id);
    refresh(selectedId);
  };

  return (
    <div className="fixed inset-0 z-50 bg-background/95 backdrop-blur-md overflow-y-auto">
      <div className="min-h-full w-full max-w-6xl mx-auto p-0 sm:p-4">
        <div className="panel relative min-h-screen sm:min-h-0">
          <button
            onClick={onClose}
            className="absolute top-3 right-3 sm:top-4 sm:right-4 p-2 rounded-md hover:bg-accent text-muted-foreground hover:text-foreground z-20"
            aria-label="Close studio"
          >
            <X className="w-5 h-5" />
          </button>

          <div className="p-4 sm:p-6 md:p-8 border-b border-border">
            <div className="flex items-center gap-3">
              <Radio className="w-6 h-6 text-amber" />
              <h2 className="text-xl sm:text-2xl md:text-3xl font-display dial-glow pr-10">Studio · Behind the Scenes</h2>
            </div>
            <p className="text-xs sm:text-sm text-muted-foreground mt-1">
              Manage stations, upload songs, set the order broadcast worldwide.
            </p>
            <p className="text-[11px] font-mono text-muted-foreground mt-2">
              Off-air window: {formatOffAirWindow()} — the air goes quiet; broadcast resumes automatically.
            </p>
          </div>

          <div className="grid md:grid-cols-[260px_1fr] gap-0 min-h-[500px]">
            <aside className={`${mobileShowEditor ? "hidden" : "block"} md:block border-r border-border p-3 sm:p-4 space-y-2`}>
              <div className="flex items-center justify-between mb-3">
                <span className="text-xs uppercase tracking-widest text-muted-foreground">Stations</span>
                <button onClick={addStation} className="p-1 rounded hover:bg-accent" aria-label="Add station">
                  <Plus className="w-4 h-4" />
                </button>
              </div>
              {stations.map((st) => (
                <button
                  key={st.id}
                  onClick={() => selectStation(st.id)}
                  className={`w-full text-left px-3 py-2 rounded-md transition flex items-center gap-2 ${
                    view === "station" && selectedId === st.id ? "bg-accent text-foreground" : "hover:bg-accent/50 text-muted-foreground"
                  }`}
                >
                  <span className="w-2 h-8 rounded-full shrink-0" style={{ background: st.color }} />
                  <div className="flex-1 min-w-0">
                    <div className="font-mono text-sm">{Number(st.number).toFixed(1)} FM</div>
                    <div className="text-xs truncate">{st.name}</div>
                  </div>
                </button>
              ))}

              <div className="pt-3 mt-3 border-t border-border">
                <button
                  onClick={openCommercials}
                  className={`w-full text-left px-3 py-2 rounded-md transition flex items-center gap-2 ${
                    view === "commercials" ? "bg-accent text-foreground" : "hover:bg-accent/50 text-muted-foreground"
                  }`}
                >
                  <Megaphone className="w-4 h-4 text-amber shrink-0" />
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-medium">Commercials</div>
                    <div className="text-xs truncate">{commercials.length} scheduled</div>
                  </div>
                </button>
                <button
                  onClick={openPodcasts}
                  className={`mt-2 w-full text-left px-3 py-2 rounded-md transition flex items-center gap-2 ${
                    view === "podcasts" ? "bg-accent text-foreground" : "hover:bg-accent/50 text-muted-foreground"
                  }`}
                >
                  <Mic className="w-4 h-4 text-amber shrink-0" />
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-medium">Podcasts</div>
                    <div className="text-xs truncate">On-demand episodes</div>
                  </div>
                </button>
              </div>
            </aside>

            <section className={`${mobileShowEditor ? "block" : "hidden"} md:block p-4 sm:p-6 space-y-6`}>
              <button
                onClick={() => setMobileShowEditor(false)}
                className="md:hidden text-sm text-muted-foreground hover:text-foreground mb-2"
              >
                ← Back
              </button>
              {view === "podcasts" ? (
                <PodcastsEditor />
              ) : view === "commercials" ? (
                <CommercialsEditor commercials={commercials} onChanged={() => refresh(selectedId)} />
              ) : !selected ? (
                <div className="text-muted-foreground">Select a station.</div>
              ) : (
                <StationEditor
                  key={selected.id}
                  station={selected}
                  songs={selectedSongs}
                  onSaved={(id) => refresh(id)}
                  onDelete={() => deleteStation(selected.id)}
                  onTuneIn={() => {
                    onClose();
                    navigate({ to: "/station/$number", params: { number: String(Number(selected.number)) } });
                  }}
                  onFileUpload={handleFileUpload}
                  onYouTubeAdd={handleYouTubeAdd}
                  onPlaylistAdd={handlePlaylistAdd}
                  uploading={loading}
                  onUpdateSong={updateSong}
                  onDeleteSong={deleteSong}
                  onMoveSong={move}
                />
              )}
            </section>
          </div>
        </div>
      </div>
    </div>
  );
}

function StationEditor({
  station, songs, onSaved, onDelete, onTuneIn, onFileUpload, onYouTubeAdd, onPlaylistAdd, uploading,
  onUpdateSong, onDeleteSong, onMoveSong,
}: {
  station: Station;
  songs: Song[];
  onSaved: (id: string) => void;
  onDelete: () => void;
  onTuneIn: () => void;
  onFileUpload: (e: React.FormEvent<HTMLFormElement>) => void;
  onYouTubeAdd: (e: React.FormEvent<HTMLFormElement>) => void;
  onPlaylistAdd: (url: string) => void | Promise<void>;
  uploading: boolean;
  onUpdateSong: (id: string, patch: Partial<Song>) => void;
  onDeleteSong: (s: Song) => void;
  onMoveSong: (s: Song, dir: -1 | 1) => void;
}) {
  const [number, setNumber] = useState<string>(String(Number(station.number)));
  const [name, setName] = useState(station.name);
  const [tagline, setTagline] = useState(station.tagline ?? "");
  const [color, setColor] = useState(station.color);
  const [avgListeners, setAvgListeners] = useState<string>(
    String((station as unknown as { avg_listeners?: number }).avg_listeners ?? 50)
  );
  const [fluctuation, setFluctuation] = useState<string>(
    String((station as unknown as { fluctuation?: number }).fluctuation ?? 15)
  );
  const [fluctuationRate, setFluctuationRate] = useState<string>(
    String((station as unknown as { fluctuation_rate_seconds?: number }).fluctuation_rate_seconds ?? 60)
  );
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const [tab, setTab] = useState<"youtube" | "file">("youtube");
  const [ytUrl, setYtUrl] = useState("");
  const [ytTitle, setYtTitle] = useState("");
  const [fileTitle, setFileTitle] = useState("");
  const [dragOver, setDragOver] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleDropData = (dt: DataTransfer | null) => {
    setDragOver(false);
    const file = dt?.files?.[0];
    if (file) {
      setTab("file");
      setFileTitle((t) => t || file.name.replace(/\.[^.]+$/, ""));
      const box = new DataTransfer();
      box.items.add(file);
      if (fileInputRef.current) fileInputRef.current.files = box.files;
      toast.success(`Dropped "${file.name}" — add a title and upload`);
      return;
    }
    const found = extractDroppedYouTube(dt);
    if (!found) return toast.error("Drop a YouTube link or an audio/video file");
    setTab("youtube");
    setYtUrl(found.url);
    if (found.title) setYtTitle(found.title);
    toast.success("YouTube link dropped — check the title, then add it");
  };

  const onDropSong = (e: React.DragEvent) => {
    e.preventDefault();
    handleDropData(e.dataTransfer);
  };

  // Dropping a link a few pixels outside the box used to make the browser
  // navigate away instead. Catch drops anywhere in the studio window.
  useEffect(() => {
    const over = (e: DragEvent) => {
      e.preventDefault();
      if (e.dataTransfer) e.dataTransfer.dropEffect = "copy";
      setDragOver(true);
    };
    const leave = (e: DragEvent) => { if (!e.relatedTarget) setDragOver(false); };
    const drop = (e: DragEvent) => { e.preventDefault(); handleDropData(e.dataTransfer); };
    window.addEventListener("dragover", over);
    window.addEventListener("dragleave", leave);
    window.addEventListener("drop", drop);
    return () => {
      window.removeEventListener("dragover", over);
      window.removeEventListener("dragleave", leave);
      window.removeEventListener("drop", drop);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const mark = <T,>(setter: (v: T) => void) => (v: T) => { setter(v); setDirty(true); };

  const save = async () => {
    const n = Number(number);
    if (!isFinite(n) || n <= 0) return toast.error("Invalid frequency");
    if (!name.trim()) return toast.error("Name required");
    const avg = Number(avgListeners);
    const fluct = Number(fluctuation);
    const rate = Number(fluctuationRate);
    if (!isFinite(avg) || avg < 0) return toast.error("Average listeners must be ≥ 0");
    if (!isFinite(fluct) || fluct < 0) return toast.error("Fluctuation must be ≥ 0");
    if (!isFinite(rate) || rate < 1) return toast.error("Fluctuation rate must be ≥ 1s");
    setSaving(true);
    const { error } = await supabase.from("stations").update({
      number: n, name: name.trim(), tagline: tagline.trim() || null, color,
      avg_listeners: avg, fluctuation: fluct, fluctuation_rate_seconds: rate,
    }).eq("id", station.id);
    setSaving(false);
    if (error) return toast.error(error.message);
    toast.success("Station saved");
    setDirty(false);
    onSaved(station.id);
  };

  return (
    <>
      <div className="grid sm:grid-cols-2 gap-3">
        <Field label="Frequency (e.g. 98.7)">
          <input type="number" step="0.1" value={number}
            onChange={(e) => mark(setNumber)(e.target.value)}
            className="w-full bg-input border border-border rounded-md px-3 py-2 font-mono" />
        </Field>
        <Field label="Name">
          <input value={name} onChange={(e) => mark(setName)(e.target.value)}
            className="w-full bg-input border border-border rounded-md px-3 py-2" />
        </Field>
        <Field label="Tagline">
          <input value={tagline} onChange={(e) => mark(setTagline)(e.target.value)}
            className="w-full bg-input border border-border rounded-md px-3 py-2" />
        </Field>
        <Field label="Dial Color">
          <input type="color" value={color} onChange={(e) => mark(setColor)(e.target.value)}
            className="w-full h-10 bg-input border border-border rounded-md" />
        </Field>
      </div>

      <div>
        <div className="text-xs uppercase tracking-widest text-muted-foreground mb-2">Listener Stats (displayed)</div>
        <div className="grid sm:grid-cols-3 gap-3">
          <Field label="Average listeners">
            <input type="number" min="0" step="1" value={avgListeners}
              onChange={(e) => mark(setAvgListeners)(e.target.value)}
              className="w-full bg-input border border-border rounded-md px-3 py-2 font-mono" />
          </Field>
          <Field label="Fluctuation (± count)">
            <input type="number" min="0" step="1" value={fluctuation}
              onChange={(e) => mark(setFluctuation)(e.target.value)}
              className="w-full bg-input border border-border rounded-md px-3 py-2 font-mono" />
          </Field>
          <Field label="Fluctuation rate (seconds)">
            <input type="number" min="1" step="1" value={fluctuationRate}
              onChange={(e) => mark(setFluctuationRate)(e.target.value)}
              className="w-full bg-input border border-border rounded-md px-3 py-2 font-mono" />
          </Field>
        </div>
        <p className="text-[11px] font-mono text-muted-foreground mt-1">
          Same value shown to every viewer worldwide (time-based). Lower rate = faster changes.
        </p>
      </div>


      <div className="flex flex-wrap gap-2">
        <button onClick={save} disabled={!dirty || saving}
          className="px-4 py-2 rounded-md bg-amber text-primary-foreground hover:opacity-90 text-sm flex items-center gap-2 disabled:opacity-50">
          {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
          {dirty ? "Save Changes" : "Saved"}
        </button>
        <button onClick={onTuneIn}
          className="px-3 py-2 rounded-md bg-primary text-primary-foreground hover:opacity-90 text-sm">Tune In →</button>
        <button onClick={onDelete}
          className="px-3 py-2 rounded-md border border-destructive/40 text-destructive hover:bg-destructive/10 text-sm flex items-center gap-1">
          <Trash2 className="w-4 h-4" /> Delete
        </button>
      </div>

      <hr className="border-border" />

      <div
        onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
        onDragLeave={() => setDragOver(false)}
        onDrop={onDropSong}
        className={`rounded-lg transition-colors ${dragOver ? "ring-2 ring-amber bg-amber/5 p-3 -m-3" : ""}`}
      >
        <div className="text-xs uppercase tracking-widest text-muted-foreground mb-1">Add Song</div>
        <p className="text-xs text-muted-foreground mb-3">
          Tip: drag a YouTube video (or an audio/video file) straight in here and it fills the form for you.
        </p>
        <div className="flex gap-2 mb-3">
          <button type="button" onClick={() => setTab("youtube")}
            className={`px-3 py-1.5 rounded-md text-sm flex items-center gap-1.5 ${
              tab === "youtube" ? "bg-amber text-primary-foreground" : "bg-accent text-muted-foreground"
            }`}>
            <Youtube className="w-4 h-4" /> YouTube URL
          </button>
          <button type="button" onClick={() => setTab("file")}
            className={`px-3 py-1.5 rounded-md text-sm flex items-center gap-1.5 ${
              tab === "file" ? "bg-amber text-primary-foreground" : "bg-accent text-muted-foreground"
            }`}>
            <Upload className="w-4 h-4" /> Upload File
          </button>
        </div>

        {tab === "youtube" ? (
          <form
            onSubmit={async (e) => { await onYouTubeAdd(e); setYtUrl(""); setYtTitle(""); }}
            className="space-y-3"
          >
            <input name="url" value={ytUrl} onChange={(e) => setYtUrl(e.target.value)}
              placeholder="https://youtu.be/… or https://www.youtube.com/watch?v=… (or drag the video here)" required
              className="w-full bg-input border border-border rounded-md px-3 py-2 font-mono text-sm" />
            <div className="grid sm:grid-cols-2 gap-3">
              <input name="title" value={ytTitle} onChange={(e) => setYtTitle(e.target.value)}
                placeholder="Song title" required
                className="bg-input border border-border rounded-md px-3 py-2" />
              <input name="artist" placeholder="Artist (optional)"
                className="bg-input border border-border rounded-md px-3 py-2" />
            </div>
             <label className="flex items-center gap-2 text-xs text-muted-foreground">
               <input type="checkbox" name="show_video" className="accent-amber w-4 h-4" />
               Show the YouTube video while this song is on air
             </label>
            <button disabled={uploading} type="submit"
              className="px-4 py-2 rounded-md bg-amber text-primary-foreground font-medium flex items-center gap-2 disabled:opacity-60">
              {uploading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Youtube className="w-4 h-4" />}
              {uploading ? "Adding…" : "Add from YouTube"}
            </button>
          </form>
        ) : (
          <form
            onSubmit={async (e) => { await onFileUpload(e); setFileTitle(""); }}
            className="space-y-3"
          >
            <div className="grid sm:grid-cols-2 gap-3">
              <input name="title" value={fileTitle} onChange={(e) => setFileTitle(e.target.value)}
                placeholder="Song title" required
                className="bg-input border border-border rounded-md px-3 py-2" />
              <input name="artist" placeholder="Artist (optional)"
                className="bg-input border border-border rounded-md px-3 py-2" />
            </div>
            <input ref={fileInputRef} name="file" type="file" accept="audio/*,video/*" required
              className="block w-full text-sm file:mr-3 file:px-3 file:py-2 file:rounded-md file:border-0 file:bg-accent file:text-foreground" />
            <button disabled={uploading} type="submit"
              className="px-4 py-2 rounded-md bg-amber text-primary-foreground font-medium flex items-center gap-2 disabled:opacity-60">
              {uploading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Upload className="w-4 h-4" />}
              {uploading ? "Uploading…" : "Upload & Add"}
            </button>
          </form>
        )}
      </div>


      <div>
        <div className="text-xs uppercase tracking-widest text-muted-foreground mb-2">
          Playlist · {songs.length} song{songs.length === 1 ? "" : "s"}
          {" · "}{fmtTime(songs.reduce((a, s) => a + Number(s.duration_seconds), 0))} total
        </div>
        <div className="space-y-1">
          {songs.length === 0 && (
            <div className="text-sm text-muted-foreground py-4">No songs yet. Add one above.</div>
          )}
          {songs.map((s, i) => (
            <SongRow key={s.id} song={s} index={i}
              onMove={(d) => onMoveSong(s, d)}
              onDelete={() => onDeleteSong(s)}
              onUpdate={(patch) => onUpdateSong(s.id, patch)}
            />
          ))}
        </div>
      </div>
    </>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="text-xs uppercase tracking-widest text-muted-foreground">{label}</span>
      <div className="mt-1">{children}</div>
    </label>
  );
}

function SongRow({ song, index, onMove, onDelete, onUpdate }: {
  song: Song; index: number;
  onMove: (dir: -1 | 1) => void;
  onDelete: () => void;
  onUpdate: (patch: Partial<Song>) => void;
}) {
  const [edit, setEdit] = useState(false);
  const titleRef = useRef<HTMLInputElement>(null);
  const artistRef = useRef<HTMLInputElement>(null);
  return (
    <div className="flex flex-wrap sm:flex-nowrap items-center gap-2 px-2 sm:px-3 py-2 rounded-md bg-card border border-border">
      <span className="font-mono text-xs text-muted-foreground w-6 shrink-0">{String(index + 1).padStart(2, "0")}</span>
      {song.youtube_id && <Youtube className="w-3.5 h-3.5 text-red-500 shrink-0" aria-label="YouTube source" />}
      {edit ? (
        <>
          <input ref={titleRef} defaultValue={song.title} className="flex-1 min-w-0 bg-input border border-border rounded px-2 py-1 text-sm" />
          <input ref={artistRef} defaultValue={song.artist ?? ""} placeholder="artist" className="flex-1 min-w-0 bg-input border border-border rounded px-2 py-1 text-sm" />
          <button
            onClick={() => {
              const title = titleRef.current?.value.trim();
              if (!title) return toast.error("Title required");
              onUpdate({ title, artist: artistRef.current?.value.trim() || null });
              setEdit(false);
            }}
            className="text-xs px-2 py-1 rounded bg-primary text-primary-foreground"
          >Save</button>
        </>
      ) : (
        <>
          <div className="flex-1 min-w-0">
            <div className="text-sm truncate">{song.title}</div>
            {song.artist && <div className="text-xs text-muted-foreground truncate">{song.artist}</div>}
          </div>
          <span className="font-mono text-xs text-muted-foreground shrink-0">{fmtTime(Number(song.duration_seconds))}</span>
          {song.youtube_id && (
            <button
              onClick={() => onUpdate({ show_video: !song.show_video })}
              title="Show the YouTube video while this song plays"
              className={`text-xs px-2 py-1 rounded shrink-0 inline-flex items-center gap-1 ${song.show_video ? "bg-amber/20 text-amber" : "bg-accent text-muted-foreground"}`}
            >
              <Monitor className="w-3.5 h-3.5" /> {song.show_video ? "Video on" : "Audio only"}
            </button>
          )}
          <button onClick={() => onMove(-1)} className="p-1 hover:bg-accent rounded shrink-0" aria-label="Move up"><ArrowUp className="w-4 h-4" /></button>
          <button onClick={() => onMove(1)} className="p-1 hover:bg-accent rounded shrink-0" aria-label="Move down"><ArrowDown className="w-4 h-4" /></button>
          <button onClick={() => setEdit(true)} className="p-1 hover:bg-accent rounded shrink-0" aria-label="Edit"><Pencil className="w-4 h-4" /></button>
          <button onClick={onDelete} className="p-1 hover:bg-destructive/20 text-destructive rounded shrink-0" aria-label="Delete"><Trash2 className="w-4 h-4" /></button>
        </>
      )}
    </div>
  );
}

function CommercialsEditor({ commercials, onChanged }: { commercials: Commercial[]; onChanged: () => void }) {
  const [adding, setAdding] = useState(false);
  const [mode, setMode] = useState<"youtube" | "file">("youtube");
  const [adUrl, setAdUrl] = useState("");
  const [adTitle, setAdTitle] = useState("");
  const [dragOver, setDragOver] = useState(false);
  const adFileRef = useRef<HTMLInputElement>(null);

  const takeDrop = (dt: DataTransfer | null) => {
    setDragOver(false);
    const file = dt?.files?.[0];
    if (file) {
      setMode("file");
      setAdTitle((t) => t || file.name.replace(/\.[^.]+$/, ""));
      const box = new DataTransfer();
      box.items.add(file);
      if (adFileRef.current) adFileRef.current.files = box.files;
      toast.success(`Dropped "${file.name}" — set the times, then schedule it`);
      return;
    }
    const found = extractDroppedYouTube(dt);
    if (!found) return toast.error("Drop a YouTube link or an audio/video file");
    setMode("youtube");
    setAdUrl(found.url);
    if (found.title) setAdTitle((t) => t || found.title);
    toast.success("YouTube link dropped — set the times, then schedule it");
  };

  useEffect(() => {
    const over = (e: DragEvent) => {
      e.preventDefault();
      if (e.dataTransfer) e.dataTransfer.dropEffect = "copy";
      setDragOver(true);
    };
    const leave = (e: DragEvent) => { if (!e.relatedTarget) setDragOver(false); };
    const drop = (e: DragEvent) => { e.preventDefault(); takeDrop(e.dataTransfer); };
    window.addEventListener("dragover", over);
    window.addEventListener("dragleave", leave);
    window.addEventListener("drop", drop);
    return () => {
      window.removeEventListener("dragover", over);
      window.removeEventListener("dragleave", leave);
      window.removeEventListener("drop", drop);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);


  const add = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const form = e.currentTarget;
    const fd = new FormData(form);
    const title = String(fd.get("title") || "").trim();
    const timesRaw = String(fd.get("times") || "").trim();
    if (!title) return toast.error("Title required");
    const times = timesRaw.split(",").map((s) => s.trim()).filter(Boolean);
    for (const t of times) {
      if (parseScheduleTime(t) == null) return toast.error(`Bad time "${t}" — use HH:MM 24-hour, e.g. 12:00, 21:00`);
    }
    if (!times.length) return toast.error("Add at least one schedule time (e.g. 12:00, 21:00)");

    setAdding(true);
    try {
      let payload: { youtube_id: string | null; audio_url: string | null; duration_seconds: number };
      if (mode === "youtube") {
        const videoId = parseYouTubeId(String(fd.get("url") || "").trim());
        if (!videoId) throw new Error("Paste a valid YouTube URL");
        toast.message("Reading video length…");
        let duration = 30;
        try { duration = await fetchYouTubeDuration(videoId); }
        catch { toast.error("Could not read length — using 30s."); }
        payload = { youtube_id: videoId, audio_url: null, duration_seconds: duration };
      } else {
        const file = fd.get("file");
        if (!(file instanceof File) || !file.size) throw new Error("Choose an audio or video file");
        toast.message("Reading file length…");
        const duration = await extractDuration(file);
        toast.message("Uploading…");
        const path = await uploadAudio(file);
        payload = { youtube_id: null, audio_url: path, duration_seconds: duration };
      }

      const showVideo = mode === "youtube" && fd.get("show_video") === "on";
      const { error } = await supabase.from("commercials").insert({
        title, schedule_times: times, active: true, show_video: showVideo, ...payload,
      });

      if (error) throw error;
      toast.success(`Commercial "${title}" scheduled`);
      form.reset();
      onChanged();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to add");
    } finally { setAdding(false); }
  };


  const toggle = async (c: Commercial) => {
    const { error } = await supabase.from("commercials").update({ active: !c.active }).eq("id", c.id);
    if (error) return toast.error(error.message);
    onChanged();
  };

  const toggleVideo = async (c: Commercial) => {
    const { error } = await supabase.from("commercials").update({ show_video: !c.show_video }).eq("id", c.id);
    if (error) return toast.error(error.message);
    onChanged();
  };

  const sendTest = async () => {
    toast.message("Sending test notification…");
    const res = await sendTestBroadcast();
    if (res.ok) toast.success(res.detail);
    else toast.error(res.detail);
  };

  const remove = async (c: Commercial) => {
    if (!confirm(`Delete commercial "${c.title}"?`)) return;
    const { error } = await supabase.from("commercials").delete().eq("id", c.id);
    if (error) return toast.error(error.message);
    onChanged();
  };


  return (
    <>
      <div>
        <div className="flex items-center gap-2 mb-1">
          <Megaphone className="w-5 h-5 text-amber" />
          <h3 className="font-display text-xl">Commercials</h3>
        </div>
        <p className="text-xs text-muted-foreground">
          Scheduled by Massachusetts (ET) time. Commercials interrupt every station at the exact moment,
          synchronized worldwide. Enter times as 24-hour <span className="font-mono">HH:MM</span>, comma-separated
          (e.g. <span className="font-mono">12:00, 21:00</span> for noon and 9:00 PM).
        </p>
      </div>

      <form
        onSubmit={async (e) => { await add(e); setAdUrl(""); setAdTitle(""); }}
        onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
        onDragLeave={() => setDragOver(false)}
        onDrop={(e) => { e.preventDefault(); takeDrop(e.dataTransfer); }}
        className={`space-y-3 p-4 rounded-md border bg-card/40 transition-colors ${dragOver ? "border-amber ring-2 ring-amber/50" : "border-border"}`}
      >
        <div className="text-xs uppercase tracking-widest text-muted-foreground">New commercial</div>
        <p className="text-xs text-muted-foreground">
          Tip: drag a YouTube video (or an audio/video file) anywhere in here and the form fills itself in.
        </p>
        <div className="flex gap-2">
          {(["youtube", "file"] as const).map((m) => (
            <button key={m} type="button" onClick={() => setMode(m)}
              className={`text-xs px-3 py-1.5 rounded-md border flex items-center gap-1.5 ${
                mode === m ? "bg-amber/20 text-amber border-amber/40" : "bg-card border-border text-muted-foreground"
              }`}>
              {m === "youtube" ? <Youtube className="w-3.5 h-3.5" /> : <Upload className="w-3.5 h-3.5" />}
              {m === "youtube" ? "YouTube link" : "Upload file"}
            </button>
          ))}
        </div>
        {mode === "youtube" ? (
          <>
            <input name="url" value={adUrl} onChange={(e) => setAdUrl(e.target.value)}
              placeholder="https://youtu.be/… (YouTube URL, or drag the video here)" required
              className="w-full bg-input border border-border rounded-md px-3 py-2 font-mono text-sm" />
            <label className="flex items-center gap-2 text-xs text-muted-foreground">
              <input type="checkbox" name="show_video" className="accent-amber w-4 h-4" />
              Show the video on air (listeners see the clip while the ad plays)
            </label>
          </>
        ) : (
          <input ref={adFileRef} name="file" type="file" accept="audio/*,video/*" required
            className="w-full bg-input border border-border rounded-md px-3 py-2 text-sm file:mr-3 file:px-3 file:py-1 file:rounded file:border-0 file:bg-amber file:text-primary-foreground" />
        )}

        <div className="grid sm:grid-cols-2 gap-3">
          <input name="title" value={adTitle} onChange={(e) => setAdTitle(e.target.value)}
            placeholder="Ad title (e.g. Local Diner Spot)" required
            className="bg-input border border-border rounded-md px-3 py-2" />
          <input name="times" placeholder="12:00, 21:00" required
            className="bg-input border border-border rounded-md px-3 py-2 font-mono" />
        </div>
        <button disabled={adding} type="submit"
          className="px-4 py-2 rounded-md bg-amber text-primary-foreground font-medium flex items-center gap-2 disabled:opacity-60">
          {adding ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
          {adding ? "Adding…" : "Schedule commercial"}
        </button>
      </form>

      <div>
        <div className="text-xs uppercase tracking-widest text-muted-foreground mb-2">
          Scheduled · {commercials.length}
        </div>
        <div className="space-y-2">
          {commercials.length === 0 && (
            <div className="text-sm text-muted-foreground py-4">No commercials scheduled.</div>
          )}
          {commercials.map((c) => {
            const times = c.schedule_times
              .map((t) => { const s = parseScheduleTime(t); return s == null ? t : formatScheduleTime(s); })
              .join(" · ");
            return (
              <div key={c.id} className="flex flex-wrap items-center gap-2 px-3 py-2 rounded-md bg-card border border-border">
                {c.youtube_id ? <Youtube className="w-4 h-4 text-red-500 shrink-0" /> : <Upload className="w-4 h-4 text-amber shrink-0" />}
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-medium truncate">{c.title}</div>
                  <div className="text-xs font-mono text-muted-foreground truncate">
                    {fmtTime(Number(c.duration_seconds))} · {times || "no times"}
                  </div>
                </div>
                {c.youtube_id && (
                  <button onClick={() => toggleVideo(c)}
                    title="Show the YouTube video while this ad plays"
                    className={`text-xs px-2 py-1 rounded shrink-0 inline-flex items-center gap-1 ${c.show_video ? "bg-amber/20 text-amber" : "bg-accent text-muted-foreground"}`}>
                    <Monitor className="w-3.5 h-3.5" /> {c.show_video ? "Video on" : "Audio only"}
                  </button>
                )}
                <button onClick={() => toggle(c)}
                  className={`text-xs px-2 py-1 rounded shrink-0 ${c.active ? "bg-amber/20 text-amber" : "bg-accent text-muted-foreground"}`}>
                  {c.active ? "Active" : "Paused"}
                </button>
                <button onClick={() => remove(c)} className="p-1 hover:bg-destructive/20 text-destructive rounded shrink-0" aria-label="Delete">
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            );
          })}
        </div>
      </div>

      <div className="rounded-md border border-border bg-card/40 p-4">
        <div className="text-xs uppercase tracking-widest text-muted-foreground mb-2">Notifications</div>
        <p className="text-xs text-muted-foreground mb-3">
          Daily alerts go out at 7:30 AM and 9:00 PM ET to every device that enabled them in the installed app.
          Send a live test to confirm delivery.
        </p>
        <button type="button" onClick={sendTest}
          className="px-4 py-2 rounded-md bg-accent text-foreground text-sm font-medium inline-flex items-center gap-2">
          <Bell className="w-4 h-4" /> Send test notification
        </button>
      </div>

    </>
  );
}
