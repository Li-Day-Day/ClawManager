-- D candidate only. Review and number as a separate migration after the
-- installed catalog and owner signoffs are reconciled. Do not run on an
-- installation from this file.
-- Existing rows remain NULL until their exact original canonical bytes have
-- been verified against config_sha256 and config_size_bytes and backfilled.

ALTER TABLE system_backup_configs
  ADD COLUMN canonical_config_json MEDIUMBLOB NULL AFTER config_size_bytes,
  ADD CONSTRAINT chk_sb_config_canonical_json CHECK (
    canonical_config_json IS NULL OR (
      OCTET_LENGTH(canonical_config_json) = config_size_bytes
      AND JSON_VALID(CONVERT(canonical_config_json USING utf8mb4))
    )
  );
