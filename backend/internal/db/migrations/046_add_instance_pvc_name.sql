ALTER TABLE instances
ADD COLUMN pvc_name VARCHAR(253) NULL AFTER storage_class;
