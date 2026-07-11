-- Read-path indexes for split catalog queries (categories → services → requirements → tips).

CREATE INDEX IF NOT EXISTS idx_assistance_categories_active_sort
  ON public.assistance_categories (active, sort_order);

CREATE INDEX IF NOT EXISTS idx_assistance_services_category_active_sort
  ON public.assistance_services (category_id, active, sort_order);

CREATE INDEX IF NOT EXISTS idx_assistance_requirements_service_sort
  ON public.assistance_requirements (service_id, sort_order);

CREATE INDEX IF NOT EXISTS idx_assistance_requirement_tips_requirement_sort
  ON public.assistance_requirement_tips (requirement_id, sort_order);
