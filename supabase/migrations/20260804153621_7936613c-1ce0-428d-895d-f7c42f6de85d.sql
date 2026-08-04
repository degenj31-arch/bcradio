CREATE TABLE public.song_ratings (
  id uuid primary key default gen_random_uuid(),
  song_id uuid not null references public.songs(id) on delete cascade,
  device_id text not null,
  rating numeric not null check (rating >= 0.5 and rating <= 4),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (song_id, device_id)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.song_ratings TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.song_ratings TO authenticated;
GRANT ALL ON public.song_ratings TO service_role;
ALTER TABLE public.song_ratings ENABLE ROW LEVEL SECURITY;
CREATE POLICY "public read song ratings" ON public.song_ratings FOR SELECT USING (true);
CREATE POLICY "public insert song ratings" ON public.song_ratings FOR INSERT WITH CHECK (true);
CREATE POLICY "public update song ratings" ON public.song_ratings FOR UPDATE USING (true) WITH CHECK (true);
CREATE INDEX song_ratings_song_idx ON public.song_ratings(song_id);
CREATE TRIGGER song_ratings_touch BEFORE UPDATE ON public.song_ratings FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();