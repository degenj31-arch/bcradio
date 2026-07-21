ALTER TABLE public.stations 
  ADD COLUMN IF NOT EXISTS avg_listeners numeric NOT NULL DEFAULT 50,
  ADD COLUMN IF NOT EXISTS fluctuation numeric NOT NULL DEFAULT 15,
  ADD COLUMN IF NOT EXISTS fluctuation_rate_seconds numeric NOT NULL DEFAULT 60;