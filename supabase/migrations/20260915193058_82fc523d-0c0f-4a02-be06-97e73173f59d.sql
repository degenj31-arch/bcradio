CREATE TABLE public.podcast_episodes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title text NOT NULL,
  description text,
  host text,
  show_name text NOT NULL DEFAULT 'BCradio Podcast',
  cover_url text,
  youtube_id text,
  audio_url text,
  duration_seconds numeric NOT NULL DEFAULT 0,
  episode_number integer NOT NULL DEFAULT 1,
  published_at timestamptz NOT NULL DEFAULT now(),
  plays integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.podcast_episodes TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.podcast_episodes TO authenticated;
GRANT ALL ON public.podcast_episodes TO service_role;

ALTER TABLE public.podcast_episodes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "public read podcast episodes" ON public.podcast_episodes FOR SELECT USING (true);
CREATE POLICY "public insert podcast episodes" ON public.podcast_episodes FOR INSERT WITH CHECK (true);
CREATE POLICY "public update podcast episodes" ON public.podcast_episodes FOR UPDATE USING (true) WITH CHECK (true);
CREATE POLICY "public delete podcast episodes" ON public.podcast_episodes FOR DELETE USING (true);

CREATE TRIGGER podcast_episodes_touch BEFORE UPDATE ON public.podcast_episodes
FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

CREATE INDEX podcast_episodes_published_idx ON public.podcast_episodes (published_at DESC);