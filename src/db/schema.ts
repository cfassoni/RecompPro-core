import {
  sqliteTable,
  integer,
  text,
  real,
  unique,
  customType,
} from "drizzle-orm/sqlite-core";
import { relations } from "drizzle-orm";
import { parseFlexibleDate, formatSQLiteDateTime } from "@/lib/dateUtils";

// Custom SQLite DateTime column for 100% interoperability with SQLAlchemy & ISO formats
export const sqliteDateTime = customType<{
  data: Date;
  driverData: string | number | null;
}>({
  dataType() {
    return "datetime";
  },
  fromDriver(value: string | number | null): Date {
    if (value === null || value === undefined) return null as unknown as Date;
    return parseFlexibleDate(value) || new Date();
  },
  toDriver(value: Date | null): string | null {
    if (value === null || value === undefined) return null;
    return formatSQLiteDateTime(value);
  },
});

// -----------------------------------------------------------------------------
// Table: Users
// -----------------------------------------------------------------------------
export const users = sqliteTable("users", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  email: text("email").notNull().unique(),
  hashedPassword: text("hashed_password").notNull(),
  displayName: text("display_name"),
  gender: text("gender"),
  birthday: text("birthday"),
  heightCm: real("height_cm"),
  targetWeightKg: real("target_weight_kg"),
  profileImagePath: text("profile_image_path"),
  preferredLanguage: text("preferred_language"),
  emailConfirmed: integer("email_confirmed", { mode: "boolean" }).notNull().default(false),
  pendingEmail: text("pending_email"),
  verificationCode: text("verification_code"),
  verificationCodeExpiresAt: sqliteDateTime("verification_code_expires_at"),
  verificationAttempts: integer("verification_attempts").notNull().default(0),
  resetPasswordToken: text("reset_password_token"),
  resetPasswordCode: text("reset_password_code"),
  resetPasswordExpiresAt: sqliteDateTime("reset_password_expires_at"),
  resetPasswordAttempts: integer("reset_password_attempts").notNull().default(0),
  createdAt: sqliteDateTime("created_at").notNull().$defaultFn(() => new Date()),
});

