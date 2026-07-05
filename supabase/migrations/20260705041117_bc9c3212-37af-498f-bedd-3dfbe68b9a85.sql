
-- 1) bin_cache
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
BEGIN NEW.updated_at = now(); RETURN NEW; END;
$$ LANGUAGE plpgsql SET search_path = public;

CREATE TRIGGER update_bin_cache_updated_at
BEFORE UPDATE ON public.bin_cache
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- 2) Roles + ad_banners
CREATE TYPE public.app_role AS ENUM ('admin', 'user');

CREATE TABLE public.user_roles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  role public.app_role NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, role)
);
GRANT SELECT ON public.user_roles TO authenticated;
GRANT ALL ON public.user_roles TO service_role;
ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.has_role(_user_id uuid, _role public.app_role)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$ SELECT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = _user_id AND role = _role) $$;

CREATE POLICY "Users can view their own roles" ON public.user_roles FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "Admins can view all roles" ON public.user_roles FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'admin'));

CREATE TABLE public.ad_banners (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  slot integer NOT NULL UNIQUE,
  label text NOT NULL DEFAULT '',
  image_url text,
  link_url text,
  background_color text NOT NULL DEFAULT '#111827',
  text_color text NOT NULL DEFAULT '#ffffff',
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.ad_banners TO anon, authenticated;
GRANT INSERT, UPDATE, DELETE ON public.ad_banners TO authenticated;
GRANT ALL ON public.ad_banners TO service_role;
ALTER TABLE public.ad_banners ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can view active banners" ON public.ad_banners FOR SELECT TO anon, authenticated USING (active = true OR public.has_role(auth.uid(), 'admin'));
CREATE POLICY "Admins can insert banners" ON public.ad_banners FOR INSERT TO authenticated WITH CHECK (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "Admins can update banners" ON public.ad_banners FOR UPDATE TO authenticated USING (public.has_role(auth.uid(), 'admin')) WITH CHECK (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "Admins can delete banners" ON public.ad_banners FOR DELETE TO authenticated USING (public.has_role(auth.uid(), 'admin'));

CREATE TRIGGER update_ad_banners_updated_at BEFORE UPDATE ON public.ad_banners FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

INSERT INTO public.ad_banners (slot, label, background_color, text_color) VALUES
  (1, 'Find the Best Place', '#1f2937', '#f3f4f6'),
  (2, 'Free Methods & Tutorials', '#facc15', '#111827'),
  (3, 'ventrix.fo', '#0b1220', '#ffffff'),
  (4, 'CVVs · Dumps · VPNs · WholeSale', '#f3f4f6', '#111827'),
  (5, 'The Only Store', '#e5e7eb', '#111827'),
  (6, 'Club Ronaldo CC Shop', '#e11d48', '#ffffff');

-- 3) site_settings + contact_messages
CREATE TABLE public.site_settings (
  id INTEGER PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  telegram_url TEXT NOT NULL DEFAULT '',
  jabber_url TEXT NOT NULL DEFAULT '',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT ON public.site_settings TO anon, authenticated;
GRANT ALL ON public.site_settings TO service_role;
ALTER TABLE public.site_settings ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Anyone can read site settings" ON public.site_settings FOR SELECT TO anon, authenticated USING (true);
CREATE POLICY "Admins can update site settings" ON public.site_settings FOR UPDATE TO authenticated USING (has_role(auth.uid(), 'admin'::app_role)) WITH CHECK (has_role(auth.uid(), 'admin'::app_role));
CREATE POLICY "Admins can insert site settings" ON public.site_settings FOR INSERT TO authenticated WITH CHECK (has_role(auth.uid(), 'admin'::app_role));
CREATE TRIGGER site_settings_updated_at BEFORE UPDATE ON public.site_settings FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
INSERT INTO public.site_settings (id, telegram_url, jabber_url) VALUES (1, '', '') ON CONFLICT DO NOTHING;

CREATE TABLE public.contact_messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  category TEXT NOT NULL CHECK (category IN ('general','advertisement')),
  name TEXT NOT NULL,
  email TEXT NOT NULL,
  message TEXT NOT NULL,
  read BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT INSERT ON public.contact_messages TO anon, authenticated;
GRANT SELECT, UPDATE, DELETE ON public.contact_messages TO authenticated;
GRANT ALL ON public.contact_messages TO service_role;
ALTER TABLE public.contact_messages ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Anyone can submit a contact message" ON public.contact_messages FOR INSERT TO anon, authenticated WITH CHECK (
  length(name) BETWEEN 1 AND 100 AND length(email) BETWEEN 3 AND 255 AND length(message) BETWEEN 1 AND 2000
);
CREATE POLICY "Admins can view messages" ON public.contact_messages FOR SELECT TO authenticated USING (has_role(auth.uid(), 'admin'::app_role));
CREATE POLICY "Admins can update messages" ON public.contact_messages FOR UPDATE TO authenticated USING (has_role(auth.uid(), 'admin'::app_role)) WITH CHECK (has_role(auth.uid(), 'admin'::app_role));
CREATE POLICY "Admins can delete messages" ON public.contact_messages FOR DELETE TO authenticated USING (has_role(auth.uid(), 'admin'::app_role));
