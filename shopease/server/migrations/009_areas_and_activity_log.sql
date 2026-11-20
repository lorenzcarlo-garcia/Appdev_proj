-- Apply once after migrations 001-008. Additive only: no existing rows are changed.
-- Approved by the owner on 2026-11-20 (areas managed in the app; durable activity log).
-- MySQL DDL commits implicitly. Take a mysqldump backup first; do not rerun.

-- Areas/puroks are entered by Secretary or Super Admin in the app. None are seeded here,
-- because the official list must come from the barangay.
CREATE TABLE report_areas (
  id INT UNSIGNED NOT NULL AUTO_INCREMENT,
  name VARCHAR(100) NOT NULL,
  description VARCHAR(255) NULL,
  is_active TINYINT(1) NOT NULL DEFAULT 1,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_report_areas_name (name)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Existing reports keep area_id NULL ("Unassigned"); their location text is unchanged.
ALTER TABLE incident_reports
  ADD COLUMN area_id INT UNSIGNED NULL AFTER location,
  ADD KEY idx_reports_area (area_id),
  ADD CONSTRAINT fk_reports_area FOREIGN KEY (area_id) REFERENCES report_areas(id) ON DELETE RESTRICT;

-- Append-only record of barangay actions. Entries hold generated, non-personal text only:
-- no remarks, resident names, contact details, passwords, codes or request bodies.
CREATE TABLE activity_log (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  actor_id INT UNSIGNED NOT NULL,
  actor_role ENUM('resident','staff','secretary','captain','super_admin') NOT NULL,
  action VARCHAR(40) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  entity_type ENUM('report','blotter','community_update','resident','category','area','staff_account') NOT NULL,
  entity_id INT UNSIGNED NULL,
  entity_ref VARCHAR(160) NULL,
  detail VARCHAR(255) NULL,
  visibility ENUM('administrative','super_admin') NOT NULL DEFAULT 'administrative',
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_activity_created (created_at, id),
  KEY idx_activity_entity (entity_type, entity_id),
  CONSTRAINT fk_activity_actor FOREIGN KEY (actor_id) REFERENCES users(id) ON DELETE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
