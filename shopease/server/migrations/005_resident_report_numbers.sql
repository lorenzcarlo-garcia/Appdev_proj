-- Apply once after migrations 001-004. Existing system references stay unchanged.
-- Drafts, including cancelled drafts, do not receive a resident report number.
ALTER TABLE incident_reports
  ADD COLUMN resident_report_no INT UNSIGNED NULL AFTER reference_no,
  ADD UNIQUE KEY uq_reports_resident_number (user_id, resident_report_no);

CREATE TABLE resident_report_counters (
  user_id INT UNSIGNED NOT NULL,
  last_report_no INT UNSIGNED NOT NULL,
  PRIMARY KEY (user_id),
  CONSTRAINT fk_resident_report_counter_user FOREIGN KEY (user_id)
    REFERENCES users(id) ON DELETE RESTRICT
) ENGINE=InnoDB;

START TRANSACTION;
UPDATE incident_reports AS report
JOIN (
  SELECT original.id,
    ROW_NUMBER() OVER (
      PARTITION BY original.user_id
      ORDER BY COALESCE((SELECT MIN(history.created_at)
        FROM report_status_history AS history
        WHERE history.report_id = original.id AND history.old_status IS NULL
          AND history.new_status = 'Submitted'), original.created_at), original.id
    ) AS resident_number
  FROM incident_reports AS original WHERE original.submission_stage = 'Submitted'
) AS numbered ON numbered.id = report.id
SET report.resident_report_no = numbered.resident_number,
    report.updated_at = report.updated_at;

INSERT INTO resident_report_counters (user_id, last_report_no)
SELECT user_id, MAX(resident_report_no) FROM incident_reports
WHERE resident_report_no IS NOT NULL GROUP BY user_id;
COMMIT;
