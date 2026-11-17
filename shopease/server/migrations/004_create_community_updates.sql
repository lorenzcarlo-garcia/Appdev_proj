-- Applied with owner approval on 2026-11-18 and verified.
-- Do not rerun against the existing bantaylog database.
-- Apply once after migrations 001-003; no existing records are modified.
USE bantaylog;
CREATE TABLE community_updates (
  id INT UNSIGNED NOT NULL AUTO_INCREMENT,
  title VARCHAR(150) NOT NULL,
  summary VARCHAR(2000) NOT NULL,
  location VARCHAR(255) NOT NULL,
  maintenance_status ENUM('Planned','Ongoing','Completed') NOT NULL DEFAULT 'Planned',
  publication_state ENUM('Draft','Published','Archived') NOT NULL DEFAULT 'Draft',
  version INT UNSIGNED NOT NULL DEFAULT 1,
  created_by INT UNSIGNED NOT NULL,
  updated_by INT UNSIGNED NOT NULL,
  published_by INT UNSIGNED NULL,
  published_at DATETIME NULL,
  archived_by INT UNSIGNED NULL,
  archived_at DATETIME NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY ix_community_publication (publication_state, published_at, id),
  CONSTRAINT fk_community_created FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE RESTRICT,
  CONSTRAINT fk_community_updated FOREIGN KEY (updated_by) REFERENCES users(id) ON DELETE RESTRICT,
  CONSTRAINT fk_community_published FOREIGN KEY (published_by) REFERENCES users(id) ON DELETE RESTRICT,
  CONSTRAINT fk_community_archived FOREIGN KEY (archived_by) REFERENCES users(id) ON DELETE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
