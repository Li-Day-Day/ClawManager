-- Native Agent receipts belong to the existing original task/attempt custody.
-- BLOB preserves authenticated response bytes; JSON columns would normalize them.
CREATE TABLE IF NOT EXISTS system_backup_v2_gateway_proofs (
 task_public_id CHAR(40) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
 attempt_no INT UNSIGNED NOT NULL,
 writer_id VARCHAR(128) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
 proof_kind ENUM('stopped','resumed') NOT NULL,
 request_sha256 CHAR(64) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
 body_sha256 CHAR(64) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
 body_raw MEDIUMBLOB NOT NULL,
 created_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
 PRIMARY KEY(task_public_id,attempt_no,writer_id,proof_kind),
 CONSTRAINT sbv2_gateway_proof_control FOREIGN KEY(task_public_id,attempt_no,writer_id) REFERENCES system_backup_v2_runtime_controls(task_public_id,attempt_no,writer_id) ON DELETE RESTRICT,
 CONSTRAINT sbv2_gateway_proof_data CHECK(attempt_no>0 AND request_sha256 REGEXP '^[a-f0-9]{64}$' AND body_sha256 REGEXP '^[a-f0-9]{64}$' AND OCTET_LENGTH(body_raw) BETWEEN 2 AND 65536 AND JSON_VALID(CONVERT(body_raw USING utf8mb4)))
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
