-- Isolated A Admin-read authorization probe only. The enclosing harness first
-- replays every production migration in its base database. This disposable
-- database keeps only the exact columns read by A's authorization adapter;
-- it does not stand in for D's task query/schema acceptance.
CREATE TABLE users (
  id INT PRIMARY KEY,
  password_hash VARCHAR(255) NOT NULL,
  role ENUM('admin','user') NOT NULL,
  is_active BOOLEAN NOT NULL
) ENGINE=InnoDB;
CREATE TABLE system_backup_installation_state (
  origin_installation_id VARCHAR(128) CHARACTER SET ascii COLLATE ascii_bin PRIMARY KEY,
  active_config_version BIGINT UNSIGNED NOT NULL
) ENGINE=InnoDB;
CREATE TABLE system_backup_configs (
  origin_installation_id VARCHAR(128) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  version BIGINT UNSIGNED NOT NULL,
  provider_proof_issuers_registry_version VARCHAR(128) NOT NULL,
  provider_proof_issuers_registry_sha256 CHAR(64) NOT NULL,
  strong_auth_issuers_registry_version VARCHAR(128) NOT NULL,
  strong_auth_issuers_registry_sha256 CHAR(64) NOT NULL,
  rbac_bindings_registry_version VARCHAR(128) NOT NULL,
  rbac_bindings_registry_sha256 CHAR(64) NOT NULL,
  nonce_hmac_ref_version VARCHAR(128) NOT NULL,
  nonce_hmac_identity_hash CHAR(64) NOT NULL,
  strong_auth_max_age_seconds INT NOT NULL,
  strong_auth_clock_skew_seconds INT NOT NULL,
  provider_proof_max_age_seconds INT NOT NULL,
  evidence_retention_seconds INT NOT NULL,
  control_metadata_retention_seconds INT NOT NULL,
  operation_deadline_seconds INT NOT NULL,
  control_metadata_capacity_bytes BIGINT NOT NULL,
  PRIMARY KEY(origin_installation_id,version)
) ENGINE=InnoDB;
CREATE TABLE system_backup_admin_sessions (
  origin_installation_id VARCHAR(128) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  session_sha256 CHAR(64) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  user_id INT NOT NULL,
  subject VARCHAR(256) NOT NULL,
  credential_hash CHAR(64) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  expires_at DATETIME(6) NOT NULL,
  revoked BOOLEAN NOT NULL DEFAULT FALSE,
  PRIMARY KEY(origin_installation_id,session_sha256),
  FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE RESTRICT
) ENGINE=InnoDB;
CREATE TABLE system_backups (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  origin_installation_id VARCHAR(128) CHARACTER SET ascii COLLATE ascii_bin NOT NULL
) ENGINE=InnoDB;
