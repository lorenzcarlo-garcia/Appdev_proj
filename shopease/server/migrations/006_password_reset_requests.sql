-- Apply once after migrations 001-005. No account credentials are changed.
CREATE TABLE password_reset_requests (
  email_key CHAR(64) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  request_id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NULL,
  user_id INT UNSIGNED NULL,
  code_hash CHAR(64) CHARACTER SET ascii COLLATE ascii_bin NULL,
  credential_tag CHAR(64) CHARACTER SET ascii COLLATE ascii_bin NULL,
  requested_at DATETIME NULL,
  expires_at DATETIME NULL,
  used_at DATETIME NULL,
  attempts TINYINT UNSIGNED NOT NULL DEFAULT 0,
  window_started_at DATETIME NULL,
  request_count TINYINT UNSIGNED NOT NULL DEFAULT 0,
  PRIMARY KEY (email_key),
  UNIQUE KEY uq_password_reset_request (request_id),
  CONSTRAINT fk_password_reset_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB;
