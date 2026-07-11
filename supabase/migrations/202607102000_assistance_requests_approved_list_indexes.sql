-- Speeds Approved queue: service-scoped approved rows ordered by submission time.
create index if not exists assistance_requests_approved_submitted_idx
  on public.assistance_requests (service_id, submitted_at desc nulls last)
  where status = 'approved';

-- Helps application-ID search on the Approved page.
create index if not exists assistance_requests_request_code_lower_idx
  on public.assistance_requests (lower(request_code));
