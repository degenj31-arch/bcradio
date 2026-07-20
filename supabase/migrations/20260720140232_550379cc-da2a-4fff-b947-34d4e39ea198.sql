
CREATE TABLE public.commercials (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title text NOT NULL,
  youtube_id text NOT NULL,
  duration_seconds numeric NOT NULL,
  schedule_times text[] NOT NULL DEFAULT '{}',
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.commercials TO authenticated, anon;
GRANT ALL ON public.commercials TO service_role;
ALTER TABLE public.commercials ENABLE ROW LEVEL SECURITY;
CREATE POLICY "public commercials read" ON public.commercials FOR SELECT USING (true);
CREATE POLICY "public commercials write" ON public.commercials FOR ALL USING (true) WITH CHECK (true);
CREATE TRIGGER trg_commercials_updated_at BEFORE UPDATE ON public.commercials
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();
