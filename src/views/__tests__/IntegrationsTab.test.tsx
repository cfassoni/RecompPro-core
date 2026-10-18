import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import IntegrationsTab from "../profile/IntegrationsTab";
import { api } from "@/lib/api";
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
      t: (key: string, options?: { count?: number; email?: string; inserted?: number; updated?: number }) => {
        let text = getTranslation(enTranslations, key) || key;
        if (options?.inserted !== undefined) {
          text = text.replace("{{inserted}}", String(options.inserted));
        }
        if (options?.updated !== undefined) {
          text = text.replace("{{updated}}", String(options.updated));
        }
        return text;
      },
      i18n: { language: "en" },
    }),
  };
});

vi.mock("@/lib/api", () => ({
  api: {
    getIntegrations: vi.fn(),
    connectFitdays: vi.fn(),
    selectFitdaysProfile: vi.fn(),
    syncFitdays: vi.fn(),
    disconnectFitdays: vi.fn(),
    updateFitdaysConfig: vi.fn(),
  },
}));

describe("IntegrationsTab Component", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("renders connection form when Fitdays is not connected", async () => {
    vi.mocked(api.getIntegrations).mockResolvedValueOnce([]);

    render(<IntegrationsTab />);

    await waitFor(() => {
      expect(screen.getByText("Fitdays Cloud")).toBeInTheDocument();
      expect(screen.getByRole("button", { name: /Connect & Verify/i })).toBeInTheDocument();
    });

    expect(screen.getByLabelText(/Fitdays Account Email \/ Phone/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/Fitdays Password/i)).toBeInTheDocument();
  });

  it("renders connected panel with metadata and sync controls when connected", async () => {
    vi.mocked(api.getIntegrations).mockResolvedValueOnce([
      {
        id: 1,
        provider: "fitdays",
        accountIdentifier: "user@fitdays.com",
        status: "connected",
        lastSyncedAt: "2026-06-10T12:00:00Z",
        lastSyncError: null,
        config: {
          selectedSuid: 1001,
          selectedProfileName: "Primary User",
          skipWeightOnly: true,
          devices: [{ name: "Fitdays Smart Scale", model: "CF516", mac: "AA:BB" }],
          profiles: [],
        },
        createdAt: "2026-06-01T00:00:00Z",
        updatedAt: "2026-06-10T12:00:00Z",
      },
    ]);

    render(<IntegrationsTab />);

    await waitFor(() => {
      expect(screen.getByText("Connected")).toBeInTheDocument();
      expect(screen.getByText("user@fitdays.com")).toBeInTheDocument();
      expect(screen.getByText("Primary User")).toBeInTheDocument();
      expect(screen.getByText("Fitdays Smart Scale")).toBeInTheDocument();
      expect(screen.getByRole("button", { name: /Sync Now/i })).toBeInTheDocument();
    });
  });

  it("triggers sync when clicking Sync Now button", async () => {
    vi.mocked(api.getIntegrations).mockResolvedValue([
      {
        id: 1,
        provider: "fitdays",
        accountIdentifier: "user@fitdays.com",
        status: "connected",
        lastSyncedAt: "2026-06-10T12:00:00Z",
        lastSyncError: null,
        config: {
          selectedSuid: 1001,
          selectedProfileName: "Primary User",
          skipWeightOnly: true,
          devices: [],
          profiles: [],
        },
        createdAt: "2026-06-01T00:00:00Z",
        updatedAt: "2026-06-10T12:00:00Z",
      },
    ]);

    vi.mocked(api.syncFitdays).mockResolvedValueOnce({
      success: true,
      result: { inserted: 3, updated: 1, totalProcessed: 4 },
      lastSyncedAt: "2026-06-10T12:30:00Z",
    });

    render(<IntegrationsTab />);

    await waitFor(() => {
      expect(screen.getByRole("button", { name: /Sync Now/i })).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole("button", { name: /Sync Now/i }));

    await waitFor(() => {
      expect(api.syncFitdays).toHaveBeenCalledWith(false);
      expect(screen.getByText(/3 new scans added, 1 existing scans updated/i)).toBeInTheDocument();
    });
  });

  it("opens disconnect modal and revokes integration upon confirmation", async () => {
    vi.mocked(api.getIntegrations).mockResolvedValue([
      {
        id: 1,
        provider: "fitdays",
        accountIdentifier: "user@fitdays.com",
        status: "connected",
        lastSyncedAt: "2026-06-10T12:00:00Z",
        lastSyncError: null,
        config: {
          selectedSuid: 1001,
          selectedProfileName: "Primary User",
          skipWeightOnly: true,
        },
        createdAt: "2026-06-01T00:00:00Z",
        updatedAt: "2026-06-10T12:00:00Z",
      },
    ]);

    vi.mocked(api.disconnectFitdays).mockResolvedValueOnce({
      success: true,
      message: "revoked",
    });

    render(<IntegrationsTab />);

    await waitFor(() => {
      expect(screen.getByRole("button", { name: /Disconnect Integration/i })).toBeInTheDocument();
    });

    // Open modal
    fireEvent.click(screen.getByRole("button", { name: /Disconnect Integration/i }));
    expect(screen.getByText("Disconnect Fitdays Cloud?")).toBeInTheDocument();

    // Confirm inside modal
    const confirmButtons = screen.getAllByRole("button", { name: /Disconnect Integration/i });
    fireEvent.click(confirmButtons[confirmButtons.length - 1]);

    await waitFor(() => {
      expect(api.disconnectFitdays).toHaveBeenCalled();
    });
  });

  it("renders member profile selector with Male for sex 0 and formatted birthday", async () => {
    vi.mocked(api.getIntegrations).mockResolvedValueOnce([]);
    vi.mocked(api.connectFitdays).mockResolvedValueOnce({
      success: true,
      profiles: [
        {
          suid: 110320223,
          nickname: "Celso Fassoni",
          height: 184,
          birthday: "1971-05-28 00:00:00",
          target_weight: 86,
          sex: 0,
        },
      ],
      devices: [],
    });

    render(<IntegrationsTab />);

    await waitFor(() => {
      expect(screen.getByRole("button", { name: /Connect & Verify/i })).toBeInTheDocument();
    });

    fireEvent.change(screen.getByLabelText(/Fitdays Account Email \/ Phone/i), {
      target: { value: "celso@example.com" },
    });
    fireEvent.change(screen.getByLabelText(/Fitdays Password/i), {
      target: { value: "password123" },
    });

    fireEvent.click(screen.getByRole("button", { name: /Connect & Verify/i }));

    await waitFor(() => {
      expect(screen.getByText("Select Member Profile")).toBeInTheDocument();
      expect(screen.getByText("Celso Fassoni")).toBeInTheDocument();
      expect(screen.getByText(/Male/i)).toBeInTheDocument();
      expect(screen.queryByText(/Female/i)).not.toBeInTheDocument();
      expect(screen.queryByText(/00:00:00/i)).not.toBeInTheDocument();
    });
  });
});
