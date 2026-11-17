-- Applied with owner approval on 2026-11-18 and verified.
-- Do not rerun against the existing bantaylog database.
-- For a fresh installation, apply once after migrations 001 and 002.
USE bantaylog;
CREATE TABLE report_attachments (
  id INT UNSIGNED NOT NULL AUTO_INCREMENT,
  report_id INT UNSIGNED NOT NULL,
  uploaded_by INT UNSIGNED NOT NULL,
  stored_name CHAR(37) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  mime_type VARCHAR(30) NOT NULL,
  byte_size INT UNSIGNED NOT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_report_attachment_name (stored_name),
  KEY ix_report_attachments_report (report_id),
  CONSTRAINT fk_report_attachment_report FOREIGN KEY (report_id) REFERENCES incident_reports(id) ON DELETE RESTRICT,
  CONSTRAINT fk_report_attachment_user FOREIGN KEY (uploaded_by) REFERENCES users(id) ON DELETE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
