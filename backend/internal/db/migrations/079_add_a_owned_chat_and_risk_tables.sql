-- A-owned AI Gateway tables previously created lazily by repositories.
-- Keep schema creation in the embedded migration catalog so backup inventory,
-- fresh installs, and live schema evidence observe the same contract.
CREATE TABLE IF NOT EXISTS chat_sessions (
  id INT AUTO_INCREMENT PRIMARY KEY,
  session_id VARCHAR(100) NOT NULL UNIQUE,
  user_id INT NULL,
  instance_id INT NULL,
  title VARCHAR(255) NULL,
  last_trace_id VARCHAR(100) NULL,
  started_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  last_activity_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_chat_sessions_user_id (user_id),
  INDEX idx_chat_sessions_instance_id (instance_id),
  INDEX idx_chat_sessions_last_activity_at (last_activity_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS chat_messages (
  id INT AUTO_INCREMENT PRIMARY KEY,
  trace_id VARCHAR(100) NOT NULL,
  session_id VARCHAR(100) NOT NULL,
  request_id VARCHAR(100) NULL,
  user_id INT NULL,
  instance_id INT NULL,
  invocation_id INT NULL,
  role VARCHAR(50) NOT NULL,
  content LONGTEXT NOT NULL,
  sequence_no INT NOT NULL DEFAULT 0,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_chat_messages_trace_id (trace_id),
  INDEX idx_chat_messages_session_id (session_id),
  INDEX idx_chat_messages_request_id (request_id),
  INDEX idx_chat_messages_user_id (user_id),
  INDEX idx_chat_messages_sequence_no (sequence_no)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS risk_rules (
  id INT AUTO_INCREMENT PRIMARY KEY,
  rule_id VARCHAR(100) NOT NULL UNIQUE,
  display_name VARCHAR(255) NOT NULL,
  description TEXT NULL,
  pattern TEXT NOT NULL,
  severity VARCHAR(20) NOT NULL,
  action VARCHAR(50) NOT NULL,
  is_enabled BOOLEAN NOT NULL DEFAULT TRUE,
  sort_order INT NOT NULL DEFAULT 0,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_risk_rules_enabled (is_enabled),
  INDEX idx_risk_rules_sort (sort_order)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Move the repository's legacy provider-type normalization into the migration
-- catalog. Repository constructors must not mutate schema or data at runtime.
UPDATE llm_models
SET protocol_type = CASE
  WHEN LOWER(TRIM(provider_type)) = 'local' THEN 'openai-compatible'
  WHEN LOWER(TRIM(provider_type)) = 'openai' THEN 'openai'
  WHEN LOWER(TRIM(provider_type)) = 'anthropic' THEN 'anthropic'
  WHEN LOWER(TRIM(provider_type)) = 'google' THEN 'google'
  WHEN LOWER(TRIM(provider_type)) = 'azure-openai' THEN 'azure-openai'
  ELSE 'openai-compatible'
END
WHERE protocol_type IS NULL OR TRIM(protocol_type) = '';
