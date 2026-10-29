-- Additive D execution custody; no new task, gate or authorization service.
CREATE TABLE IF NOT EXISTS system_backup_v2_relay_receipts (
 origin_installation_id VARCHAR(128) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
 task_public_id CHAR(40) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
 attempt_no INT UNSIGNED NOT NULL,
 phase VARCHAR(32) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
 job_unit_key VARCHAR(128) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
 sequence_no BIGINT UNSIGNED NOT NULL,
 body_sha256 CHAR(64) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
 body_json MEDIUMBLOB NOT NULL,
 created_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
 PRIMARY KEY(origin_installation_id,task_public_id,attempt_no,phase,job_unit_key,sequence_no),
 CONSTRAINT sbv2_relay_receipt_task FOREIGN KEY(task_public_id) REFERENCES system_backup_v2_backups(public_id) ON DELETE RESTRICT,
 CONSTRAINT sbv2_relay_receipt_data CHECK(sequence_no>0 AND attempt_no>0 AND phase='capture' AND body_sha256 REGEXP '^[a-f0-9]{64}$' AND OCTET_LENGTH(body_json) BETWEEN 2 AND 65536 AND JSON_VALID(CONVERT(body_json USING utf8mb4)))
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS system_backup_v2_runtime_controls (
 task_public_id CHAR(40) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
 attempt_no INT UNSIGNED NOT NULL,
 writer_id VARCHAR(128) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
 instance_id INT NOT NULL,
 spec_json MEDIUMBLOB NOT NULL,
 material_sha256 CHAR(64) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
 key_ref VARCHAR(256) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
 sealed_material MEDIUMBLOB NOT NULL,
 restart_claimed BOOLEAN NOT NULL DEFAULT FALSE,
 restart_completed BOOLEAN NOT NULL DEFAULT FALSE,
 resumed_json BLOB NULL,
 stopped_sha256 CHAR(64) CHARACTER SET ascii COLLATE ascii_bin NULL,
 row_version BIGINT UNSIGNED NOT NULL DEFAULT 1,
 active_instance_id INT GENERATED ALWAYS AS (IF(restart_completed,NULL,instance_id)) STORED,
 PRIMARY KEY(task_public_id,attempt_no,writer_id),
 UNIQUE KEY sbv2_runtime_active_source(active_instance_id),
 CONSTRAINT sbv2_runtime_control_task FOREIGN KEY(task_public_id) REFERENCES system_backup_v2_backups(public_id) ON DELETE RESTRICT,
 CONSTRAINT sbv2_runtime_control_data CHECK(attempt_no>0 AND instance_id>0 AND row_version>0 AND material_sha256 REGEXP '^[a-f0-9]{64}$' AND JSON_VALID(CONVERT(spec_json USING utf8mb4)) AND OCTET_LENGTH(spec_json) BETWEEN 2 AND 65536 AND OCTET_LENGTH(sealed_material) BETWEEN 2 AND 8388608),
 CONSTRAINT sbv2_runtime_control_completed CHECK(NOT restart_completed OR resumed_json IS NOT NULL)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
