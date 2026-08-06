SET @rename_jabatan_table_sql = (
  SELECT IF(
    EXISTS (
      SELECT 1
      FROM INFORMATION_SCHEMA.TABLES
      WHERE TABLE_SCHEMA = DATABASE()
        AND TABLE_NAME = 'jabatan'
    )
    AND NOT EXISTS (
      SELECT 1
      FROM INFORMATION_SCHEMA.TABLES
      WHERE TABLE_SCHEMA = DATABASE()
        AND TABLE_NAME = 'jabatans'
    ),
    'RENAME TABLE `jabatan` TO `jabatans`',
    'SELECT 1'
  )
);

PREPARE rename_jabatan_table_stmt FROM @rename_jabatan_table_sql;
EXECUTE rename_jabatan_table_stmt;
DEALLOCATE PREPARE rename_jabatan_table_stmt;

ALTER TABLE `users`
  ADD COLUMN IF NOT EXISTS `bank_name` VARCHAR(100) NULL AFTER `bank_code`;

ALTER TABLE `users`
  ADD COLUMN IF NOT EXISTS `annual_leave_quota` INTEGER NOT NULL DEFAULT 12 AFTER `wfh_quota_monthly`;

UPDATE `users`
SET `annual_leave_quota` = COALESCE(`leave_quota_yearly`, 12)
WHERE `annual_leave_quota` = 12
  AND `leave_quota_yearly` IS NOT NULL;

ALTER TABLE `Shift`
  ADD COLUMN IF NOT EXISTS `start_time` VARCHAR(10) NOT NULL DEFAULT '08:00' AFTER `tolerance_minutes`;

ALTER TABLE `Shift`
  ADD COLUMN IF NOT EXISTS `end_time` VARCHAR(10) NOT NULL DEFAULT '17:00' AFTER `start_time`;

ALTER TABLE `Shift`
  ADD COLUMN IF NOT EXISTS `check_in_open` VARCHAR(10) NOT NULL DEFAULT '07:00' AFTER `end_time`;

ALTER TABLE `Shift`
  ADD COLUMN IF NOT EXISTS `check_out_open` VARCHAR(10) NOT NULL DEFAULT '16:50' AFTER `check_in_open`;
