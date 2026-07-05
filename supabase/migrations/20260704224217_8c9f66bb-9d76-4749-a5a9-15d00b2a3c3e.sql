CREATE TABLE public.bin_cache (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  bin TEXT NOT NULL UNIQUE,
  scheme TEXT,
  brand TEXT,
  card_type TEXT,
  category TEXT,
  bank_name TEXT,
  bank_url TEXT,
  bank_phone TEXT,
  country_name TEXT,
  country_code TEXT,
  country_emoji TEXT,
  currency TEXT,
  prepaid BOOLEAN,
  commercial BOOLEAN,
  raw JSONB,
  lookups INTEGER NOT NULL DEFAULT 1,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

GRANT ALL ON public.bin_cache TO service_role;

ALTER TABLE public.bin_cache ENABLE ROW LEVEL SECURITY;

CREATE INDEX idx_bin_cache_bin ON public.bin_cache (bin);

CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SET search_path = public;

CREATE TRIGGER update_bin_cache_updated_at
BEFORE UPDATE ON public.bin_cache
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();