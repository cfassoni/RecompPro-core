import { describe, it, expect } from "vitest";
import en from "../../locales/en.json";
import pt from "../../locales/pt.json";
import es from "../../locales/es.json";

function getDeepKeys(obj: Record<string, unknown>, prefix = ""): string[] {
  let keys: string[] = [];
  for (const [key, value] of Object.entries(obj)) {
    const fullPath = prefix ? `${prefix}.${key}` : key;
    if (value && typeof value === "object" && !Array.isArray(value)) {
      keys = keys.concat(getDeepKeys(value as Record<string, unknown>, fullPath));
    } else {
      keys.push(fullPath);
    }
  }
  return keys;
}

describe("Locale Parity", () => {
  const enKeys = new Set(getDeepKeys(en));
  const ptKeys = new Set(getDeepKeys(pt));
  const esKeys = new Set(getDeepKeys(es));

  it("pt.json should have all keys from en.json", () => {
    const missingInPt = [...enKeys].filter((k) => !ptKeys.has(k));
    expect(missingInPt, `Missing keys in pt.json: ${missingInPt.join(", ")}`).toEqual([]);
  });

  it("es.json should have all keys from en.json", () => {
    const missingInEs = [...enKeys].filter((k) => !esKeys.has(k));
    expect(missingInEs, `Missing keys in es.json: ${missingInEs.join(", ")}`).toEqual([]);
  });

  it("en.json should have all keys present in pt.json", () => {
    const extraInPt = [...ptKeys].filter((k) => !enKeys.has(k));
    expect(extraInPt, `Extra keys in pt.json not in en.json: ${extraInPt.join(", ")}`).toEqual([]);
  });

  it("en.json should have all keys present in es.json", () => {
    const extraInEs = [...esKeys].filter((k) => !enKeys.has(k));
    expect(extraInEs, `Extra keys in es.json not in en.json: ${extraInEs.join(", ")}`).toEqual([]);
  });
});
