-- D internal candidate only. Not in the embedded migration catalog and not
-- installed. No runtime grant or provider deletion authority is created.
-- Exact migration number, catalog hash, registry and reference collectors
-- must be reviewed together before this enters backend/internal/db/migrations.

ALTER TABLE system_backup_staging_resources
  ADD UNIQUE KEY uk_sb_staging_origin_public (origin_installation_id, public_id);
ALTER TABLE system_restore_drill_resources
  ADD UNIQUE KEY uk_sb_restore_origin_public (origin_installation_id, public_id);

-- One immutable timing record per resource cleanup attempt. A takeover reads
-- the existing record. A genuinely new explicit operation appends a record;
-- it does not overwrite the original automatic or previous operation clock.
CREATE TABLE system_backup_cleanup_attempts (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  schema_version VARCHAR(64) CHARACTER SET ascii COLLATE ascii_bin NOT NULL DEFAULT 'system-backup-cleanup-attempt.v1',
  origin_installation_id VARCHAR(128) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  parent_type ENUM('backup', 'drill') NOT NULL,
  parent_public_id CHAR(40) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  resource_type ENUM('backup_staging', 'restore_resource') NOT NULL,
  resource_public_id CHAR(40) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  attempt_sequence BIGINT UNSIGNED NOT NULL,
  clock_source ENUM('automatic_backup', 'automatic_drill', 'operation') NOT NULL,
  cleanup_operation_id BIGINT UNSIGNED NULL,
  config_version BIGINT UNSIGNED NOT NULL,
  config_sha256 CHAR(64) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  started_at DATETIME(6) NOT NULL,
  deadline_at DATETIME(6) NOT NULL,
  created_at DATETIME(6) NOT NULL,
  automatic_resource_public_id CHAR(40) CHARACTER SET ascii COLLATE ascii_bin
    GENERATED ALWAYS AS (CASE WHEN clock_source <> 'operation' THEN resource_public_id ELSE NULL END) STORED,
  backup_public_id CHAR(40) CHARACTER SET ascii COLLATE ascii_bin
    GENERATED ALWAYS AS (CASE WHEN parent_type = 'backup' THEN parent_public_id ELSE NULL END) STORED,
  drill_public_id CHAR(40) CHARACTER SET ascii COLLATE ascii_bin
    GENERATED ALWAYS AS (CASE WHEN parent_type = 'drill' THEN parent_public_id ELSE NULL END) STORED,
  staging_public_id CHAR(40) CHARACTER SET ascii COLLATE ascii_bin
    GENERATED ALWAYS AS (CASE WHEN resource_type = 'backup_staging' THEN resource_public_id ELSE NULL END) STORED,
  restore_resource_public_id CHAR(40) CHARACTER SET ascii COLLATE ascii_bin
    GENERATED ALWAYS AS (CASE WHEN resource_type = 'restore_resource' THEN resource_public_id ELSE NULL END) STORED,
  UNIQUE KEY uk_sb_cleanup_attempt_sequence (origin_installation_id, resource_type, resource_public_id, attempt_sequence),
  UNIQUE KEY uk_sb_cleanup_attempt_automatic (origin_installation_id, automatic_resource_public_id),
  UNIQUE KEY uk_sb_cleanup_attempt_operation (origin_installation_id, resource_type, resource_public_id, cleanup_operation_id),
  KEY idx_sb_cleanup_attempt_parent (origin_installation_id, parent_type, parent_public_id, id),
  KEY idx_sb_cleanup_attempt_operation (cleanup_operation_id),
  CONSTRAINT fk_sb_cleanup_attempt_config FOREIGN KEY (origin_installation_id, config_version)
    REFERENCES system_backup_configs(origin_installation_id, version) ON DELETE RESTRICT,
  CONSTRAINT fk_sb_cleanup_attempt_backup FOREIGN KEY (origin_installation_id, backup_public_id)
    REFERENCES system_backups(origin_installation_id, public_id) ON DELETE RESTRICT,
  CONSTRAINT fk_sb_cleanup_attempt_drill FOREIGN KEY (origin_installation_id, drill_public_id)
    REFERENCES system_restore_drills(origin_installation_id, public_id) ON DELETE RESTRICT,
  CONSTRAINT fk_sb_cleanup_attempt_staging FOREIGN KEY (origin_installation_id, staging_public_id)
    REFERENCES system_backup_staging_resources(origin_installation_id, public_id) ON DELETE RESTRICT,
  CONSTRAINT fk_sb_cleanup_attempt_restore_resource FOREIGN KEY (origin_installation_id, restore_resource_public_id)
    REFERENCES system_restore_drill_resources(origin_installation_id, public_id) ON DELETE RESTRICT,
  -- This FK proves existence only. The writer and reader still compare the
  -- operation installation, type, target and original creation/deadline facts.
  CONSTRAINT fk_sb_cleanup_attempt_operation FOREIGN KEY (cleanup_operation_id)
    REFERENCES system_backup_operations(id) ON DELETE RESTRICT,
  CONSTRAINT chk_sb_cleanup_attempt_identity CHECK (
    schema_version = 'system-backup-cleanup-attempt.v1'
    AND origin_installation_id REGEXP '^installation_[A-Za-z0-9._:-]{1,115}$'
    AND attempt_sequence >= 1 AND config_version BETWEEN 1 AND 9007199254740991
    AND config_sha256 REGEXP '^[0-9a-f]{64}$'
    AND ((parent_type = 'backup' AND resource_type = 'backup_staging'
      AND parent_public_id REGEXP '^sbk_[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
      AND resource_public_id REGEXP '^sbs_[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$')
    OR (parent_type = 'drill' AND resource_type = 'restore_resource'
      AND parent_public_id REGEXP '^sdr_[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
      AND resource_public_id REGEXP '^srr_[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'))
  ),
  CONSTRAINT chk_sb_cleanup_attempt_source CHECK (
    (clock_source = 'automatic_backup' AND parent_type = 'backup' AND cleanup_operation_id IS NULL)
    OR (clock_source = 'automatic_drill' AND parent_type = 'drill' AND cleanup_operation_id IS NULL)
    OR (clock_source = 'operation' AND cleanup_operation_id IS NOT NULL)
  ),
  CONSTRAINT chk_sb_cleanup_attempt_window CHECK (
    deadline_at > started_at AND created_at >= started_at
    AND ((clock_source <> 'operation' AND started_at = created_at
      AND TIMESTAMPDIFF(MICROSECOND, started_at, deadline_at) BETWEEN 60000000 AND 21600000000
      AND MOD(TIMESTAMPDIFF(MICROSECOND, started_at, deadline_at), 1000000) = 0)
    OR (clock_source = 'operation' AND TIMESTAMPDIFF(MICROSECOND, started_at, deadline_at) BETWEEN 60000000 AND 86400000000
      AND MOD(TIMESTAMPDIFF(MICROSECOND, started_at, deadline_at), 1000000) = 0))
  )
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
