import { describe, expect, it } from "vitest";
import { SUPPORTED_SCOPES } from "@/lib/mcp/scopes";
import { ALL_MCP_MODULES } from "@/lib/mcp/server";

const SUPPORTED_SCOPE_SET = new Set<string>(SUPPORTED_SCOPES);

const EXPECTED_TOOLS = [
  "about",
  "get_user_profile",
  "update_user_profile",
  "get_biometrics_summary",
  "list_biometric_records",
  "get_biometric_record",
  "toggle_biometric_record_star",
  "delete_biometric_records",
  "list_workouts",
  "get_workout_details",
  "get_workout_stats",
  "get_workout_progression",
  "get_muscle_readiness",
  "list_integrations",
  "trigger_fitdays_sync",
  "trigger_hevy_sync",
  "list_shared_links",
  "get_shared_link_details",
  "create_shared_link",
  "update_shared_link",
  "delete_shared_link",
].sort();

const EXPECTED_RESOURCES = [
  "recomp://profile",
  "recomp://biometrics/latest",
  "recomp://biometrics/summary",
  "recomp://workouts/readiness",
  "recomp://workouts/stats/3m",
  "recomp://integrations/status",
].sort();

const EXPECTED_PROMPTS = [
  "recomp-progress-review",
  "training-readiness-brief",
  "biometrics-segmental-analysis",
  "prepare-coach-report",
].sort();

const DESTRUCTIVE_TOOLS = new Set([
  "delete_biometric_records",
  "delete_shared_link",
]);

const OPEN_WORLD_TOOLS = new Set([
  "trigger_fitdays_sync",
  "trigger_hevy_sync",
]);

const FORBIDDEN_SECURITY_PATTERN =
  /delete_account|delete_data|password|email|connect|disconnect|regenerate_webhook|revoke|token|pat|grant/;

describe("MCP Registry Parity & Security Invariants", () => {
  const allTools = ALL_MCP_MODULES.flatMap((m) => m.tools);
  const allResources = ALL_MCP_MODULES.flatMap((m) => m.resources);
  const allPrompts = ALL_MCP_MODULES.flatMap((m) => m.prompts);

  it("exposes the complete v1 catalog of 21 tools, 6 resources, and 4 prompts", () => {
    expect(allTools.map((t) => t.name).sort()).toEqual(EXPECTED_TOOLS);
    expect(allResources.map((r) => r.uri).sort()).toEqual(EXPECTED_RESOURCES);
    expect(allPrompts.map((p) => p.name).sort()).toEqual(EXPECTED_PROMPTS);
  });

  it("enforces canonical naming conventions without duplicate names or URIs", () => {
    const toolNames = allTools.map((t) => t.name);
    expect(new Set(toolNames).size).toBe(toolNames.length);
    for (const name of toolNames) {
      expect(name).toMatch(/^[a-z][a-z0-9_]*$/);
    }

    const resourceUris = allResources.map((r) => r.uri);
    expect(new Set(resourceUris).size).toBe(resourceUris.length);
    for (const uri of resourceUris) {
      expect(uri.startsWith("recomp://")).toBe(true);
    }

    const promptNames = allPrompts.map((p) => p.name);
    expect(new Set(promptNames).size).toBe(promptNames.length);
    for (const name of promptNames) {
      expect(name).toMatch(/^[a-z][a-z0-9-]*$/);
    }
  });

  it("validates scopes, access modes, and official MCP tool annotations", () => {
    for (const tool of allTools) {
      if (tool.name === "about") {
        expect(tool.requiredScope).toBeNull();
        expect(tool.accessMode).toBe("read");
      } else {
        expect(tool.requiredScope).toBeTruthy();
        expect(SUPPORTED_SCOPE_SET.has(tool.requiredScope!)).toBe(true);
        const expectedMode = tool.requiredScope!.endsWith(":write") ? "write" : "read";
        expect(tool.accessMode).toBe(expectedMode);
      }

      expect(tool.annotations.readOnlyHint).toBe(tool.accessMode === "read");
      expect(tool.annotations.destructiveHint).toBe(DESTRUCTIVE_TOOLS.has(tool.name));
      expect(tool.annotations.openWorldHint).toBe(OPEN_WORLD_TOOLS.has(tool.name));
    }

    for (const res of allResources) {
      expect(SUPPORTED_SCOPE_SET.has(res.requiredScope)).toBe(true);
      expect(res.requiredScope.endsWith(":read")).toBe(true);
    }

    for (const prompt of allPrompts) {
      expect(prompt.requiredScopes.length).toBeGreaterThan(0);
      for (const s of prompt.requiredScopes) {
        expect(SUPPORTED_SCOPE_SET.has(s)).toBe(true);
      }
    }
  });

  it("never exposes Web-UI-only hard-excluded security operations", () => {
    for (const tool of allTools) {
      expect(tool.name).not.toMatch(FORBIDDEN_SECURITY_PATTERN);
    }
  });
});
