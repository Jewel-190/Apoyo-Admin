-- Applicant files must not be world-readable via /object/public/...
-- Clients resolve objects with createSignedUrl after storage RLS.

update storage.buckets
set public = false
where id = 'request-documents';
