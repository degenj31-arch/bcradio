
-- Stations table
CREATE TABLE public.stations (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  number NUMERIC(5,1) NOT NULL UNIQUE,
  name TEXT NOT NULL,
  tagline TEXT,
  color TEXT NOT NULL DEFAULT '#f59e0b',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.stations TO anon, authenticated;
GRANT ALL ON public.stations TO service_role;
ALTER TABLE public.stations ENABLE ROW LEVEL SECURITY;
CREATE POLICY "public read stations" ON public.stations FOR SELECT USING (true);
CREATE POLICY "public write stations" ON public.stations FOR INSERT WITH CHECK (true);
CREATE POLICY "public update stations" ON public.stations FOR UPDATE USING (true) WITH CHECK (true);
CREATE POLICY "public delete stations" ON public.stations FOR DELETE USING (true);

-- Songs table
CREATE TABLE public.songs (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  station_id UUID NOT NULL REFERENCES public.stations(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  artist TEXT,
  audio_url TEXT NOT NULL,
  duration_seconds NUMERIC(10,3) NOT NULL,
  position INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.songs TO anon, authenticated;
GRANT ALL ON public.songs TO service_role;
ALTER TABLE public.songs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "public read songs" ON public.songs FOR SELECT USING (true);
CREATE POLICY "public write songs" ON public.songs FOR INSERT WITH CHECK (true);
CREATE POLICY "public update songs" ON public.songs FOR UPDATE USING (true) WITH CHECK (true);
CREATE POLICY "public delete songs" ON public.songs FOR DELETE USING (true);

CREATE INDEX songs_station_position_idx ON public.songs(station_id, position);

-- updated_at trigger
CREATE OR REPLACE FUNCTION public.touch_updated_at() RETURNS TRIGGER AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END;
$$ LANGUAGE plpgsql SET search_path = public;

CREATE TRIGGER stations_touch BEFORE UPDATE ON public.stations FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();
CREATE TRIGGER songs_touch BEFORE UPDATE ON public.songs FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

-- Seed stations
INSERT INTO public.stations (number, name, tagline, color) VALUES
  (88.1, 'The Pulse', 'Heartbeat of the city', '#ef4444'),
  (92.5, 'Velvet FM', 'Smooth nights, smoother days', '#a855f7'),
  (98.7, 'Static Sky', 'Indie & alternative', '#06b6d4'),
  (101.3, 'Gold Tower', 'Timeless classics', '#f59e0b'),
  (104.9, 'Frequency 9', 'Electronic frontier', '#22c55e'),
  (107.7, 'Late Signal', 'After-hours broadcast', '#3b82f6');
