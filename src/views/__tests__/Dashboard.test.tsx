import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { vi, describe, it, expect, beforeEach } from "vitest";
import Dashboard from "../Dashboard";
import { api } from "@/lib/api";
import type { DashboardSummary } from "@/lib/api";
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
    getSummary: vi.fn(),
    getWorkoutStats: vi.fn(),
    getMuscleReadiness: vi.fn(),
  },
}));

const mockUseAuth = vi.fn(() => ({
  enableWipPages: false,
}));

vi.mock("@/context/AuthContext", () => ({
  useAuth: () => mockUseAuth(),
}));

// Mock recharts responsive container to render children
vi.mock("recharts", async (importOriginal) => {
  const actual = await importOriginal<typeof import("recharts")>();
  return {
    ...actual,
    ResponsiveContainer: ({ children }: { children: React.ReactNode }) => (
      <div style={{ width: 800, height: 400 }}>{children}</div>
    ),
  };
});

const mockSummary: DashboardSummary = {
  total_records: 12,
  first_record_date: "2026-06-01T08:00:00Z",
  latest_record_date: "2026-08-15T08:00:00Z",
  current_weight: 78.4,
  starting_weight: 81.2,
  weight_change: -2.8,
  current_body_fat: 16.2,
  starting_body_fat: 19.6,
  body_fat_change: -3.4,
  current_body_fat_mass: 12.7,
  starting_body_fat_mass: 15.9,
  body_fat_mass_change: -3.2,
  starting_muscle_mass: 65.3,
  current_muscle_mass: 65.7,
  muscle_mass_change: 0.4,
  current_skeletal_muscle_mass: 38.2,
  starting_skeletal_muscle_mass: 36.6,
  skeletal_muscle_mass_change: 1.6,
  current_skeletal_muscle_mass_pct: 48.7,
  starting_skeletal_muscle_mass_pct: 45.1,
  skeletal_muscle_mass_pct_change: 3.6,
  weight_history: [
    {
      date: "2026-06-01T08:00:00Z",
      weight: 81.2,
      body_fat_pct: 19.6,
      body_fat_mass: 15.9,
      muscle_mass: 65.3,
      skeletal_muscle_mass: 36.6,
      skeletal_muscle_mass_pct: 45.1,
    },
    {
      date: "2026-08-15T08:00:00Z",
      weight: 78.4,
      body_fat_pct: 16.2,
      body_fat_mass: 12.7,
      muscle_mass: 65.7,
      skeletal_muscle_mass: 38.2,
      skeletal_muscle_mass_pct: 48.7,
    },
  ],
};

