-- D's KEK facts are subordinate to the original installation/config/Job transaction.
-- No row here grants Generate, Unwrap, retirement or complete-scan authority.
CREATE TABLE IF NOT EXISTS system_backup_v2_kek_fences (
 installation_id VARCHAR(128) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
 epoch BIGINT UNSIGNED NOT NULL DEFAULT 0,
 created_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
 PRIMARY KEY(installation_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS system_backup_v2_kek_bindings (
 installation_id VARCHAR(128) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
 identity_hash CHAR(64) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
 registry_version VARCHAR(128) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
 binding_sha256 CHAR(64) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
 core_sha256 CHAR(64) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
 core_json MEDIUMBLOB NOT NULL,
 row_version BIGINT UNSIGNED NOT NULL DEFAULT 1,
 generate_revocation_json BLOB NULL,
 unwrap_revocation_json BLOB NULL,
 PRIMARY KEY(installation_id,identity_hash,registry_version),
 CONSTRAINT sbv2_kek_binding_fence FOREIGN KEY(installation_id) REFERENCES system_backup_v2_kek_fences(installation_id) ON DELETE RESTRICT,
 CONSTRAINT sbv2_kek_binding_core CHECK(binding_sha256 REGEXP '^[a-f0-9]{64}$' AND core_sha256 REGEXP '^[a-f0-9]{64}$' AND JSON_VALID(CONVERT(core_json USING utf8mb4)))
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS system_backup_v2_kek_admissions (
 installation_id VARCHAR(128) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
 operation_id VARCHAR(128) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
 config_sha256 CHAR(64) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
 config_version BIGINT UNSIGNED NOT NULL,
 identity_hash CHAR(64) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
 registry_version VARCHAR(128) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
 observation_sha256 CHAR(64) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
 observation_json BLOB NOT NULL,
 created_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
 PRIMARY KEY(installation_id,operation_id),
 KEY sbv2_kek_admission_config(installation_id,config_sha256),
 CONSTRAINT sbv2_kek_admission_binding FOREIGN KEY(installation_id,identity_hash,registry_version) REFERENCES system_backup_v2_kek_bindings(installation_id,identity_hash,registry_version) ON DELETE RESTRICT,
 CONSTRAINT sbv2_kek_admission_data CHECK(config_version>0 AND config_sha256 REGEXP '^[a-f0-9]{64}$' AND observation_sha256 REGEXP '^[a-f0-9]{64}$' AND JSON_VALID(CONVERT(observation_json USING utf8mb4)))
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS system_backup_v2_kek_coverage (
 installation_id VARCHAR(128) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
 partition_name VARCHAR(64) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
 source_id VARCHAR(256) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
 source_sha256 CHAR(64) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
 source_json BLOB NOT NULL,
 PRIMARY KEY(installation_id,partition_name,source_id),
 CONSTRAINT sbv2_kek_coverage_fence FOREIGN KEY(installation_id) REFERENCES system_backup_v2_kek_fences(installation_id) ON DELETE RESTRICT,
 CONSTRAINT sbv2_kek_coverage_data CHECK(source_sha256 REGEXP '^[a-f0-9]{64}$' AND JSON_VALID(CONVERT(source_json USING utf8mb4)))
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS system_backup_v2_kek_references (
 installation_id VARCHAR(128) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
 partition_name VARCHAR(64) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
 source_record_id VARCHAR(256) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
 source_record_version VARCHAR(128) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
 identity_hash CHAR(64) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
 registry_version VARCHAR(128) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
 reference_state ENUM('planned','unknown','retained','released') NOT NULL,
 reference_sha256 CHAR(64) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
 reference_json MEDIUMBLOB NOT NULL,
 created_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
 PRIMARY KEY(installation_id,partition_name,source_record_id,source_record_version),
 KEY sbv2_kek_reference_binding(installation_id,identity_hash,registry_version),
 CONSTRAINT sbv2_kek_reference_binding_fk FOREIGN KEY(installation_id,identity_hash,registry_version) REFERENCES system_backup_v2_kek_bindings(installation_id,identity_hash,registry_version) ON DELETE RESTRICT,
 CONSTRAINT sbv2_kek_reference_data CHECK(reference_sha256 REGEXP '^[a-f0-9]{64}$' AND JSON_VALID(CONVERT(reference_json USING utf8mb4)))
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
