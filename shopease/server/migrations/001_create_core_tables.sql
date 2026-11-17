-- BantayLog migration 001: core tables
-- STATUS: Applied by owner and verified in MySQL Workbench.
-- Restored migration source: do not rerun against the existing database.
-- For a new installation, run once against a verified empty bantaylog database.
-- Verify utf8mb4 / utf8mb4_unicode_ci database defaults first.
-- DDL may leave partial tables on failure; inspect before retrying.
-- Authorization, validation, and retention rules require backend enforcement.
-- Target database: bantaylog (empty, utf8mb4)
-- Contains no DROP, TRUNCATE, or destructive statements.

USE bantaylog;

-- 1. users: login accounts (residents and staff)
CREATE TABLE users (
  id            INT UNSIGNED NOT NULL AUTO_INCREMENT,
  resident_id   INT UNSIGNED NULL,
  email         VARCHAR(150) NOT NULL,
  password_hash VARCHAR(255) NOT NULL,
  role          ENUM('resident','staff','secretary','captain','super_admin') NOT NULL DEFAULT 'resident',
  is_active     TINYINT(1) NOT NULL DEFAULT 1,
  last_login_at DATETIME NULL,
  created_at    DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at    DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_users_email (email),
  UNIQUE KEY uq_users_resident (resident_id),
  KEY idx_users_role (role)
) ENGINE=InnoDB;

-- 2. residents: resident records (may or may not have an account)
CREATE TABLE residents (
  id          INT UNSIGNED NOT NULL AUTO_INCREMENT,
  first_name  VARCHAR(80) NOT NULL,
  middle_name VARCHAR(80) NULL,
  last_name   VARCHAR(80) NOT NULL,
  birth_date  DATE NULL,
  contact_no  VARCHAR(20) NULL,
  address     VARCHAR(255) NOT NULL,
  is_verified TINYINT(1) NOT NULL DEFAULT 0,
  verified_by INT UNSIGNED NULL,
  verified_at DATETIME NULL,
  created_by  INT UNSIGNED NULL,
  created_at  DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at  DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_residents_name (last_name, first_name),
  KEY idx_residents_verified (is_verified),
  CONSTRAINT fk_residents_verified_by FOREIGN KEY (verified_by) REFERENCES users(id) ON DELETE SET NULL,
  CONSTRAINT fk_residents_created_by  FOREIGN KEY (created_by)  REFERENCES users(id) ON DELETE SET NULL
) ENGINE=InnoDB;

-- users.resident_id added after residents exists (avoids circular dependency)
ALTER TABLE users
  ADD CONSTRAINT fk_users_resident FOREIGN KEY (resident_id) REFERENCES residents(id) ON DELETE RESTRICT;

-- 3. incident_categories
CREATE TABLE incident_categories (
  id          INT UNSIGNED NOT NULL AUTO_INCREMENT,
  name        VARCHAR(100) NOT NULL,
  description VARCHAR(255) NULL,
  is_active   TINYINT(1) NOT NULL DEFAULT 1,
  created_at  DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at  DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_categories_name (name)
) ENGINE=InnoDB;

-- 4. incident_reports: private drafts and submitted reports
-- Drafts have NULL status/reference. Submission must validate required fields
-- and assign stage, status, reference, and initial history in one transaction.
-- Cancellation is final and permitted only for submitted reports in Submitted status.
CREATE TABLE incident_reports (
  id            INT UNSIGNED NOT NULL AUTO_INCREMENT,
  reference_no  VARCHAR(30) NULL,
  user_id       INT UNSIGNED NOT NULL,
  category_id   INT UNSIGNED NULL,
  title         VARCHAR(150) NULL,
  description   TEXT NULL,
  location      VARCHAR(255) NULL,
  incident_date DATETIME NULL,
  submission_stage ENUM('Draft','Submitted') NOT NULL DEFAULT 'Draft',
  status        ENUM('Submitted','Under Investigation','Scheduled for Action','Resolved') NULL DEFAULT NULL,
  cancelled_at  DATETIME NULL,
  cancelled_by  INT UNSIGNED NULL,
  created_at    DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at    DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_reports_reference (reference_no),
  KEY idx_reports_user (user_id),
  KEY idx_reports_category (category_id),
  KEY idx_reports_status (status),
  KEY idx_reports_created (created_at),
  KEY idx_reports_stage_cancel_status (submission_stage, cancelled_at, status),
  CONSTRAINT fk_reports_cancelled_by FOREIGN KEY (cancelled_by) REFERENCES users(id) ON DELETE RESTRICT,
  CONSTRAINT fk_reports_user     FOREIGN KEY (user_id)     REFERENCES users(id) ON DELETE RESTRICT,
  CONSTRAINT fk_reports_category FOREIGN KEY (category_id) REFERENCES incident_categories(id) ON DELETE RESTRICT
) ENGINE=InnoDB;

