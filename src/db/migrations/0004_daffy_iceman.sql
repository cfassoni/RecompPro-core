CREATE TABLE `exercise_templates` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` integer,
	`title` text NOT NULL,
	`primary_muscle_group` text,
	`secondary_muscle_groups_json` text,
	`equipment` text,
	`is_custom` integer DEFAULT false NOT NULL,
	`thumbnail_url` text,
	`created_at` datetime NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `workout_exercises` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`workout_id` text NOT NULL,
	`exercise_template_id` text,
	`title` text NOT NULL,
	`index` integer DEFAULT 0 NOT NULL,
	`notes` text,
	`superset_id` integer,
	FOREIGN KEY (`workout_id`) REFERENCES `workouts`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`exercise_template_id`) REFERENCES `exercise_templates`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE TABLE `workout_sets` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`workout_exercise_id` integer NOT NULL,
	`index` integer DEFAULT 0 NOT NULL,
	`type` text DEFAULT 'normal' NOT NULL,
	`weight_kg` real,
	`reps` integer,
	`distance_meters` real,
	`duration_seconds` integer,
	`rpe` real,
	`custom_metric` real,
	FOREIGN KEY (`workout_exercise_id`) REFERENCES `workout_exercises`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `workouts` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` integer NOT NULL,
	`title` text NOT NULL,
	`description` text,
	`start_time` datetime NOT NULL,
	`end_time` datetime NOT NULL,
	`duration_seconds` integer NOT NULL,
	`total_volume_kg` real DEFAULT 0 NOT NULL,
	`session_calories_burned` real DEFAULT 0 NOT NULL,
	`epoc_calories_burned` real DEFAULT 0 NOT NULL,
	`total_calories_burned` real DEFAULT 0 NOT NULL,
	`avg_rpe` real,
	`source` text DEFAULT 'hevy' NOT NULL,
	`created_at` datetime NOT NULL,
	`updated_at` datetime NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `_user_workout_uc` ON `workouts` (`user_id`,`id`);