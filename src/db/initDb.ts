import { sql } from "drizzle-orm";
import { db } from "./client";
import { formatRecordDateKey } from "@/lib/dateUtils";

/**
 * Idempotently migrates legacy `fitdays_records` and `fitdays_reports` tables
 * to `recomp_records` and `recomp_reports` without data loss.
 */
export async function migrateLegacySchemaTables(targetDb: typeof db = db): Promise<void> {
  const tables = await targetDb.all<{ name: string }>(
    sql`SELECT name FROM sqlite_master WHERE type = 'table' AND name IN ('fitdays_records', 'recomp_records', 'fitdays_reports', 'recomp_reports')`
  );
  const tableSet = new Set(tables.map((t) => t.name));

  if (tableSet.has("fitdays_records") && !tableSet.has("recomp_records")) {
    await targetDb.run(sql`ALTER TABLE fitdays_records RENAME TO recomp_records`);
    tableSet.delete("fitdays_records");
    tableSet.add("recomp_records");
  }

  if (tableSet.has("fitdays_reports") && !tableSet.has("recomp_reports")) {
    await targetDb.run(sql`ALTER TABLE fitdays_reports RENAME TO recomp_reports`);
    await targetDb.run(sql`DROP INDEX IF EXISTS fitdays_reports_record_id_unique`);
    await targetDb.run(
      sql`CREATE UNIQUE INDEX IF NOT EXISTS recomp_reports_record_id_unique ON recomp_reports (record_id)`
    );
    tableSet.delete("fitdays_reports");
    tableSet.add("recomp_reports");
  }

  if (tableSet.has("recomp_records")) {
    try {
      await targetDb.run(sql`ALTER TABLE recomp_records ADD COLUMN starred INTEGER NOT NULL DEFAULT 0`);
    } catch {
      // Column already exists
    }
  }
}

export async function normalizeRecompRecordDates(): Promise<void> {
  const rows = await db.all<{ id: number; user_id: number; date: string | number | null }>(
    sql`SELECT id, user_id, date FROM recomp_records ORDER BY id ASC`
  );

  if (rows.length === 0) return;

  const reports = await db.all<{ id: number; record_id: number }>(
    sql`SELECT id, record_id FROM recomp_reports`
  );
  const reportByRecordId = new Map<number, number>();
  for (const r of reports) {
    reportByRecordId.set(r.record_id, r.id);
  }

  const groups = new Map<
    string,
    Array<{ id: number; user_id: number; date: string | number | null; canonical: string }>
  >();

  for (const row of rows) {
    const canonical = formatRecordDateKey(row.date);
    if (!canonical) continue;
    const key = `${row.user_id}::${canonical}`;
    const list = groups.get(key) || [];
    list.push({ ...row, canonical });
    groups.set(key, list);
  }

  for (const group of groups.values()) {
    if (group.length === 1) {
      const item = group[0];
      if (typeof item.date !== "string" || item.date !== item.canonical) {
        await db.run(
          sql`UPDATE recomp_records SET date = ${item.canonical} WHERE id = ${item.id}`
        );
      }
      continue;
    }

    // Multiple rows map to the same (user_id, canonical minute timestamp).
    // Keep the latest row by id, preserving any attached report from older duplicate rows.
    const keeper = group[group.length - 1];
    const duplicates = group.slice(0, -1);

    let keeperHasReport = reportByRecordId.has(keeper.id);
    for (const dup of duplicates) {
      const dupReportId = reportByRecordId.get(dup.id);
      if (dupReportId !== undefined && !keeperHasReport) {
        await db.run(
          sql`UPDATE recomp_reports SET record_id = ${keeper.id} WHERE id = ${dupReportId}`
        );
        keeperHasReport = true;
      }
      await db.run(sql`DELETE FROM recomp_records WHERE id = ${dup.id}`);
    }

    if (typeof keeper.date !== "string" || keeper.date !== keeper.canonical) {
      await db.run(
        sql`UPDATE recomp_records SET date = ${keeper.canonical} WHERE id = ${keeper.id}`
      );
    }
  }
}