-- 5. blotter_records: official records (never hard-deleted; archived instead)
CREATE TABLE blotter_records (
  id              INT UNSIGNED NOT NULL AUTO_INCREMENT,
  blotter_no      VARCHAR(30) NULL,
  report_id       INT UNSIGNED NULL,
  category_id     INT UNSIGNED NOT NULL,
  complainant_name VARCHAR(150) NOT NULL,
  respondent_name  VARCHAR(150) NULL,
  narrative       TEXT NOT NULL,
  incident_date   DATETIME NOT NULL,
  location        VARCHAR(255) NOT NULL,
  recorded_by     INT UNSIGNED NOT NULL,
  approved_by     INT UNSIGNED NULL,
  approved_at     DATETIME NULL,
  archived_at     DATETIME NULL,
  archived_by     INT UNSIGNED NULL,
  created_at      DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at      DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_blotter_no (blotter_no),
  UNIQUE KEY uq_blotter_report (report_id),
  KEY idx_blotter_category (category_id),
  KEY idx_blotter_incident_date (incident_date),
  KEY idx_blotter_archived (archived_at),
  CONSTRAINT fk_blotter_report      FOREIGN KEY (report_id)   REFERENCES incident_reports(id) ON DELETE RESTRICT,
  CONSTRAINT fk_blotter_category    FOREIGN KEY (category_id) REFERENCES incident_categories(id) ON DELETE RESTRICT,
  CONSTRAINT fk_blotter_recorded_by FOREIGN KEY (recorded_by) REFERENCES users(id) ON DELETE RESTRICT,
  CONSTRAINT fk_blotter_approved_by FOREIGN KEY (approved_by) REFERENCES users(id) ON DELETE RESTRICT,
  CONSTRAINT fk_blotter_archived_by FOREIGN KEY (archived_by) REFERENCES users(id) ON DELETE RESTRICT
) ENGINE=InnoDB;

-- 6. report_status_history: append-only audit trail
CREATE TABLE report_status_history (
  id         INT UNSIGNED NOT NULL AUTO_INCREMENT,
  report_id  INT UNSIGNED NOT NULL,
  old_status ENUM('Submitted','Under Investigation','Scheduled for Action','Resolved') NULL,
  new_status ENUM('Submitted','Under Investigation','Scheduled for Action','Resolved') NOT NULL,
  changed_by INT UNSIGNED NOT NULL,
  remarks    VARCHAR(500) NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_history_report (report_id, created_at),
  CONSTRAINT fk_history_report     FOREIGN KEY (report_id)  REFERENCES incident_reports(id) ON DELETE RESTRICT,
  CONSTRAINT fk_history_changed_by FOREIGN KEY (changed_by) REFERENCES users(id) ON DELETE RESTRICT
) ENGINE=InnoDB;

-- Starter categories (from the project objectives)
INSERT INTO incident_categories (name, description) VALUES
  ('Broken Streetlight', 'Streetlights that are not working'),
  ('Noise Complaint',    'Excessive or disruptive noise'),
  ('Clogged Drainage',   'Blocked or overflowing drainage'),
  ('Other',              'Other community concerns');
