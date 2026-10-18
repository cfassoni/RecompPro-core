import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { vi, describe, it, expect, beforeEach } from "vitest";
import Biometrics from "../Biometrics";
import { api } from "@/lib/api";
import type { RecompRecord } from "@/lib/api";
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

const mockReplace = vi.fn();
let mockSearchParams = new URLSearchParams();

vi.mock("next/navigation", () => ({
  useRouter: () => ({
    replace: mockReplace,
    push: vi.fn(),
  }),
  useSearchParams: () => mockSearchParams,
}));

vi.mock("react-i18next", async (importOriginal) => {
  const actual = await importOriginal<typeof import("react-i18next")>();
  return {
    ...actual,
    useTranslation: () => ({
      t: (key: string, options?: Record<string, unknown>) => {
        let val = getTranslation(enTranslations, key);
        if (options) {
          Object.entries(options).forEach(([k, v]) => {
            val = val.replace(`{{${k}}}`, String(v));
          });
        }
        return val || key;
      },
      i18n: {
        language: "en",
      },
    }),
  };
});

vi.mock("@/lib/api", () => ({
  api: {
    getRecords: vi.fn(),
    toggleRecordStar: vi.fn(),
    deleteRecords: vi.fn(),
    createSharedLink: vi.fn(),
    getSharedLinks: vi.fn(),
    uploadCSV: vi.fn(),
    getIntegrations: vi.fn(),
    syncFitdays: vi.fn(),
  },
}));

const mockRecords: RecompRecord[] = [
  {
    id: 1,
    date: "2026-08-01T08:00:00Z",
    weight: 80.0,
    bmi: 24.5,
    body_fat_pct: 18.0,
    skeletal_muscle_mass: 38.0,
    bmr: 1850,
    visceral_fat: 6,
    moisture_content: 48.0,
    bone_mass: 3.2,
    protein_mass: 12.0,
    metabolic_age: 26,
    fat_free_mass: 65.6,
    subcutaneous_fat_pct: 14.5,
    body_score: 85,
    starred: false,
    report: null,
  },
  {
    id: 2,
    date: "2026-08-15T08:00:00Z",
    weight: 78.5,
    bmi: 24.0,
    body_fat_pct: 16.5,
    skeletal_muscle_mass: 39.0,
    bmr: 1880,
    visceral_fat: 5,
    moisture_content: 49.0,
    bone_mass: 3.2,
    protein_mass: 12.5,
    metabolic_age: 25,
    fat_free_mass: 66.0,
    subcutaneous_fat_pct: 13.0,
    body_score: 88,
    starred: true,
    report: null,
  },
  {
    id: 3,
    date: "2026-06-15T08:00:00Z",
    weight: 82.0,
    bmi: 25.0,
    body_fat_pct: 19.5,
    skeletal_muscle_mass: 37.0,
    bmr: 1820,
    visceral_fat: 7,
    moisture_content: 47.0,
    bone_mass: 3.1,
    protein_mass: 11.5,
    metabolic_age: 27,
    fat_free_mass: 64.0,
    subcutaneous_fat_pct: 15.0,
    body_score: 82,
    starred: false,
    report: null,
  },
  {
    id: 4,
    date: "2026-01-15T08:00:00Z",
    weight: 85.0,
    bmi: 26.0,
    body_fat_pct: 21.0,
    skeletal_muscle_mass: 36.0,
    bmr: 1800,
    visceral_fat: 8,
    moisture_content: 46.0,
    bone_mass: 3.0,
    protein_mass: 11.0,
    metabolic_age: 29,
    fat_free_mass: 63.0,
    subcutaneous_fat_pct: 16.5,
    body_score: 79,
    starred: false,
    report: null,
  },
] as unknown as RecompRecord[];

