-- Catalog archive: `active = false` hides rows from the live app/CMS.
-- Cascades category archive to all services in that category.

CREATE OR REPLACE FUNCTION public.cascade_archive_assistance_category()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.active IS NOT DISTINCT FROM OLD.active THEN
    RETURN NEW;
  END IF;

  IF NEW.active = false THEN
    UPDATE public.assistance_services
    SET active = false
    WHERE category_id = NEW.id
      AND active IS DISTINCT FROM false;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_cascade_archive_assistance_category ON public.assistance_categories;

CREATE TRIGGER trg_cascade_archive_assistance_category
  AFTER UPDATE OF active ON public.assistance_categories
  FOR EACH ROW
  EXECUTE FUNCTION public.cascade_archive_assistance_category();

COMMENT ON COLUMN public.assistance_categories.active IS
  'Live catalog flag. false = archived (hidden from mobile app and CMS lists).';

COMMENT ON COLUMN public.assistance_services.active IS
  'Live catalog flag. false = archived (hidden from mobile app and CMS lists).';
