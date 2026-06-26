import { useEffect, useRef, useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { supabase } from "@/integrations/supabase/client";
import { extractDuration, uploadAudio, fmtTime } from "@/lib/radio";
import type { Station, Song } from "@/lib/radio";
import { X, Plus, Trash2, Pencil, ArrowUp, ArrowDown, Upload, Radio, Loader2, Save } from "lucide-react";
import { toast } from "sonner";

type Props = { open: boolean; onClose: () => void };

export function StudioModal({ open, onClose }: Props) {
  const [stations, setStations] = useState<Station[]>([]);
  const [songs, setSongs] = useState<Record<string, Song[]>>({});
  const [selectedId, setSelectedId] = useState<string | null>(null);
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
    setMobileShowEditor(true);
  };

  const handleUpload = async (e: React.FormEvent<HTMLFormElement>) => {
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
      try {
        duration = await extractDuration(file);
      } catch (err) {
        console.error("[duration]", err);
        toast.error("Could not read media length — using 60s. Edit later if needed.");
        duration = 60;
      }
      toast.message("Uploading to cloud…");
      const path = await uploadAudio(file);
      const nextPos = (selectedSongs[selectedSongs.length - 1]?.position ?? -1) + 1;
      const { error } = await supabase.from("songs").insert({
        station_id: selectedId, title, artist, audio_url: path,
        duration_seconds: duration, position: nextPos,
      });
      if (error) throw error;
      toast.success(`✓ Added "${title}" (${fmtTime(duration)})`);
      form.reset();
      await refresh(selectedId);
    } catch (err) {
      console.error("[upload]", err);
      toast.error(err instanceof Error ? err.message : "Upload failed");
    } finally {
      setLoading(false);
    }
  };

  const updateSong = async (id: string, patch: Partial<Song>) => {
    const { error } = await supabase.from("songs").update(patch).eq("id", id);
    if (error) return toast.error(error.message);
    refresh(selectedId);
  };

  const deleteSong = async (s: Song) => {
    if (!confirm(`Delete "${s.title}"?`)) return;
    await supabase.storage.from("radio-audio").remove([s.audio_url]).catch(() => {});
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
          </div>

          <div className="grid md:grid-cols-[260px_1fr] gap-0 min-h-[500px]">
            {/* Sidebar */}
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
                    selectedId === st.id ? "bg-accent text-foreground" : "hover:bg-accent/50 text-muted-foreground"
                  }`}
                >
                  <span className="w-2 h-8 rounded-full shrink-0" style={{ background: st.color }} />
                  <div className="flex-1 min-w-0">
                    <div className="font-mono text-sm">{Number(st.number).toFixed(1)} FM</div>
                    <div className="text-xs truncate">{st.name}</div>
                  </div>
                </button>
              ))}
            </aside>

            {/* Editor */}
            <section className={`${mobileShowEditor ? "block" : "hidden"} md:block p-4 sm:p-6 space-y-6`}>
              <button
                onClick={() => setMobileShowEditor(false)}
                className="md:hidden text-sm text-muted-foreground hover:text-foreground mb-2"
              >
                ← All stations
              </button>
              {!selected ? (
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
                  onUpload={handleUpload}
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
  station, songs, onSaved, onDelete, onTuneIn, onUpload, uploading,
  onUpdateSong, onDeleteSong, onMoveSong,
}: {
  station: Station;
  songs: Song[];
  onSaved: (id: string) => void;
  onDelete: () => void;
  onTuneIn: () => void;
  onUpload: (e: React.FormEvent<HTMLFormElement>) => void;
  uploading: boolean;
  onUpdateSong: (id: string, patch: Partial<Song>) => void;
  onDeleteSong: (s: Song) => void;
  onMoveSong: (s: Song, dir: -1 | 1) => void;
}) {
  const [number, setNumber] = useState<string>(String(Number(station.number)));
  const [name, setName] = useState(station.name);
  const [tagline, setTagline] = useState(station.tagline ?? "");
  const [color, setColor] = useState(station.color);
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);

  const mark = <T,>(setter: (v: T) => void) => (v: T) => { setter(v); setDirty(true); };

  const save = async () => {
    const n = Number(number);
    if (!isFinite(n) || n <= 0) return toast.error("Invalid frequency");
    if (!name.trim()) return toast.error("Name required");
    setSaving(true);
    const { error } = await supabase.from("stations").update({
      number: n, name: name.trim(), tagline: tagline.trim() || null, color,
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
          <input
            type="number" step="0.1" value={number}
            onChange={(e) => mark(setNumber)(e.target.value)}
            className="w-full bg-input border border-border rounded-md px-3 py-2 font-mono"
          />
        </Field>
        <Field label="Name">
          <input
            value={name}
            onChange={(e) => mark(setName)(e.target.value)}
            className="w-full bg-input border border-border rounded-md px-3 py-2"
          />
        </Field>
        <Field label="Tagline">
          <input
            value={tagline}
            onChange={(e) => mark(setTagline)(e.target.value)}
            className="w-full bg-input border border-border rounded-md px-3 py-2"
          />
        </Field>
        <Field label="Dial Color">
          <input
            type="color" value={color}
            onChange={(e) => mark(setColor)(e.target.value)}
            className="w-full h-10 bg-input border border-border rounded-md"
          />
        </Field>
      </div>

      <div className="flex flex-wrap gap-2">
        <button
          onClick={save}
          disabled={!dirty || saving}
          className="px-4 py-2 rounded-md bg-amber text-primary-foreground hover:opacity-90 text-sm flex items-center gap-2 disabled:opacity-50"
        >
          {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
          {dirty ? "Save Changes" : "Saved"}
        </button>
        <button
          onClick={onTuneIn}
          className="px-3 py-2 rounded-md bg-primary text-primary-foreground hover:opacity-90 text-sm"
        >Tune In →</button>
        <button
          onClick={onDelete}
          className="px-3 py-2 rounded-md border border-destructive/40 text-destructive hover:bg-destructive/10 text-sm flex items-center gap-1"
        >
          <Trash2 className="w-4 h-4" /> Delete
        </button>
      </div>

      <hr className="border-border" />

      <form onSubmit={onUpload} className="space-y-3">
        <div className="text-xs uppercase tracking-widest text-muted-foreground">Add Song</div>
        <div className="grid sm:grid-cols-2 gap-3">
          <input name="title" placeholder="Song title" required
            className="bg-input border border-border rounded-md px-3 py-2" />
          <input name="artist" placeholder="Artist (optional)"
            className="bg-input border border-border rounded-md px-3 py-2" />
        </div>
        <input name="file" type="file" accept="audio/*,video/*" required
          className="block w-full text-sm file:mr-3 file:px-3 file:py-2 file:rounded-md file:border-0 file:bg-accent file:text-foreground" />
        <button
          disabled={uploading} type="submit"
          className="px-4 py-2 rounded-md bg-amber text-primary-foreground font-medium flex items-center gap-2 disabled:opacity-60"
        >
          {uploading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Upload className="w-4 h-4" />}
          {uploading ? "Uploading…" : "Upload & Add"}
        </button>
      </form>

      <div>
        <div className="text-xs uppercase tracking-widest text-muted-foreground mb-2">
          Playlist · {songs.length} song{songs.length === 1 ? "" : "s"}
          {" · "}{fmtTime(songs.reduce((a, s) => a + Number(s.duration_seconds), 0))} total
        </div>
        <div className="space-y-1">
          {songs.length === 0 && (
            <div className="text-sm text-muted-foreground py-4">No songs yet. Upload one above.</div>
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
      {edit ? (
        <>
          <input ref={titleRef} defaultValue={song.title} className="flex-1 min-w-0 bg-input border border-border rounded px-2 py-1 text-sm" />
          <input ref={artistRef} defaultValue={song.artist ?? ""} placeholder="artist" className="flex-1 min-w-0 bg-input border border-border rounded px-2 py-1 text-sm" />
          <button
            onClick={() => { onUpdate({ title: titleRef.current!.value, artist: artistRef.current!.value || null }); setEdit(false); }}
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
          <button onClick={() => onMove(-1)} className="p-1 hover:bg-accent rounded shrink-0" aria-label="Move up"><ArrowUp className="w-4 h-4" /></button>
          <button onClick={() => onMove(1)} className="p-1 hover:bg-accent rounded shrink-0" aria-label="Move down"><ArrowDown className="w-4 h-4" /></button>
          <button onClick={() => setEdit(true)} className="p-1 hover:bg-accent rounded shrink-0" aria-label="Edit"><Pencil className="w-4 h-4" /></button>
          <button onClick={onDelete} className="p-1 hover:bg-destructive/20 text-destructive rounded shrink-0" aria-label="Delete"><Trash2 className="w-4 h-4" /></button>
        </>
      )}
    </div>
  );
}