// -----------------------------------------------------------------------------
// Table: Recomp Records
// -----------------------------------------------------------------------------
export const recompRecords = sqliteTable("recomp_records", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  userId: integer("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  date: sqliteDateTime("date").notNull(),
  starred: integer("starred", { mode: "boolean" }).notNull().default(false),

  // Core Weight / Body Metrics
  weight: real("weight").notNull(),
  bmi: real("bmi").notNull(),
  bodyFatPct: real("body_fat_pct").notNull(),
  subcutaneousFatPct: real("subcutaneous_fat_pct").notNull(),
  heartRate: real("heart_rate"),
  heartIndex: real("heart_index"),
  visceralFat: real("visceral_fat").notNull(),
  bodyWaterPct: real("body_water_pct").notNull(),
  skeletalMuscleMassPct: real("skeletal_muscle_mass_pct").notNull(),
  muscleMass: real("muscle_mass").notNull(),
  boneMass: real("bone_mass").notNull(),
  proteinPct: real("protein_pct").notNull(),
  bmr: real("bmr").notNull(),
  metabolicAge: real("metabolic_age").notNull(),
  fatMass: real("fat_mass").notNull(),
  moistureContent: real("moisture_content").notNull(),
  skeletalMuscleMass: real("skeletal_muscle_mass").notNull(),
  muscleRatePct: real("muscle_rate_pct").notNull(),
  proteinMass: real("protein_mass").notNull(),
  obesityScore: integer("obesity_score").notNull(),
  fatFreeMass: real("fat_free_mass").notNull(),
  smi: real("smi").notNull(),
  bodyScore: real("body_score").notNull(),
  targetWeight: real("target_weight").notNull(),
  weightControl: real("weight_control").notNull(),
  fatControl: real("fat_control").notNull(),
  muscleControl: real("muscle_control").notNull(),

  // Right Arm Segmental Analysis
  rightArmFatMass: real("right_arm_fat_mass"),
  rightArmFatPct: real("right_arm_fat_pct"),
  rightArmFatLevel: text("right_arm_fat_level"),
  rightArmMuscleMass: real("right_arm_muscle_mass"),
  rightArmMusclePct: real("right_arm_muscle_pct"),
  rightArmMuscleLevel: text("right_arm_muscle_level"),
  rightArmImpedanceHigh: real("right_arm_impedance_high"),
  rightArmImpedanceLow: real("right_arm_impedance_low"),

  // Left Arm Segmental Analysis
  leftArmFatMass: real("left_arm_fat_mass"),
  leftArmFatPct: real("left_arm_fat_pct"),
  leftArmFatLevel: text("left_arm_fat_level"),
  leftArmMuscleMass: real("left_arm_muscle_mass"),
  leftArmMusclePct: real("left_arm_muscle_pct"),
  leftArmMuscleLevel: text("left_arm_muscle_level"),
  leftArmImpedanceHigh: real("left_arm_impedance_high"),
  leftArmImpedanceLow: real("left_arm_impedance_low"),

  // Trunk Segmental Analysis
  trunkFatMass: real("trunk_fat_mass"),
  trunkFatPct: real("trunk_fat_pct"),
  trunkFatLevel: text("trunk_fat_level"),
  trunkMuscleMass: real("trunk_muscle_mass"),
  trunkMusclePct: real("trunk_muscle_pct"),
  trunkMuscleLevel: text("trunk_muscle_level"),
  trunkImpedanceHigh: real("trunk_impedance_high"),
  trunkImpedanceLow: real("trunk_impedance_low"),

  // Right Leg Segmental Analysis
  rightLegFatMass: real("right_leg_fat_mass"),
  rightLegFatPct: real("right_leg_fat_pct"),
  rightLegFatLevel: text("right_leg_fat_level"),
  rightLegMuscleMass: real("right_leg_muscle_mass"),
  rightLegMusclePct: real("right_leg_muscle_pct"),
  rightLegMuscleLevel: text("right_leg_muscle_level"),
  rightLegImpedanceHigh: real("right_leg_impedance_high"),
  rightLegImpedanceLow: real("right_leg_impedance_low"),

  // Left Leg Segmental Analysis
  leftLegFatMass: real("left_leg_fat_mass"),
  leftLegFatPct: real("left_leg_fat_pct"),
  leftLegFatLevel: text("left_leg_fat_level"),
  leftLegMuscleMass: real("left_leg_muscle_mass"),
  leftLegMusclePct: real("left_leg_muscle_pct"),
  leftLegMuscleLevel: text("left_leg_muscle_level"),
  leftLegImpedanceHigh: real("left_leg_impedance_high"),
  leftLegImpedanceLow: real("left_leg_impedance_low"),
}, (table) => [
  unique("_user_date_uc").on(table.userId, table.date)
]);

// -----------------------------------------------------------------------------
// Table: Recomp Reports
// -----------------------------------------------------------------------------
export const recompReports = sqliteTable("recomp_reports", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  recordId: integer("record_id").notNull().unique().references(() => recompRecords.id, { onDelete: "cascade" }),
  filePath: text("file_path").notNull(),
  filename: text("filename").notNull(),
  mimeType: text("mime_type").notNull(),
  fileSize: integer("file_size").notNull(),
  uploadedAt: sqliteDateTime("uploaded_at").notNull().$defaultFn(() => new Date()),
});

