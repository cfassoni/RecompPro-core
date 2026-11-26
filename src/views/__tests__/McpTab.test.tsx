import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import McpTab from "../profile/McpTab";
import { api } from "@/lib/api";
import { copyTextToClipboard } from "@/lib/clipboard";
import enTranslations from "@/locales/en.json";

function getTranslation(obj: unknown, path: string): string {
  const parts = path.split(".");
  let current: unknown = obj;
  for (const part of parts) {
    if (current === undefined || current === null) return path;
    current = (current as Record<string, unknown>)[part];
  }
  return typeof current === "string" ? current : path;
}

vi.mock("react-i18next", async (importOriginal) => {
  const actual = await importOriginal<typeof import("react-i18next")>();
  return {
    ...actual,
    useTranslation: () => ({
      t: (key: string, options?: Record<string, string | number>) => {
        let str = getTranslation(enTranslations, key);
        if (options) {
          for (const [k, v] of Object.entries(options)) {
            str = str.replace(`{{${k}}}`, String(v));
          }
        }
        return str;
      },
      i18n: { language: "en" },
    }),
  };
});

vi.mock("@/lib/clipboard", () => ({
  copyTextToClipboard: vi.fn().mockResolvedValue(true),
}));

vi.mock("@/lib/api", () => ({
  api: {
    getMcpOverview: vi.fn(),
    revokeMcpGrant: vi.fn(),
    createMcpToken: vi.fn(),
    revokeMcpToken: vi.fn(),
  },
}));

const SAMPLE_OVERVIEW = {
  endpointUrl: "https://recomp.example.com/mcp",
  grants: [
    {
      id: "grant-1",
      clientId: "https://claude.ai/oauth-client.json",
      clientName: "Claude Web",
      clientUri: "https://claude.ai",
      registrationType: "cimd" as const,
      scopes: ["recomp:read"],
      readOnly: true,
      lastUsedAt: "2026-11-26T10:00:00.000Z",
      createdAt: "2026-11-25T10:00:00.000Z",
    },
  ],
  tokens: [
    {
      id: "pat-1",
      name: "Antigravity Desktop",
      tokenPrefix: "recomp_pat_abc1",
      scopes: ["recomp:read", "recomp:write"],
      readOnly: false,
      lastUsedAt: null,
      expiresAt: null,
      isExpired: false,
      createdAt: "2026-11-25T12:00:00.000Z",
    },
  ],
  auditLogs: [
    {
      id: 1,
      authMethod: "oauth" as const,
      clientLabel: "Claude Web",
      primitiveType: "tool" as const,
      primitiveName: "get_biometrics_summary",
      accessMode: "read" as const,
      status: "success" as const,
      errorCode: null,
      durationMs: 14,
      createdAt: "2026-11-26T10:05:00.000Z",
    },
  ],
};

describe("Profile AI / MCP Tab (McpTab)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(api.getMcpOverview).mockResolvedValue(SAMPLE_OVERVIEW);
  });

  it("renders disabled state when enableMcpServer is false", () => {
    render(<McpTab enableMcpServer={false} />);
    expect(screen.getByText("MCP Server Disabled")).toBeInTheDocument();
    expect(api.getMcpOverview).not.toHaveBeenCalled();
  });

  it("displays endpoint URL, quick-connect snippets, grants, PATs, and collapsible audit log", async () => {
    render(<McpTab enableMcpServer={true} />);

    await waitFor(() => {
      expect(screen.getByDisplayValue("https://recomp.example.com/mcp")).toBeInTheDocument();
    });

    // Copy endpoint URL
    const copyButtons = screen.getAllByRole("button", { name: "Copy" });
    fireEvent.click(copyButtons[0]);
    await waitFor(() => {
      expect(copyTextToClipboard).toHaveBeenCalledWith("https://recomp.example.com/mcp");
    });

    // Switch quick-connect client tab to Gemini
    fireEvent.click(screen.getByRole("tab", { name: "Gemini" }));
    expect(screen.getByText(/~\/\.gemini\/settings\.json/i)).toBeInTheDocument();

    // OAuth grant & PAT visible
    expect(screen.getByText("Claude Web")).toBeInTheDocument();
    expect(screen.getByText("Verified (CIMD)")).toBeInTheDocument();
    expect(screen.getByText("Antigravity Desktop")).toBeInTheDocument();

    // Audit log is collapsed by default
    expect(screen.queryByText("get_biometrics_summary")).not.toBeInTheDocument();

    // Expand audit log
    const expandBtn = screen.getByRole("button", { name: "Expand activity log" });
    fireEvent.click(expandBtn);
    expect(screen.getByText("get_biometrics_summary")).toBeInTheDocument();
    expect(screen.getByText("14 ms")).toBeInTheDocument();
  });

  it("creates a PAT with one-time secret reveal and supports Escape modal dismissal", async () => {
    vi.mocked(api.createMcpToken).mockResolvedValueOnce({
      id: "pat-new",
      name: "Gemini CLI",
      token: "recomp_pat_secret_once_123456",
      tokenPrefix: "recomp_pat_secr",
      scopes: ["recomp:read"],
      readOnly: true,
      expiresAt: null,
      createdAt: "2026-11-26T11:00:00.000Z",
    });

    render(<McpTab enableMcpServer={true} />);

    await waitFor(() => {
      expect(screen.getByRole("button", { name: "New Token" })).toBeInTheDocument();
    });

    // Open Create modal and test Escape dismissal
    fireEvent.click(screen.getByRole("button", { name: "New Token" }));
    expect(screen.getByRole("dialog")).toBeInTheDocument();
    fireEvent.keyDown(window, { key: "Escape" });
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();

    // Re-open and submit
    fireEvent.click(screen.getByRole("button", { name: "New Token" }));
    fireEvent.change(screen.getByLabelText("Token Label"), {
      target: { value: "Gemini CLI" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Generate Token" }));

    await waitFor(() => {
      expect(api.createMcpToken).toHaveBeenCalledWith({
        name: "Gemini CLI",
        accessMode: "read_only",
        scopes: undefined,
        expiresInDays: 90,
      });
      expect(
        screen.getByDisplayValue("recomp_pat_secret_once_123456")
      ).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole("button", { name: "I've Copied It" }));
    expect(
      screen.queryByDisplayValue("recomp_pat_secret_once_123456")
    ).not.toBeInTheDocument();
  });

  it("revokes an OAuth grant and a PAT after confirmation", async () => {
    vi.mocked(api.revokeMcpGrant).mockResolvedValueOnce({ success: true, id: "grant-1" });
    vi.mocked(api.revokeMcpToken).mockResolvedValueOnce({ success: true, id: "pat-1" });

    render(<McpTab enableMcpServer={true} />);

    await waitFor(() => {
      expect(screen.getByRole("button", { name: "Revoke Claude Web" })).toBeInTheDocument();
    });

    // Revoke OAuth grant
    fireEvent.click(screen.getByRole("button", { name: "Revoke Claude Web" }));
    const dialog = screen.getByRole("dialog");
    expect(dialog).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Revoke" }));

    await waitFor(() => {
      expect(api.revokeMcpGrant).toHaveBeenCalledWith("grant-1");
    });

    // Revoke PAT
    fireEvent.click(screen.getByRole("button", { name: "Revoke Antigravity Desktop" }));
    expect(screen.getByRole("dialog")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Revoke" }));

    await waitFor(() => {
      expect(api.revokeMcpToken).toHaveBeenCalledWith("pat-1");
    });
  });
});
