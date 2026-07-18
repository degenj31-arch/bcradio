CREATE POLICY "No public access to station_sessions" ON public.station_sessions
  FOR ALL TO anon, authenticated USING (false) WITH CHECK (false);

REVOKE INSERT ON public.station_messages FROM anon;

DROP POLICY IF EXISTS "Public can send chat messages" ON public.station_messages;