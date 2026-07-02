ALTER TABLE `tables` ADD `created_at` text;--> statement-breakpoint
UPDATE `tables` SET `created_at` = CURRENT_TIMESTAMP WHERE `created_at` IS NULL;