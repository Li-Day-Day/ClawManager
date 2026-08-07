ALTER TABLE instances
ADD COLUMN runtime_variant VARCHAR(32) NOT NULL DEFAULT '' AFTER runtime_type;

UPDATE instances
SET runtime_variant = 'linux'
WHERE type = 'workbuddy'
  AND (
    mount_path = '/config'
    OR LOWER(COALESCE(image_registry, '')) LIKE '%workbuddy-linux%'
  );

UPDATE instances
SET runtime_variant = 'windows'
WHERE type = 'workbuddy'
  AND runtime_variant = ''
  AND (
    mount_path = '/storage'
    OR LOWER(COALESCE(image_registry, '')) LIKE '%windows-vm-workbuddy%'
    OR pvc_name IS NOT NULL
  );