export async function ensureTablesExist(): Promise<void> {
  await migrateLegacySchemaTables();

  await db.run(sql`
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      email TEXT NOT NULL UNIQUE,
      hashed_password TEXT NOT NULL,
      display_name TEXT,
      gender TEXT,
      birthday TEXT,
      height_cm REAL,
      target_weight_kg REAL,
      profile_image_path TEXT,
      preferred_language TEXT,
      email_confirmed INTEGER NOT NULL DEFAULT 0,
      pending_email TEXT,
      verification_code TEXT,
      verification_code_expires_at INTEGER,
      verification_attempts INTEGER NOT NULL DEFAULT 0,
      reset_password_token TEXT,
      reset_password_code TEXT,
      reset_password_expires_at INTEGER,
      reset_password_attempts INTEGER NOT NULL DEFAULT 0,
      created_at INTEGER NOT NULL
    );
  `);

  await db.run(sql`
    CREATE TABLE IF NOT EXISTS recomp_records (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      date DATETIME NOT NULL,
      starred INTEGER NOT NULL DEFAULT 0,
      weight REAL NOT NULL,
      bmi REAL NOT NULL,
      body_fat_pct REAL NOT NULL,
      subcutaneous_fat_pct REAL NOT NULL,
      heart_rate REAL,
      heart_index REAL,
      visceral_fat REAL NOT NULL,
      body_water_pct REAL NOT NULL,
      skeletal_muscle_mass_pct REAL NOT NULL,
      muscle_mass REAL NOT NULL,
      bone_mass REAL NOT NULL,
      protein_pct REAL NOT NULL,
      bmr REAL NOT NULL,
      metabolic_age REAL NOT NULL,
      fat_mass REAL NOT NULL,
      moisture_content REAL NOT NULL,
      skeletal_muscle_mass REAL NOT NULL,
      muscle_rate_pct REAL NOT NULL,
      protein_mass REAL NOT NULL,
      obesity_score INTEGER NOT NULL,
      fat_free_mass REAL NOT NULL,
      smi REAL,
      body_score REAL NOT NULL,
      target_weight REAL NOT NULL,
      weight_control REAL NOT NULL,
      fat_control REAL NOT NULL,
      muscle_control REAL NOT NULL,
      right_arm_fat_mass REAL,
      right_arm_fat_pct REAL,
      right_arm_fat_level TEXT,
      right_arm_muscle_mass REAL,
      right_arm_muscle_pct REAL,
      right_arm_muscle_level TEXT,
      right_arm_impedance_high REAL,
      right_arm_impedance_low REAL,
      left_arm_fat_mass REAL,
      left_arm_fat_pct REAL,
      left_arm_fat_level TEXT,
      left_arm_muscle_mass REAL,
      left_arm_muscle_pct REAL,
      left_arm_muscle_level TEXT,
      left_arm_impedance_high REAL,
      left_arm_impedance_low REAL,
      trunk_fat_mass REAL,
      trunk_fat_pct REAL,
      trunk_fat_level TEXT,
      trunk_muscle_mass REAL,
      trunk_muscle_pct REAL,
      trunk_muscle_level TEXT,
      trunk_impedance_high REAL,
      trunk_impedance_low REAL,
      right_leg_fat_mass REAL,
      right_leg_fat_pct REAL,
      right_leg_fat_level TEXT,
      right_leg_muscle_mass REAL,
      right_leg_muscle_pct REAL,
      right_leg_muscle_level TEXT,
      right_leg_impedance_high REAL,
      right_leg_impedance_low REAL,
      left_leg_fat_mass REAL,
      left_leg_fat_pct REAL,
      left_leg_fat_level TEXT,
      left_leg_muscle_mass REAL,
      left_leg_muscle_pct REAL,
      left_leg_muscle_level TEXT,
      left_leg_impedance_high REAL,
      left_leg_impedance_low REAL,
      UNIQUE(user_id, date)
    );
  `);

  await db.run(sql`
    CREATE TABLE IF NOT EXISTS recomp_reports (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      record_id INTEGER NOT NULL UNIQUE REFERENCES recomp_records(id) ON DELETE CASCADE,
      file_path TEXT NOT NULL,
      filename TEXT NOT NULL,
      mime_type TEXT NOT NULL,
      file_size INTEGER NOT NULL,
      uploaded_at INTEGER NOT NULL
    );
  `);

  await db.run(sql`
    CREATE TABLE IF NOT EXISTS shared_links (
      id TEXT PRIMARY KEY,
      owner_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      token TEXT NOT NULL UNIQUE,
      description TEXT NOT NULL,
      password_hash TEXT,
      include_attachments INTEGER NOT NULL DEFAULT 1,
      auto_share_starred INTEGER NOT NULL DEFAULT 0,
      manual_entry_ids TEXT,
      expires_at INTEGER,
      snapshot_data TEXT NOT NULL,
      created_at INTEGER NOT NULL
    );
  `);

  await db.run(sql`
    CREATE TABLE IF NOT EXISTS shared_link_audit_logs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      shared_link_id TEXT NOT NULL REFERENCES shared_links(id) ON DELETE CASCADE,
      accessed_at INTEGER NOT NULL,
      ip_address TEXT,
      user_agent TEXT,
      status TEXT NOT NULL
    );
  `);

  await db.run(sql`
    CREATE TABLE IF NOT EXISTS user_integrations (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      provider TEXT NOT NULL,
      account_identifier TEXT NOT NULL,
      encrypted_credentials TEXT NOT NULL,
      config_json TEXT,
      status TEXT NOT NULL DEFAULT 'connected',
      last_synced_at DATETIME,
      last_sync_error TEXT,
      created_at DATETIME NOT NULL,
      updated_at DATETIME NOT NULL
    );
  `);

  await db.run(sql`
    CREATE UNIQUE INDEX IF NOT EXISTS _user_provider_uc ON user_integrations (user_id, provider);
  `);

  await db.run(sql`
    CREATE TABLE IF NOT EXISTS exercise_templates (
      id TEXT PRIMARY KEY NOT NULL,
      user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
      title TEXT NOT NULL,
      primary_muscle_group TEXT,
      secondary_muscle_groups_json TEXT,
      equipment TEXT,
      is_custom INTEGER DEFAULT 0 NOT NULL,
      thumbnail_url TEXT,
      created_at DATETIME NOT NULL
    );
  `);

  await db.run(sql`
    CREATE TABLE IF NOT EXISTS workouts (
      id TEXT PRIMARY KEY NOT NULL,
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      title TEXT NOT NULL,
      description TEXT,
      start_time DATETIME NOT NULL,
      end_time DATETIME NOT NULL,
      duration_seconds INTEGER NOT NULL,
      total_volume_kg REAL DEFAULT 0 NOT NULL,
      session_calories_burned REAL DEFAULT 0 NOT NULL,
      epoc_calories_burned REAL DEFAULT 0 NOT NULL,
      total_calories_burned REAL DEFAULT 0 NOT NULL,
      avg_rpe REAL,
      source TEXT DEFAULT 'hevy' NOT NULL,
      created_at DATETIME NOT NULL,
      updated_at DATETIME NOT NULL
    );
  `);

  await db.run(sql`
    CREATE UNIQUE INDEX IF NOT EXISTS _user_workout_uc ON workouts (user_id, id);
  `);

  await db.run(sql`
    CREATE TABLE IF NOT EXISTS workout_exercises (
      id INTEGER PRIMARY KEY AUTOINCREMENT NOT NULL,
      workout_id TEXT NOT NULL REFERENCES workouts(id) ON DELETE CASCADE,
      exercise_template_id TEXT REFERENCES exercise_templates(id) ON DELETE SET NULL,
      title TEXT NOT NULL,
      "index" INTEGER DEFAULT 0 NOT NULL,
      notes TEXT,
      superset_id INTEGER
    );
  `);

  await db.run(sql`
    CREATE TABLE IF NOT EXISTS workout_sets (
      id INTEGER PRIMARY KEY AUTOINCREMENT NOT NULL,
      workout_exercise_id INTEGER NOT NULL REFERENCES workout_exercises(id) ON DELETE CASCADE,
      "index" INTEGER DEFAULT 0 NOT NULL,
      type TEXT DEFAULT 'normal' NOT NULL,
      weight_kg REAL,
      reps INTEGER,
      distance_meters REAL,
      duration_seconds INTEGER,
      rpe REAL,
      custom_metric REAL
    );
  `);

  // Defensive migrations for existing SQLite databases
  try {
    await db.run(sql`ALTER TABLE recomp_records ADD COLUMN starred INTEGER NOT NULL DEFAULT 0`);
  } catch {
    // Column already exists
  }

  try {
    await db.run(sql`ALTER TABLE shared_links ADD COLUMN auto_share_starred INTEGER NOT NULL DEFAULT 0`);
  } catch {
    // Column already exists
  }

  try {
    await db.run(sql`ALTER TABLE shared_links ADD COLUMN manual_entry_ids TEXT`);
  } catch {
    // Column already exists
  }

  await normalizeRecompRecordDates();
}
