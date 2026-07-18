CREATE TABLE public.station_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  station_id UUID NOT NULL REFERENCES public.stations(id) ON DELETE CASCADE,
  last_seen TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

GRANT ALL ON public.station_sessions TO service_role;

ALTER TABLE public.station_sessions ENABLE ROW LEVEL SECURITY;

CREATE INDEX idx_station_sessions_station_last_seen ON public.station_sessions(station_id, last_seen);

CREATE TABLE public.station_messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  station_id UUID NOT NULL REFERENCES public.stations(id) ON DELETE CASCADE,
  nickname TEXT NOT NULL CHECK (char_length(nickname) BETWEEN 1 AND 30),
  body TEXT NOT NULL CHECK (char_length(body) BETWEEN 1 AND 500),
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

GRANT ALL ON public.station_messages TO service_role;
GRANT SELECT, INSERT ON public.station_messages TO anon;

ALTER TABLE public.station_messages ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Public can read chat messages" ON public.station_messages
  FOR SELECT TO anon USING (true);

CREATE POLICY "Public can send chat messages" ON public.station_messages
  FOR INSERT TO anon WITH CHECK (true);