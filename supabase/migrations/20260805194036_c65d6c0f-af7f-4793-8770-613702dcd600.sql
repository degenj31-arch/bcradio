ALTER TABLE public.commercials ADD COLUMN IF NOT EXISTS show_video boolean NOT NULL DEFAULT false;

CREATE TABLE IF NOT EXISTS public.station_requests (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  number numeric,
  genre text,
  songs text,
  note text,
  requester text,
  created_at timestamptz not null default now()
);
GRANT SELECT, INSERT, DELETE ON public.station_requests TO anon, authenticated;
GRANT ALL ON public.station_requests TO service_role;
ALTER TABLE public.station_requests ENABLE ROW LEVEL SECURITY;
CREATE POLICY "public read station requests" ON public.station_requests FOR SELECT USING (true);
CREATE POLICY "public insert station requests" ON public.station_requests FOR INSERT WITH CHECK (true);
CREATE POLICY "public delete station requests" ON public.station_requests FOR DELETE USING (true);