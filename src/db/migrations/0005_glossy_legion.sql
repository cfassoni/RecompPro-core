CREATE TABLE `mcp_audit_logs` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`user_id` integer NOT NULL,
	`auth_method` text NOT NULL,
	`client_label` text NOT NULL,
	`primitive_type` text NOT NULL,
	`primitive_name` text NOT NULL,
	`access_mode` text NOT NULL,
	`status` text NOT NULL,
	`error_code` text,
	`duration_ms` integer NOT NULL,
	`created_at` datetime NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `idx_mcp_audit_logs_user_created` ON `mcp_audit_logs` (`user_id`,`created_at`);--> statement-breakpoint
CREATE TABLE `mcp_oauth_auth_codes` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`code_hash` text NOT NULL,
	`client_id` text NOT NULL,
	`user_id` integer NOT NULL,
	`redirect_uri` text NOT NULL,
	`scope` text NOT NULL,
	`resource` text,
	`code_challenge` text NOT NULL,
	`code_challenge_method` text NOT NULL,
	`expires_at` datetime NOT NULL,
	`consumed_at` datetime,
	`created_at` datetime NOT NULL,
	FOREIGN KEY (`client_id`) REFERENCES `mcp_oauth_clients`(`client_id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `mcp_oauth_auth_codes_code_hash_unique` ON `mcp_oauth_auth_codes` (`code_hash`);--> statement-breakpoint
CREATE TABLE `mcp_oauth_clients` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`client_id` text NOT NULL,
	`registration_type` text NOT NULL,
	`client_name` text NOT NULL,
	`client_uri` text,
	`logo_uri` text,
	`redirect_uris_json` text NOT NULL,
	`metadata_json` text,
	`metadata_expires_at` datetime,
	`last_used_at` datetime,
	`created_at` datetime NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `mcp_oauth_clients_client_id_unique` ON `mcp_oauth_clients` (`client_id`);--> statement-breakpoint
CREATE TABLE `mcp_oauth_grants` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` integer NOT NULL,
	`client_id` text NOT NULL,
	`granted_scopes` text NOT NULL,
	`last_used_at` datetime,
	`revoked_at` datetime,
	`created_at` datetime NOT NULL,
	`updated_at` datetime NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`client_id`) REFERENCES `mcp_oauth_clients`(`client_id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `_mcp_user_client_uc` ON `mcp_oauth_grants` (`user_id`,`client_id`);--> statement-breakpoint
CREATE TABLE `mcp_oauth_tokens` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`grant_id` text NOT NULL,
	`user_id` integer NOT NULL,
	`client_id` text NOT NULL,
	`token_type` text NOT NULL,
	`token_hash` text NOT NULL,
	`family_id` text NOT NULL,
	`scope` text NOT NULL,
	`resource` text,
	`expires_at` datetime NOT NULL,
	`rotated_at` datetime,
	`revoked_at` datetime,
	`created_at` datetime NOT NULL,
	FOREIGN KEY (`grant_id`) REFERENCES `mcp_oauth_grants`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `mcp_oauth_tokens_token_hash_unique` ON `mcp_oauth_tokens` (`token_hash`);--> statement-breakpoint
CREATE INDEX `idx_mcp_oauth_tokens_family` ON `mcp_oauth_tokens` (`family_id`);--> statement-breakpoint
CREATE TABLE `mcp_personal_access_tokens` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` integer NOT NULL,
	`name` text NOT NULL,
	`token_prefix` text NOT NULL,
	`token_hash` text NOT NULL,
	`scopes` text NOT NULL,
	`last_used_at` datetime,
	`expires_at` datetime,
	`revoked_at` datetime,
	`created_at` datetime NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `mcp_personal_access_tokens_token_hash_unique` ON `mcp_personal_access_tokens` (`token_hash`);