// -----------------------------------------------------------------------------
// Table: Shared Links
// -----------------------------------------------------------------------------
export const sharedLinks = sqliteTable("shared_links", {
  id: text("id").primaryKey(), // UUID string
  ownerId: integer("owner_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  token: text("token").notNull().unique(),
  description: text("description").notNull(),
  passwordHash: text("password_hash"),
  includeAttachments: integer("include_attachments", { mode: "boolean" }).notNull().default(true),
  autoShareStarred: integer("auto_share_starred", { mode: "boolean" }).notNull().default(false),
  manualEntryIds: text("manual_entry_ids"),
  expiresAt: sqliteDateTime("expires_at"),
  snapshotData: text("snapshot_data").notNull(), // JSON string
  createdAt: sqliteDateTime("created_at").notNull().$defaultFn(() => new Date()),
});

// -----------------------------------------------------------------------------
// Table: Shared Link Audit Logs
// -----------------------------------------------------------------------------
export const sharedLinkAuditLogs = sqliteTable("shared_link_audit_logs", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  sharedLinkId: text("shared_link_id").notNull().references(() => sharedLinks.id, { onDelete: "cascade" }),
  accessedAt: sqliteDateTime("accessed_at").notNull().$defaultFn(() => new Date()),
  ipAddress: text("ip_address"),
  userAgent: text("user_agent"),
  status: text("status").notNull(),
});

// -----------------------------------------------------------------------------
// Table: User Integrations
// -----------------------------------------------------------------------------
export const userIntegrations = sqliteTable(
  "user_integrations",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    userId: integer("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    provider: text("provider").notNull(),
    accountIdentifier: text("account_identifier").notNull(),
    encryptedCredentials: text("encrypted_credentials").notNull(),
    configJson: text("config_json"),
    status: text("status").notNull().default("connected"),
    lastSyncedAt: sqliteDateTime("last_synced_at"),
    lastSyncError: text("last_sync_error"),
    createdAt: sqliteDateTime("created_at").notNull().$defaultFn(() => new Date()),
    updatedAt: sqliteDateTime("updated_at").notNull().$defaultFn(() => new Date()),
  },
  (table) => [
    unique("_user_provider_uc").on(table.userId, table.provider),
  ]
);

// -----------------------------------------------------------------------------
// Table: Exercise Templates (Hevy Exercise Catalog & Custom Exercises)
// -----------------------------------------------------------------------------
export const exerciseTemplates = sqliteTable("exercise_templates", {
  id: text("id").primaryKey(), // Hevy Template UUID / ID
  userId: integer("user_id").references(() => users.id, { onDelete: "cascade" }), // null para globais, preenchido para custom
  title: text("title").notNull(),
  primaryMuscleGroup: text("primary_muscle_group"),
  secondaryMuscleGroupsJson: text("secondary_muscle_groups_json"),
  equipment: text("equipment"),
  isCustom: integer("is_custom", { mode: "boolean" }).notNull().default(false),
  thumbnailUrl: text("thumbnail_url"),
  createdAt: sqliteDateTime("created_at").notNull().$defaultFn(() => new Date()),
});

// -----------------------------------------------------------------------------
// Table: Workouts (Strength & Activity Sessions)
// -----------------------------------------------------------------------------
export const workouts = sqliteTable(
  "workouts",
  {
    id: text("id").primaryKey(), // Hevy Workout UUID ou UUID local
    userId: integer("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    title: text("title").notNull(),
    description: text("description"),
    startTime: sqliteDateTime("start_time").notNull(),
    endTime: sqliteDateTime("end_time").notNull(),
    durationSeconds: integer("duration_seconds").notNull(),
    totalVolumeKg: real("total_volume_kg").notNull().default(0),
    sessionCaloriesBurned: real("session_calories_burned").notNull().default(0),
    epocCaloriesBurned: real("epoc_calories_burned").notNull().default(0),
    totalCaloriesBurned: real("total_calories_burned").notNull().default(0),
    avgRpe: real("avg_rpe"),
    source: text("source").notNull().default("hevy"),
    createdAt: sqliteDateTime("created_at").notNull().$defaultFn(() => new Date()),
    updatedAt: sqliteDateTime("updated_at").notNull().$defaultFn(() => new Date()),
  },
  (table) => [
    unique("_user_workout_uc").on(table.userId, table.id),
  ]
);

// -----------------------------------------------------------------------------
// Table: Workout Exercises
// -----------------------------------------------------------------------------
export const workoutExercises = sqliteTable("workout_exercises", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  workoutId: text("workout_id")
    .notNull()
    .references(() => workouts.id, { onDelete: "cascade" }),
  exerciseTemplateId: text("exercise_template_id").references(
    () => exerciseTemplates.id,
    { onDelete: "set null" }
  ),
  title: text("title").notNull(),
  index: integer("index").notNull().default(0),
  notes: text("notes"),
  supersetId: integer("superset_id"),
});

