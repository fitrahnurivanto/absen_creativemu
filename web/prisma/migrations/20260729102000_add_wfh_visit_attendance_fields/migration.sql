-- Add attendance fields used by WFH, visit, photo storage, and late/early notes.
ALTER TABLE `Attendance`
    ADD COLUMN `check_in_photo_url` TEXT NULL,
    ADD COLUMN `check_in_photo_public_id` VARCHAR(255) NULL,
    ADD COLUMN `check_out_photo_url` TEXT NULL,
    ADD COLUMN `check_out_photo_public_id` VARCHAR(255) NULL,
    ADD COLUMN `work_mode` VARCHAR(20) NOT NULL DEFAULT 'office',
    ADD COLUMN `is_over_tolerance` BOOLEAN NOT NULL DEFAULT false,
    ADD COLUMN `late_reason` VARCHAR(255) NULL,
    ADD COLUMN `early_leave_reason` VARCHAR(255) NULL,
    ADD COLUMN `is_wfh` BOOLEAN NOT NULL DEFAULT false,
    ADD COLUMN `is_wfc` BOOLEAN NOT NULL DEFAULT false,
    ADD COLUMN `is_visit` BOOLEAN NOT NULL DEFAULT false,
    ADD COLUMN `wfh_request_id` CHAR(36) NULL,
    ADD COLUMN `activity_note` VARCHAR(255) NULL;

ALTER TABLE `AttendanceMonthlySummary`
    ADD COLUMN `total_wfh_days` INTEGER NOT NULL DEFAULT 0,
    ADD COLUMN `total_wfc_days` INTEGER NOT NULL DEFAULT 0,
    ADD COLUMN `total_visit_days` INTEGER NOT NULL DEFAULT 0;

CREATE TABLE `EmployeeVisit` (
    `id` CHAR(36) NOT NULL,
    `user_id` CHAR(36) NOT NULL,
    `attendance_id` CHAR(36) NULL,
    `visit_date` DATE NOT NULL,
    `title` VARCHAR(150) NOT NULL,
    `client_name` VARCHAR(100) NULL,
    `address` VARCHAR(255) NULL,
    `latitude` DOUBLE NULL,
    `longitude` DOUBLE NULL,
    `accuracy` DOUBLE NULL,
    `start_time` DATETIME(3) NULL,
    `end_time` DATETIME(3) NULL,
    `note` VARCHAR(255) NULL,
    `status` VARCHAR(20) NOT NULL DEFAULT 'planned',
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `EmployeeVisit_visit_date_idx`(`visit_date`),
    INDEX `EmployeeVisit_status_idx`(`status`),
    INDEX `EmployeeVisit_user_id_idx`(`user_id`),
    INDEX `EmployeeVisit_attendance_id_idx`(`attendance_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `WfhRequest` (
    `id` CHAR(36) NOT NULL,
    `user_id` CHAR(36) NOT NULL,
    `request_date` DATE NOT NULL,
    `reason` TEXT NOT NULL,
    `status` VARCHAR(20) NOT NULL DEFAULT 'pending',
    `allowed_radius_meters` INTEGER NULL DEFAULT 500,
    `approved_by_id` CHAR(36) NULL,
    `admin_note` VARCHAR(255) NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `WfhRequest_request_date_idx`(`request_date`),
    INDEX `WfhRequest_status_idx`(`status`),
    INDEX `WfhRequest_user_id_idx`(`user_id`),
    INDEX `WfhRequest_approved_by_id_idx`(`approved_by_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `AdminNotification` (
    `id` CHAR(36) NOT NULL,
    `attendance_id` CHAR(36) NULL,
    `user_id` CHAR(36) NOT NULL,
    `type` VARCHAR(50) NOT NULL,
    `title` VARCHAR(150) NOT NULL,
    `message` TEXT NOT NULL,
    `status` VARCHAR(20) NOT NULL DEFAULT 'unread',
    `is_read` BOOLEAN NOT NULL DEFAULT false,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `AdminNotification_type_idx`(`type`),
    INDEX `AdminNotification_status_idx`(`status`),
    INDEX `AdminNotification_is_read_idx`(`is_read`),
    INDEX `AdminNotification_created_at_idx`(`created_at`),
    INDEX `AdminNotification_attendance_id_idx`(`attendance_id`),
    INDEX `AdminNotification_user_id_idx`(`user_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE INDEX `Attendance_work_mode_idx` ON `Attendance`(`work_mode`);
CREATE INDEX `Attendance_is_wfh_idx` ON `Attendance`(`is_wfh`);
CREATE INDEX `Attendance_is_wfc_idx` ON `Attendance`(`is_wfc`);
CREATE INDEX `Attendance_is_visit_idx` ON `Attendance`(`is_visit`);
CREATE INDEX `Attendance_wfh_request_id_idx` ON `Attendance`(`wfh_request_id`);

ALTER TABLE `Attendance` ADD CONSTRAINT `Attendance_wfh_request_id_fkey` FOREIGN KEY (`wfh_request_id`) REFERENCES `WfhRequest`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE `EmployeeVisit` ADD CONSTRAINT `EmployeeVisit_user_id_fkey` FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE `EmployeeVisit` ADD CONSTRAINT `EmployeeVisit_attendance_id_fkey` FOREIGN KEY (`attendance_id`) REFERENCES `Attendance`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE `WfhRequest` ADD CONSTRAINT `WfhRequest_user_id_fkey` FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE `WfhRequest` ADD CONSTRAINT `WfhRequest_approved_by_id_fkey` FOREIGN KEY (`approved_by_id`) REFERENCES `users`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE `AdminNotification` ADD CONSTRAINT `AdminNotification_attendance_id_fkey` FOREIGN KEY (`attendance_id`) REFERENCES `Attendance`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE `AdminNotification` ADD CONSTRAINT `AdminNotification_user_id_fkey` FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
