-- Commercials can now be uploaded audio instead of YouTube
ALTER TABLE public.commercials ALTER COLUMN youtube_id DROP NOT NULL;
ALTER TABLE public.commercials ADD COLUMN IF NOT EXISTS audio_url text;

-- Push reliability: dedupe device endpoints and daily notification slots
DELETE FROM public.push_subscriptions a USING public.push_subscriptions b
  WHERE a.endpoint = b.endpoint AND a.ctid > b.ctid;
CREATE UNIQUE INDEX IF NOT EXISTS push_subscriptions_endpoint_key ON public.push_subscriptions (endpoint);
DELETE FROM public.notification_log a USING public.notification_log b
  WHERE a.slot_key = b.slot_key AND a.ctid > b.ctid;
CREATE UNIQUE INDEX IF NOT EXISTS notification_log_slot_key_key ON public.notification_log (slot_key);

-- Listener song requests
CREATE TABLE IF NOT EXISTS public.song_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title text NOT NULL,
  artist text,
  requester text,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, DELETE ON public.song_requests TO anon, authenticated;
GRANT ALL ON public.song_requests TO service_role;
ALTER TABLE public.song_requests ENABLE ROW LEVEL SECURITY;
CREATE POLICY "public read song requests" ON public.song_requests FOR SELECT USING (true);
CREATE POLICY "public insert song requests" ON public.song_requests FOR INSERT WITH CHECK (true);
CREATE POLICY "public delete song requests" ON public.song_requests FOR DELETE USING (true);