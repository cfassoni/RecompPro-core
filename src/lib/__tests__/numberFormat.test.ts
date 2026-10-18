import { describe, it, expect } from "vitest";
import {
  getLocaleTag,
  formatNumber,
  formatInteger,
  formatDecimal,
  formatDelta,
} from "../i18n";

describe("Locale-Aware Number Formatting (src/lib/i18n.ts)", () => {
  describe("getLocaleTag", () => {
    it("should map pt to pt-BR", () => {
      expect(getLocaleTag("pt")).toBe("pt-BR");
      expect(getLocaleTag("pt-BR")).toBe("pt-BR");
    });

    it("should map es to es-ES", () => {
      expect(getLocaleTag("es")).toBe("es-ES");
      expect(getLocaleTag("es-ES")).toBe("es-ES");
    });

    it("should map en to en-US", () => {
      expect(getLocaleTag("en")).toBe("en-US");
      expect(getLocaleTag("en-US")).toBe("en-US");
    });

    it("should default to en-US if unspecified or unknown", () => {
      expect(getLocaleTag(null)).toBe("en-US");
      expect(getLocaleTag(undefined)).toBe("en-US");
      expect(getLocaleTag("fr")).toBe("en-US");
    });
  });

  describe("formatNumber", () => {
    it("should format numbers with custom Intl options and respect locale", () => {
      expect(formatNumber(12.5, undefined, "pt-BR")).toBe("12,5");
      expect(formatNumber(12.5, undefined, "en-US")).toBe("12.5");
      expect(formatNumber(1234.56, { style: "percent" }, "en-US")).toBe("123,456%");
    });

    it("should return fallback for invalid numbers", () => {
      expect(formatNumber(null)).toBe("—");
      expect(formatNumber(undefined)).toBe("—");
      expect(formatNumber(NaN)).toBe("—");
    });
  });

  describe("formatInteger", () => {
    it("should format thousands with dots in pt-BR and commas in en-US", () => {
      expect(formatInteger(1008, "pt-BR")).toBe("1.008");
      expect(formatInteger(47357, "pt-BR")).toBe("47.357");
      expect(formatInteger(1008457, "pt-BR")).toBe("1.008.457");

      expect(formatInteger(1008, "es-ES")).toBe("1.008");

      expect(formatInteger(1008, "en-US")).toBe("1,008");
      expect(formatInteger(47357, "en-US")).toBe("47,357");
      expect(formatInteger(1008457, "en-US")).toBe("1,008,457");
    });

    it("should handle null, undefined, and NaN gracefully", () => {
      expect(formatInteger(null)).toBe("—");
      expect(formatInteger(undefined)).toBe("—");
      expect(formatInteger(NaN)).toBe("—");
    });
  });

  describe("formatDecimal", () => {
    it("should format decimal separators with comma in pt-BR / es-ES and dot in en-US", () => {
      expect(formatDecimal(8.5, 1, "pt-BR")).toBe("8,5");
      expect(formatDecimal(78.2, 1, "pt-BR")).toBe("78,2");
      expect(formatDecimal(1008.5, 1, "pt-BR")).toBe("1.008,5");

      expect(formatDecimal(8.5, 1, "es-ES")).toBe("8,5");

      expect(formatDecimal(8.5, 1, "en-US")).toBe("8.5");
      expect(formatDecimal(78.2, 1, "en-US")).toBe("78.2");
      expect(formatDecimal(1008.5, 1, "en-US")).toBe("1,008.5");
    });

    it("should support multiple fraction digits", () => {
      expect(formatDecimal(78.25, 2, "pt-BR")).toBe("78,25");
      expect(formatDecimal(78.25, 2, "en-US")).toBe("78.25");
    });

    it("should handle null, undefined, and NaN gracefully", () => {
      expect(formatDecimal(null, 1)).toBe("—");
      expect(formatDecimal(undefined, 1)).toBe("—");
      expect(formatDecimal(NaN, 1)).toBe("—");
    });
  });

  describe("formatDelta", () => {
    it("should prepend positive sign and format numbers by locale", () => {
      const ptPositive = formatDelta(1.25, 2, " kg", "pt-BR");
      expect(ptPositive).toEqual({
        formatted: "+1,25 kg",
        isPositive: true,
        isNegative: false,
        isNeutral: false,
      });

      const enPositive = formatDelta(1.25, 2, " kg", "en-US");
      expect(enPositive).toEqual({
        formatted: "+1.25 kg",
        isPositive: true,
        isNegative: false,
        isNeutral: false,
      });
    });

    it("should handle negative delta without double minus", () => {
      const ptNegative = formatDelta(-0.5, 1, "%", "pt-BR");
      expect(ptNegative).toEqual({
        formatted: "-0,5%",
        isPositive: false,
        isNegative: true,
        isNeutral: false,
      });

      const enNegative = formatDelta(-0.5, 1, "%", "en-US");
      expect(enNegative).toEqual({
        formatted: "-0.5%",
        isPositive: false,
        isNegative: true,
        isNeutral: false,
      });
    });

    it("should handle zero as neutral", () => {
      const ptZero = formatDelta(0, 1, " kg", "pt-BR");
      expect(ptZero).toEqual({
        formatted: "0,0 kg",
        isPositive: false,
        isNegative: false,
        isNeutral: true,
      });
    });

    it("should return null for null/undefined/NaN", () => {
      expect(formatDelta(null)).toBeNull();
      expect(formatDelta(undefined)).toBeNull();
      expect(formatDelta(NaN)).toBeNull();
    });
  });
});
