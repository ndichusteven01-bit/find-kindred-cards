DROP POLICY IF EXISTS "Anyone can insert bin cache" ON public.bin_cache;
DROP POLICY IF EXISTS "Anyone can update bin cache" ON public.bin_cache;

REVOKE INSERT, UPDATE ON public.bin_cache FROM anon;
REVOKE INSERT, UPDATE ON public.bin_cache FROM authenticated;

GRANT SELECT ON public.bin_cache TO anon, authenticated;
GRANT ALL ON public.bin_cache TO service_role;