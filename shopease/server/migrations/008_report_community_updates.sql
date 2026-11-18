-- Public summaries are authored separately; private report content is not copied.
ALTER TABLE community_updates
  ADD COLUMN source_report_id INT UNSIGNED NULL,
  ADD COLUMN update_type ENUM('Maintenance','Reported issue') NOT NULL DEFAULT 'Maintenance',
  ADD UNIQUE KEY uq_community_source_report (source_report_id),
  ADD CONSTRAINT fk_community_source_report FOREIGN KEY (source_report_id)
    REFERENCES incident_reports(id) ON DELETE RESTRICT;
