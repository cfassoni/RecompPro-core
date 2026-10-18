import { describe, it, expect, vi } from "vitest";
import {
  normalizeFitdaysRecord,
  filterFitdaysRecords,
  parseSegmentalImpedances,
  upsertFitdaysRecords,
} from "../fitdays/sync";
import { RecompFitdaysClient } from "../fitdays/client";
import { createClient } from "@libsql/client";
import { drizzle } from "drizzle-orm/libsql";
import * as schema from "@/db/schema";
import { sql } from "drizzle-orm";
import type { WeightRecord } from "fitdays-api";

describe("Fitdays Module", () => {
  describe("Segmental Impedance Parsing", () => {
    it("should parse 10 dual-frequency impedances from comma-separated string", () => {
      const originalImps = "550,530,320,310,25,24,280,270,290,285";
      const parsed = parseSegmentalImpedances(originalImps);

      expect(parsed.rightArmImpedanceHigh).toBe(550);
      expect(parsed.rightArmImpedanceLow).toBe(530);
      expect(parsed.leftArmImpedanceHigh).toBe(320);
      expect(parsed.leftArmImpedanceLow).toBe(310);
      expect(parsed.trunkImpedanceHigh).toBe(25);
      expect(parsed.trunkImpedanceLow).toBe(24);
      expect(parsed.rightLegImpedanceHigh).toBe(280);
      expect(parsed.rightLegImpedanceLow).toBe(270);
      expect(parsed.leftLegImpedanceHigh).toBe(290);
      expect(parsed.leftLegImpedanceLow).toBe(285);
    });

    it("should return nulls when fewer than 10 impedances are provided", () => {
      const parsed = parseSegmentalImpedances("500,450");
      expect(parsed.rightArmImpedanceHigh).toBeNull();
      expect(parsed.trunkImpedanceHigh).toBeNull();
    });
  });

  describe("Record Normalization", () => {
    it("should convert grams to kilograms and calculate derived mass fields accurately", () => {
      const mockRecord: WeightRecord = {
        id: 101,
        uid: 1,
        suid: 1,
        measured_time: 1718000000,
        weight_g: 80500, // 80.5 kg
        weight_kg: 80.5,
        weight_lb: 177.4,
        bmi: 24.5,
        bfr: 20.0, // 20% body fat
        vwc: 55.0, // 55% body water
        rosm: 40.0, // 40% skeletal muscle
        rom: 75.0, // 75% muscle
        pp: 18.0, // 18% protein
        bm: 3.2,
        sfr: 15.0,
        uvi: 8,
        bmr: 1750,
        bodyage: 28,
        hr: 65,
        adc: 500,
        adc_list: "",
        app_ver: "1.0",
        balance_data_id: "",
        bfa_type: 1,
        created_at: "2026-06-10 12:00:00",
        data_calc_type: 0,
        data_id: "test",
        device_id: "dev-1",
        electrode: 4,
        gravity_data_id: "",
        imp_data_id: "",
        is_deleted: 0,
        kg_scale_division: 1,
        lb_scale_division: 1,
        source: 0,
        updated_at: "2026-06-10 12:00:00",
        ext_data: {
          age: 30,
          arm: 0,
          armAndLegBalance: 0,
          armBalance: 0,
          bfmControl: -2.5,
          bfmMax: 20,
          bfmMin: 10,
          bfmStandard: 15,
          bfpMax: 22,
          bfpMin: 12,
          bfpStandard: 17,
          bmiMax: 25,
          bmiMin: 18.5,
          bmiStandard: 22,
          bmrMax: 2000,
          bmrMin: 1500,
          bmrStandard: 1700,
          bodyScore: 88,
          bodyType: 1,
          boneMax: 4,
          boneMin: 2.5,
          chest: 0,
          dataType: 1,
          deviceModelExt: "CF516",
          deviceNameExt: "Smart Scale",
          deviceSoftwareVer: "1.0",
          ffmControl: 1.5,
          ffmStandard: 65,
          height: 180,
          hip: 0,
          is_show_circumference_layout: 0,
          legBalance: 0,
          muscleMassMax: 65,
          muscleMassMin: 50,
          neck: 0,
          obesityDegree: 1,
          onlyMeasureWeight: "0",
          originalImps: "",
          peopleType: 0,
          proteinMassMax: 15,
          proteinMassMin: 10,
          sex: 1,
          smi: 7.8,
          smmMax: 35,
          smmMin: 28,
          smmStandard: 32,
          targetBodyfatMass: 12,
          targetSMMMass: 33,
          targetWeight: 78,
          thigh: 0,
          waist: 0,
          waterMassMax: 50,
          waterMassMin: 40,
          weightControl: -2.5,
          weightMax: 82,
          weightMin: 65,
          weightStandard: 75,
          whr: 0.85,
        },
      };

      const normalized = normalizeFitdaysRecord(mockRecord);

      expect(normalized.weight).toBe(80.5);
      expect(normalized.fatMass).toBe(16.1); // 80.5 * 20%
      expect(normalized.moistureContent).toBe(44.28); // 80.5 * 55%
      expect(normalized.skeletalMuscleMass).toBe(32.2); // 80.5 * 40%
      expect(normalized.muscleMass).toBe(60.38); // 80.5 * 75%
      expect(normalized.fatFreeMass).toBe(64.4); // 80.5 - 16.1
      expect(normalized.bodyScore).toBe(88);
      expect(normalized.smi).toBe(7.8);
      expect(normalized.heartRate).toBe(65);
    });
  });

  describe("Record Filtering", () => {
    it("should filter out deleted records, wrong suid, and weight-only records", () => {
      const records: WeightRecord[] = [
        {
          id: 1,
          suid: 10,
          is_deleted: 0,
          bfr: 19.5,
          measured_time: 1700000000,
          weight_g: 75000,
          ext_data: { onlyMeasureWeight: "0" } as unknown as Record<string, unknown>,
        } as WeightRecord,
        {
          id: 2,
          suid: 20, // different member
          is_deleted: 0,
          bfr: 22.0,
          measured_time: 1700001000,
          weight_g: 78000,
        } as WeightRecord,
        {
          id: 3,
          suid: 10,
          is_deleted: 1, // deleted
          bfr: 20.0,
          measured_time: 1700002000,
          weight_g: 75500,
        } as WeightRecord,
        {
          id: 4,
          suid: 10,
          is_deleted: 0,
          bfr: 0, // no bioimpedance
          measured_time: 1700003000,
          weight_g: 76000,
          ext_data: { onlyMeasureWeight: "1" } as unknown as Record<string, unknown>,
        } as WeightRecord,
      ];

      const filtered = filterFitdaysRecords(records, {
        selectedSuid: 10,
        skipWeightOnly: true,
      });

      expect(filtered).toHaveLength(1);
      expect(filtered[0].id).toBe(1);

      // When skipWeightOnly is false, record #4 is included
      const withWeightOnly = filterFitdaysRecords(records, {
        selectedSuid: 10,
        skipWeightOnly: false,
      });
      expect(withWeightOnly).toHaveLength(2);
      expect(withWeightOnly.map((r) => r.id)).toEqual([1, 4]);
    });
  });

  describe("Upsert Transaction Logic", () => {
    it("should insert new records and update existing records matching the canonical minute", async () => {
      const client = createClient({ url: ":memory:" });
      const testDb = drizzle(client, { schema });

      await testDb.run(sql`
        CREATE TABLE users (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          email TEXT NOT NULL UNIQUE,
          hashed_password TEXT NOT NULL,
          created_at INTEGER NOT NULL
        );
      `);

      await testDb.run(sql`
        CREATE TABLE recomp_records (
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

      await testDb.run(
        sql`INSERT INTO users (id, email, hashed_password, created_at) VALUES (1, 'u@example.com', 'h', 1700000000);`
      );

      const date1 = new Date("2026-06-10T08:30:15Z");
      const date2 = new Date("2026-06-11T08:30:45Z");

      const rawRecord1 = {
        measured_time: Math.floor(date1.getTime() / 1000),
        weight_g: 80000,
        bmi: 24.0,
        bfr: 20.0,
        vwc: 55.0,
        rosm: 40.0,
        rom: 75.0,
        pp: 18.0,
        bm: 3.2,
      } as WeightRecord;

      const rawRecord2 = {
        measured_time: Math.floor(date2.getTime() / 1000),
        weight_g: 79500,
        bmi: 23.8,
        bfr: 19.8,
        vwc: 55.2,
        rosm: 40.2,
        rom: 75.2,
        pp: 18.1,
        bm: 3.2,
      } as WeightRecord;

      // 1. Initial insert of two records
      const norm1 = normalizeFitdaysRecord(rawRecord1);
      const norm2 = normalizeFitdaysRecord(rawRecord2);

      const res1 = await upsertFitdaysRecords(1, [norm1, norm2], testDb);
      expect(res1.inserted).toBe(2);
      expect(res1.updated).toBe(0);

      // 2. Sync again with updated weight for date1 (same minute)
      const updatedRawRecord1 = {
        ...rawRecord1,
        weight_g: 80200, // 80.2 kg
      } as WeightRecord;
      const updatedNorm1 = normalizeFitdaysRecord(updatedRawRecord1);

      const res2 = await upsertFitdaysRecords(1, [updatedNorm1], testDb);
      expect(res2.inserted).toBe(0);
      expect(res2.updated).toBe(1);

      const rows = (await testDb.all(
        sql`SELECT id, weight, date FROM recomp_records WHERE user_id = 1 ORDER BY date ASC`
      )) as Array<{ id: number; weight: number; date: string }>;
      expect(rows).toHaveLength(2);
      expect(rows[0].weight).toBe(80.2);
    });
  });

  describe("RecompFitdaysClient", () => {
    it("should allow login with pre-computed password hash", async () => {
      const client = new RecompFitdaysClient();
      vi.spyOn(client, "request").mockResolvedValueOnce({
        code: 200,
        msg: "ok",
        data: {
          token: "mock-session-token",
          refresh_token: "mock-refresh-token",
          uid: 42,
        },
      } as unknown as never);

      const session = await client.loginWithPasswordHash("user@example.com", "MOCK_MD5_HASH");
      expect(session.token).toBe("mock-session-token");
      expect(session.uid).toBe(42);
      expect(client.session?.token).toBe("mock-session-token");
    });
  });
});