describe("Biometrics View Component", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockSearchParams = new URLSearchParams();
    (api.getRecords as ReturnType<typeof vi.fn>).mockResolvedValue(mockRecords);
    (api.getIntegrations as ReturnType<typeof vi.fn>).mockResolvedValue([]);
  });

  it("renders Biometrics Analysis header and Bento highlight cards", async () => {
    render(<Biometrics />);

    await waitFor(() => {
      expect(screen.getByText(/Biometrics Analysis/i)).toBeInTheDocument();
      expect(screen.getByText(/Basal Metabolic Rate \(BMR \/ TMB\)/i)).toBeInTheDocument();
      // Latest BMR should be formatted
      expect(screen.getByText("1,880")).toBeInTheDocument();
      // Evolution comparison card
      expect(screen.getByText(/Goals & Evolution Comparison/i)).toBeInTheDocument();
    });
  });

  it("renders table with records and star toggle", async () => {
    render(<Biometrics />);

    await waitFor(() => {
      expect(screen.getByText("80.0")).toBeInTheDocument();
      expect(screen.getByText("78.5")).toBeInTheDocument();
    });
  });

  it("opens CSV Import modal when Import CSV button is clicked", async () => {
    render(<Biometrics />);

    await waitFor(() => {
      expect(screen.getByText(/Biometrics Analysis/i)).toBeInTheDocument();
    });

    const importBtn = screen.getByRole("button", { name: /Import CSV/i });
    fireEvent.click(importBtn);

    expect(screen.getByText(/Compatible with Fitdays CSV exports up to 5MB/i)).toBeInTheDocument();
  });

  it("automatically opens CSV Import modal if ?import=open is in query params", async () => {
    mockSearchParams = new URLSearchParams("import=open");
    render(<Biometrics />);

    await waitFor(() => {
      expect(screen.getByText(/Compatible with Fitdays CSV exports up to 5MB/i)).toBeInTheDocument();
      expect(mockReplace).toHaveBeenCalledWith("/biometrics");
    });
  });

  it("opens record details drawer and closes it when clicking outside on the backdrop", async () => {
    render(<Biometrics />);

    await waitFor(() => {
      expect(screen.getAllByRole("button", { name: /Details/i })[0]).toBeInTheDocument();
    });

    const detailsBtn = screen.getAllByRole("button", { name: /Details/i })[0];
    fireEvent.click(detailsBtn);

    expect(screen.getByText(/Body Composition Report/i)).toBeInTheDocument();

    const backdrop = screen.getByTestId("drawer-backdrop");
    fireEvent.click(backdrop);

    await waitFor(() => {
      expect(screen.queryByText(/Body Composition Report/i)).not.toBeInTheDocument();
    });
  });

  it("closes record details drawer when pressing Escape key", async () => {
    render(<Biometrics />);

    await waitFor(() => {
      expect(screen.getAllByRole("button", { name: /Details/i })[0]).toBeInTheDocument();
    });

    const detailsBtn = screen.getAllByRole("button", { name: /Details/i })[0];
    fireEvent.click(detailsBtn);

    expect(screen.getByText(/Body Composition Report/i)).toBeInTheDocument();

    fireEvent.keyDown(window, { key: "Escape" });

    await waitFor(() => {
      expect(screen.queryByText(/Body Composition Report/i)).not.toBeInTheDocument();
    });
  });

  it("opens record details drawer when clicking directly on a table row", async () => {
    render(<Biometrics />);

    await waitFor(() => {
      expect(screen.getByText("78.5")).toBeInTheDocument();
    });

    // Click directly on a cell in the row
    fireEvent.click(screen.getByText("78.5"));

    await waitFor(() => {
      expect(screen.getByText(/Body Composition Report/i)).toBeInTheDocument();
    });
  });

  it("filters records when selecting time range filter pills (1M, 3M, All)", async () => {
    render(<Biometrics />);

    await waitFor(() => {
      expect(screen.getByText("85.0")).toBeInTheDocument();
      expect(screen.getByText("78.5")).toBeInTheDocument();
    });

    // Click "1M" pill
    const btn1M = screen.getByRole("button", { name: "1M" });
    fireEvent.click(btn1M);

    // Records older than 30 days from Aug 15 (e.g. Jan 15 with weight 85.0) should be hidden
    await waitFor(() => {
      expect(screen.queryByText("85.0")).not.toBeInTheDocument();
      expect(screen.getByText("78.5")).toBeInTheDocument();
    });

    // Click "All" pill to restore
    const btnAll = screen.getByRole("button", { name: "All" });
    fireEvent.click(btnAll);

    await waitFor(() => {
      expect(screen.getByText("85.0")).toBeInTheDocument();
    });
  });

  it("changes page size and navigates pages with pagination controls", async () => {
    render(<Biometrics />);

    await waitFor(() => {
      expect(screen.getByRole("combobox")).toBeInTheDocument();
    });

    // Change per-page size to 5
    const select = screen.getByRole("combobox");
    fireEvent.change(select, { target: { value: "5" } });

    await waitFor(() => {
      expect(screen.getByText(/Showing 4 of 4 records/i)).toBeInTheDocument();
    });
  });

  it("displays CSV import summary card after upload and closes when close button is clicked", async () => {
    (api.uploadCSV as ReturnType<typeof vi.fn>).mockResolvedValue({
      message: "Uploaded",
      total_processed: 12,
      inserted: 10,
      updated: 2,
    });

    render(<Biometrics />);

    await waitFor(() => {
      expect(screen.getByRole("button", { name: /Import CSV/i })).toBeInTheDocument();
    });

    // Open import modal
    fireEvent.click(screen.getByRole("button", { name: /Import CSV/i }));

    await waitFor(() => {
      expect(screen.getByText(/Compatible with Fitdays CSV exports up to 5MB/i)).toBeInTheDocument();
    });

    const file = new File(["date,weight\n2026-08-01,75.0"], "recomp.csv", { type: "text/csv" });
    const fileInput = document.querySelector('input[type="file"]') as HTMLInputElement;
    fireEvent.change(fileInput, { target: { files: [file] } });

    await waitFor(() => {
      expect(screen.getByText("recomp.csv")).toBeInTheDocument();
    });

    // Click upload
    fireEvent.click(screen.getByRole("button", { name: /Upload & Parse/i }));

    // Verify summary is rendered
    await waitFor(() => {
      expect(screen.getByText(/Import Completed Successfully!/i)).toBeInTheDocument();
      expect(screen.getByText("12")).toBeInTheDocument();
      expect(screen.getAllByText("10").length).toBeGreaterThanOrEqual(2);
      expect(screen.getByText("2")).toBeInTheDocument();
    });

    // Close via close button in summary
    const closeBtns = screen.getAllByRole("button", { name: /^Close$/i });
    fireEvent.click(closeBtns[1]);

    await waitFor(() => {
      expect(screen.queryByText(/Import Completed Successfully!/i)).not.toBeInTheDocument();
    });
  });

  it("does not render Sync button when no active integration exists", async () => {
    (api.getIntegrations as ReturnType<typeof vi.fn>).mockResolvedValue([]);
    render(<Biometrics />);

    await waitFor(() => {
      expect(screen.getByRole("button", { name: /Import CSV/i })).toBeInTheDocument();
    });

    expect(screen.queryByRole("button", { name: /^Sync$/i })).not.toBeInTheDocument();
  });

  it("renders Sync button when integration is connected and triggers sync on click", async () => {
    (api.getIntegrations as ReturnType<typeof vi.fn>).mockResolvedValue([
      {
        id: 1,
        provider: "fitdays",
        accountIdentifier: "test@fitdays.com",
        status: "connected",
        lastSyncedAt: "2026-10-13T10:00:00Z",
      },
    ]);
    (api.syncFitdays as ReturnType<typeof vi.fn>).mockResolvedValue({
      success: true,
      result: {
        totalProcessed: 5,
        inserted: 2,
        updated: 1,
      },
    });

    render(<Biometrics />);

    await waitFor(() => {
      expect(screen.getByRole("button", { name: /^Sync$/i })).toBeInTheDocument();
    });

    // Click Sync
    fireEvent.click(screen.getByRole("button", { name: /^Sync$/i }));

    await waitFor(() => {
      expect(api.syncFitdays).toHaveBeenCalledWith(false);
      expect(api.getRecords).toHaveBeenCalledTimes(2); // initial + after sync
      expect(screen.getByText(/Synchronization Complete/i)).toBeInTheDocument();
      expect(screen.getByText(/Synced: 2 added, 1 updated/i)).toBeInTheDocument();
    });
  });
});