// -----------------------------------------------------------------------------
// Table: Workout Sets
// -----------------------------------------------------------------------------
export const workoutSets = sqliteTable("workout_sets", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  workoutExerciseId: integer("workout_exercise_id")
    .notNull()
    .references(() => workoutExercises.id, { onDelete: "cascade" }),
  index: integer("index").notNull().default(0),
  type: text("type").notNull().default("normal"), // normal, warmup, dropset, failure
  weightKg: real("weight_kg"),
  reps: integer("reps"),
  distanceMeters: real("distance_meters"),
  durationSeconds: integer("duration_seconds"),
  rpe: real("rpe"),
  customMetric: real("custom_metric"),
});

// -----------------------------------------------------------------------------
// Relations (Declared strictly after all table definitions)
// -----------------------------------------------------------------------------
export const usersRelations = relations(users, ({ many }) => ({
  records: many(recompRecords),
  sharedLinks: many(sharedLinks),
  integrations: many(userIntegrations),
  workouts: many(workouts),
  customExercises: many(exerciseTemplates),
}));

export const exerciseTemplatesRelations = relations(exerciseTemplates, ({ one, many }) => ({
  user: one(users, {
    fields: [exerciseTemplates.userId],
    references: [users.id],
  }),
  workoutExercises: many(workoutExercises),
}));

export const workoutsRelations = relations(workouts, ({ one, many }) => ({
  user: one(users, {
    fields: [workouts.userId],
    references: [users.id],
  }),
  exercises: many(workoutExercises),
}));

export const workoutExercisesRelations = relations(workoutExercises, ({ one, many }) => ({
  workout: one(workouts, {
    fields: [workoutExercises.workoutId],
    references: [workouts.id],
  }),
  template: one(exerciseTemplates, {
    fields: [workoutExercises.exerciseTemplateId],
    references: [exerciseTemplates.id],
  }),
  sets: many(workoutSets),
}));

export const workoutSetsRelations = relations(workoutSets, ({ one }) => ({
  workoutExercise: one(workoutExercises, {
    fields: [workoutSets.workoutExerciseId],
    references: [workoutExercises.id],
  }),
}));

export const userIntegrationsRelations = relations(userIntegrations, ({ one }) => ({
  user: one(users, {
    fields: [userIntegrations.userId],
    references: [users.id],
  }),
}));

export const recompRecordsRelations = relations(recompRecords, ({ one }) => ({
  user: one(users, {
    fields: [recompRecords.userId],
    references: [users.id],
  }),
  report: one(recompReports),
}));

export const recompReportsRelations = relations(recompReports, ({ one }) => ({
  record: one(recompRecords, {
    fields: [recompReports.recordId],
    references: [recompRecords.id],
  }),
}));

export const sharedLinksRelations = relations(sharedLinks, ({ one, many }) => ({
  owner: one(users, {
    fields: [sharedLinks.ownerId],
    references: [users.id],
  }),
  auditLogs: many(sharedLinkAuditLogs),
}));

export const sharedLinkAuditLogsRelations = relations(sharedLinkAuditLogs, ({ one }) => ({
  sharedLink: one(sharedLinks, {
    fields: [sharedLinkAuditLogs.sharedLinkId],
    references: [sharedLinks.id],
  }),
}));
