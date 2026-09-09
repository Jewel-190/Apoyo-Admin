-- ZAP Alert #5 remediation: heavy concurrent ZAP spidering caused
-- a Postgres statement timeout (error 57014) on assistance_services.
-- This composite index prevents sequential scans on the catalog query
-- that filters by active=TRUE and orders by sort_order.
CREATE INDEX IF NOT EXISTS idx_assistance_services_active_sort
  ON public.assistance_services (active, sort_order);
