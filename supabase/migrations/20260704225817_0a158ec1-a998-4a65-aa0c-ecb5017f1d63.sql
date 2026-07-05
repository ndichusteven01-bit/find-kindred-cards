
-- Roles infrastructure
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
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles WHERE user_id = _user_id AND role = _role
  )
$$;

CREATE POLICY "Users can view their own roles"
  ON public.user_roles FOR SELECT TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Admins can view all roles"
  ON public.user_roles FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

-- Ad banners
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

CREATE POLICY "Anyone can view active banners"
  ON public.ad_banners FOR SELECT TO anon, authenticated
  USING (active = true OR public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins can insert banners"
  ON public.ad_banners FOR INSERT TO authenticated
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins can update banners"
  ON public.ad_banners FOR UPDATE TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins can delete banners"
  ON public.ad_banners FOR DELETE TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

CREATE TRIGGER update_ad_banners_updated_at
  BEFORE UPDATE ON public.ad_banners
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Seed 6 default banner slots
INSERT INTO public.ad_banners (slot, label, background_color, text_color) VALUES
  (1, 'Find the Best Place', '#1f2937', '#f3f4f6'),
  (2, 'Free Methods & Tutorials', '#facc15', '#111827'),
  (3, 'ventrix.fo', '#0b1220', '#ffffff'),
  (4, 'CVVs · Dumps · VPNs · WholeSale', '#f3f4f6', '#111827'),
  (5, 'The Only Store', '#e5e7eb', '#111827'),
  (6, 'Club Ronaldo CC Shop', '#e11d48', '#ffffff');
