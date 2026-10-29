-- One bounded KEK-use observation per original Job/envelope. This records no
-- credentials or DEK and introduces no task authority or recovery grant.
ALTER TABLE system_backup_v2_runtime_resources
 ADD COLUMN key_use_json BLOB NULL,
 ADD CONSTRAINT sbv2_runtime_key_use CHECK (
   key_use_json IS NULL OR (resource_kind='Job'
     AND OCTET_LENGTH(key_use_json) BETWEEN 2 AND 16384
     AND JSON_VALID(CONVERT(key_use_json USING utf8mb4)))
 );
