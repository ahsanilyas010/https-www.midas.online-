-- Logos live in the public workspace-branding bucket. Enforce at the storage
-- layer (not just in the form) that only small raster images are accepted:
-- PNG, JPEG or WebP, up to 2 MB. SVG is deliberately excluded: a public SVG
-- can carry scripts.
update storage.buckets
set file_size_limit = 2097152,
    allowed_mime_types = array['image/png', 'image/jpeg', 'image/webp']
where id = 'workspace-branding';
