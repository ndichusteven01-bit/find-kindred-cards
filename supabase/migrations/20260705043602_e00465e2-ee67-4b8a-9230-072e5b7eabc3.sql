
-- Public bin_cache: anyone can read/write cached BIN lookups
DROP POLICY IF EXISTS "Anyone can read bin cache" ON public.bin_cache;
DROP POLICY IF EXISTS "Anyone can insert bin cache" ON public.bin_cache;
DROP POLICY IF EXISTS "Anyone can update bin cache" ON public.bin_cache;
CREATE POLICY "Anyone can read bin cache" ON public.bin_cache FOR SELECT TO anon, authenticated USING (true);
CREATE POLICY "Anyone can insert bin cache" ON public.bin_cache FOR INSERT TO anon, authenticated WITH CHECK (true);
CREATE POLICY "Anyone can update bin cache" ON public.bin_cache FOR UPDATE TO anon, authenticated USING (true) WITH CHECK (true);

-- Explicit GRANTs (needed for the Data API with publishable key)
GRANT SELECT, INSERT, UPDATE ON public.bin_cache TO anon, authenticated;
GRANT ALL ON public.bin_cache TO service_role;

GRANT SELECT ON public.ad_banners TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.ad_banners TO authenticated;
GRANT ALL ON public.ad_banners TO service_role;

GRANT SELECT ON public.site_settings TO anon;
GRANT SELECT, INSERT, UPDATE ON public.site_settings TO authenticated;
GRANT ALL ON public.site_settings TO service_role;

GRANT INSERT ON public.contact_messages TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.contact_messages TO authenticated;
GRANT ALL ON public.contact_messages TO service_role;

GRANT SELECT ON public.user_roles TO authenticated;
GRANT ALL ON public.user_roles TO service_role;

-- Bootstrap first admin via SECURITY DEFINER (avoids needing service role)
CREATE OR REPLACE FUNCTION public.claim_admin_if_empty()
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  admin_count int;
  uid uuid;
BEGIN
  uid := auth.uid();
  IF uid IS NULL THEN RETURN false; END IF;
  SELECT count(*) INTO admin_count FROM public.user_roles WHERE role = 'admin';
  IF admin_count > 0 THEN RETURN false; END IF;
  INSERT INTO public.user_roles (user_id, role) VALUES (uid, 'admin') ON CONFLICT DO NOTHING;
  RETURN true;
END;
$$;
GRANT EXECUTE ON FUNCTION public.claim_admin_if_empty() TO authenticated;
