-- Optional editorial illustrations. No changes to source documents or summaries.
CREATE TABLE IF NOT EXISTS public.print_images (
 print_id bigint PRIMARY KEY REFERENCES public.prints(id) ON DELETE CASCADE,
 status text NOT NULL CHECK (status IN ('matched','no_match')),
 subject_hash text NOT NULL,
 catalog_hash text NOT NULL,
 checked_at timestamptz NOT NULL DEFAULT now(),
 image jsonb,
 CHECK ((status = 'matched' AND jsonb_typeof(image) = 'object') OR (status = 'no_match' AND image IS NULL))
);
ALTER TABLE public.print_images ENABLE ROW LEVEL SECURITY;
CREATE POLICY print_images_public_read ON public.print_images FOR SELECT TO anon, authenticated USING (status = 'matched');
GRANT SELECT ON public.print_images TO anon, authenticated;
GRANT ALL ON public.print_images TO service_role;
COMMENT ON TABLE public.print_images IS 'Optional Commons illustrations selected by explicit subject rules; attribution and license verified through Imageinfo. no_match is normal.';
NOTIFY pgrst, 'reload schema';