describe("Dashboard View Component", () => {
  const mockNavigateToImport = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    mockUseAuth.mockReturnValue({ enableWipPages: false });
    (api.getSummary as ReturnType<typeof vi.fn>).mockResolvedValue(mockSummary);
    (api.getWorkoutStats as ReturnType<typeof vi.fn>).mockResolvedValue({
      period: "3m",
      summary: {
        totalWorkouts: 0,
        totalDurationSeconds: 0,
        totalVolumeKg: 0,
        totalReps: 0,
        currentWeekDurationSeconds: 0,
        currentWeekVolumeKg: 0,
        currentWeekReps: 0,
        currentWeekWorkoutsCount: 0,
      },
      chartData: [],
      calendarDays: {},
    });
    (api.getMuscleReadiness as ReturnType<typeof vi.fn>).mockResolvedValue({
      overallReadiness: "ready",
      smartRecommendation: {
        status: "ready",
        readyGroups: ["chest"],
        recoveringGroups: [],
        suggestedFocus: ["chest"],
        message: "All muscle groups are recovered.",
      },
      userProfile: { gender: "male", age: 30, effectiveWeightKg: 75 },
      muscleGroups: [],
    });
  });

  it("renders 3 Hero cards: Weight, Body Fat, Skeletal Muscle", async () => {
    render(<Dashboard onNavigateToImport={mockNavigateToImport} />);

    await waitFor(() => {
      expect(screen.getByText("78.4")).toBeInTheDocument();
      expect(screen.getByText("16.2")).toBeInTheDocument();
      expect(screen.getByText("38.2")).toBeInTheDocument();
    });
  });

  it("renders period filter pills: All, 1M, 3M, 6M, 1Y", async () => {
    render(<Dashboard onNavigateToImport={mockNavigateToImport} />);

    await waitFor(() => {
      expect(screen.getAllByRole("button", { name: "All" })[0]).toBeInTheDocument();
      expect(screen.getAllByRole("button", { name: "1M" })[0]).toBeInTheDocument();
      expect(screen.getAllByRole("button", { name: "3M" })[0]).toBeInTheDocument();
      expect(screen.getAllByRole("button", { name: "6M" })[0]).toBeInTheDocument();
      expect(screen.getAllByRole("button", { name: "1Y" })[0]).toBeInTheDocument();
    });

    const button1M = screen.getAllByRole("button", { name: "1M" })[0];
    fireEvent.click(button1M);
    expect(button1M).toHaveClass("bg-card");
  });

  it("hides Up Next Workout and Nutrition Today mockup cards and expands chart to full width when enableWipPages is false", async () => {
    mockUseAuth.mockReturnValue({ enableWipPages: false });
    render(<Dashboard onNavigateToImport={mockNavigateToImport} />);

    await waitFor(() => {
      expect(screen.getByText("78.4")).toBeInTheDocument();
    });

    expect(screen.queryByText(/Up Next Workout/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/Nutrition Today/i)).not.toBeInTheDocument();

    const chartHeading = screen.getByText(enTranslations.dashboard.weightHistoryTitle);
    const chartWidget = chartHeading.closest(".lg\\:col-span-12");
    expect(chartWidget).toBeInTheDocument();
  });

  it("renders Up Next Workout mockup card linking to /activities when enableWipPages is true", async () => {
    mockUseAuth.mockReturnValue({ enableWipPages: true });
    render(<Dashboard onNavigateToImport={mockNavigateToImport} />);

    await waitFor(() => {
      expect(screen.getByText(/Up Next Workout/i)).toBeInTheDocument();
      expect(screen.getByText(/Hypertrophy Upper A/i)).toBeInTheDocument();
      expect(screen.getByText(/Incline DB Bench Press/i)).toBeInTheDocument();
    });

    const startWorkoutLink = screen.getByRole("link", { name: /Start Workout/i });
    expect(startWorkoutLink).toHaveAttribute("href", "/activities");

    const chartHeading = screen.getByText(enTranslations.dashboard.weightHistoryTitle);
    const chartWidget = chartHeading.closest(".lg\\:col-span-8");
    expect(chartWidget).toBeInTheDocument();
  });

  it("renders Nutrition Today mockup card linking to /nutrition when enableWipPages is true", async () => {
    mockUseAuth.mockReturnValue({ enableWipPages: true });
    render(<Dashboard onNavigateToImport={mockNavigateToImport} />);

    await waitFor(() => {
      expect(screen.getByText("78.4")).toBeInTheDocument();
    });

    expect(screen.getByText(/Nutrition Today/i)).toBeInTheDocument();
    expect(screen.getByText("Caloric Budget")).toBeInTheDocument();
    expect(screen.getByText(/Protein/i)).toBeInTheDocument();
    expect(screen.getByText(/Carbs/i)).toBeInTheDocument();
    expect(screen.getByText(/Fats/i)).toBeInTheDocument();

    const viewNutritionLink = screen.getByRole("link", { name: /View Nutrition Plan/i });
    expect(viewNutritionLink).toHaveAttribute("href", "/nutrition");
  });

  it("renders empty state when total_records is 0 and handles import click", async () => {
    (api.getSummary as ReturnType<typeof vi.fn>).mockResolvedValue({
      total_records: 0,
      first_record_date: null,
      latest_record_date: null,
      current_weight: null,
      starting_weight: null,
      weight_change: null,
      current_body_fat: null,
      starting_body_fat: null,
      body_fat_change: null,
      current_body_fat_mass: null,
      starting_body_fat_mass: null,
      body_fat_mass_change: null,
      current_skeletal_muscle_mass: null,
      starting_skeletal_muscle_mass: null,
      skeletal_muscle_mass_change: null,
      current_skeletal_muscle_mass_pct: null,
      starting_skeletal_muscle_mass_pct: null,
      skeletal_muscle_mass_pct_change: null,
      weight_history: [],
    });

    render(<Dashboard onNavigateToImport={mockNavigateToImport} />);

    await waitFor(() => {
      expect(screen.getByText(/No data imported yet/i)).toBeInTheDocument();
    });

    const importBtn = screen.getByRole("button", { name: /Import CSV Data/i });
    fireEvent.click(importBtn);
    expect(mockNavigateToImport).toHaveBeenCalledTimes(1);
  });
});
