-- Withdraw the explicitly rejected stock photograph. The catalog rule is disabled.
UPDATE public.print_images
SET status = 'no_match', image = NULL, checked_at = now(), catalog_hash = '663d4c88a7ba5cdc1f101a3339eb7355cb03a235adb02d72a37069bf51880851'
WHERE image->>'file' = 'File:2010 Poland elections round 2 ballot box.jpg';
