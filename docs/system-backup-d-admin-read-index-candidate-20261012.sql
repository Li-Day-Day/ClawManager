-- D candidate for review only. Do not execute against an installed database.
-- The task page reader uses (origin_installation_id, id) and the optional
-- immutable cursor plus status filter. These indexes are not a numbered
-- migration and have no production approval yet.

ALTER TABLE system_backups
  ADD INDEX idx_sb_backup_admin_page (origin_installation_id, id),
  ADD INDEX idx_sb_backup_admin_status_page (origin_installation_id, status, id);

ALTER TABLE system_restore_drills
  ADD INDEX idx_sb_drill_admin_page (origin_installation_id, id),
  ADD INDEX idx_sb_drill_admin_status_page (origin_installation_id, status, id);

ALTER TABLE system_backup_preflights
  ADD INDEX idx_sb_preflight_admin_page (origin_installation_id, id),
  ADD INDEX idx_sb_preflight_admin_status_page (origin_installation_id, status, id);

ALTER TABLE system_backup_artifact_verifications
  ADD INDEX idx_sb_verify_admin_page (origin_installation_id, id),
  ADD INDEX idx_sb_verify_admin_status_page (origin_installation_id, status, id);

-- Operation list uses the same installation-scoped id keyset without status.
ALTER TABLE system_backup_operations
  ADD INDEX idx_sb_operation_admin_page (origin_installation_id, id);
