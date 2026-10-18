CREATE TABLE `user_integrations` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`user_id` integer NOT NULL,
	`provider` text NOT NULL,
	`account_identifier` text NOT NULL,
	`encrypted_credentials` text NOT NULL,
	`config_json` text,
	`status` text DEFAULT 'connected' NOT NULL,
	`last_synced_at` datetime,
	`last_sync_error` text,
	`created_at` datetime NOT NULL,
	`updated_at` datetime NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `_user_provider_uc` ON `user_integrations` (`user_id`,`provider`);