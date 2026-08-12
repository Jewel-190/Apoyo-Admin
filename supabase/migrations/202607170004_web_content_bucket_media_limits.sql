-- Allow larger media uploads (videos) on the web-content bucket.
-- Default Supabase object size is often too small for hero videos.

begin;

update storage.buckets
set
  public = true,
  file_size_limit = 104857600, -- 100 MB
  allowed_mime_types = array[
    'image/jpeg',
    'image/png',
    'image/gif',
    'image/webp',
    'image/svg+xml',
    'image/avif',
    'video/mp4',
    'video/webm',
    'video/quicktime',
    'video/x-msvideo',
    'video/x-matroska'
  ]
where id = 'web-content';

commit;
