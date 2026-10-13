import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor, fireEvent } from "@testing-library/react";
import Activities from "../Activities";
import { api } from "@/lib/api";
import "@/lib/i18n";

vi.mock("@/lib/api", () => {
  return {
    api: {
      getWorkouts: vi.fn(),
      getMuscleReadiness: vi.fn(),
      syncHevy: vi.fn(),
    },
  };
});

const mockWorkoutsData = {
  workouts: [
    {
      id: "w-1",
      title: "Chest & Triceps Power",
      description: "Heavy bench day",
      startTime: "2026-10-12T10:00:00Z",
      endTime: "2026-10-12T11:00:00Z",
      durationSeconds: 3600,
      totalVolumeKg: 5200,
      sessionCaloriesBurned: 320,
      epocCaloriesBurned: 45,
      totalCaloriesBurned: 365,
      avgRpe: 8.5,
      source: "hevy",
      exerciseCount: 4,
      setCount: 16,
      primaryMuscleGroups: ["chest", "arms"],
    },
  ],
  total: 1,
  page: 1,
  pageSize: 15,
  hasMore: false,
};

const mockReadinessData = {
  overallReadiness: "ready" as const,
  smartRecommendation: {
    status: "ready",
    readyGroups: ["chest"],
    recoveringGroups: [],
    suggestedFocus: ["chest"],
    message: "Optimal state for high intensity training.",
  },
  userProfile: {
    gender: "male",
    age: 30,
    effectiveWeightKg: 75,
  },
  muscleGroups: [
    {
      group: "chest",
      name: "Chest",
      status: "ready" as const,
      readinessScore: 100,
      lastTrainedAt: null,
      hoursSinceLastTrained: null,
      recommendedRecoveryHours: 48,
      remainingRecoveryHours: 0,
      lastVolumeKg: 0,
      lastSetCount: 0,
      lastAvgRpe: null,
    },
  ],
};

describe("Activities View Component", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("renders header, summary KPI cards, and workout feed", async () => {
    vi.mocked(api.getWorkouts).mockResolvedValue(mockWorkoutsData);
    vi.mocked(api.getMuscleReadiness).mockResolvedValue(mockReadinessData);

    render(<Activities />);

    await waitFor(() => {
      expect(screen.getByText("Workouts & Activities")).toBeInTheDocument();
      expect(screen.getByText("Chest & Triceps Power")).toBeInTheDocument();
      expect(screen.getAllByText(/5,?200/i).length).toBeGreaterThanOrEqual(1);
      expect(screen.getAllByText(/365/i).length).toBeGreaterThanOrEqual(1);
      expect(screen.getByText(/\+45 kcal/i)).toBeInTheDocument();
      expect(screen.getAllByText(/8\.5/i).length).toBeGreaterThanOrEqual(1);
    });
  });

  it("renders empty state when no workouts exist", async () => {
    vi.mocked(api.getWorkouts).mockResolvedValue({
      workouts: [],
      total: 0,
      page: 1,
      pageSize: 15,
      hasMore: false,
    });
    vi.mocked(api.getMuscleReadiness).mockResolvedValue(mockReadinessData);

    render(<Activities />);

    await waitFor(() => {
      expect(screen.getByText(/No Workouts Found/i)).toBeInTheDocument();
      expect(screen.getByRole("link", { name: /Connect Hevy Account/i })).toBeInTheDocument();
    });
  });

  it("triggers sync when clicking Sync Workouts button", async () => {
    vi.mocked(api.getWorkouts).mockResolvedValue(mockWorkoutsData);
    vi.mocked(api.getMuscleReadiness).mockResolvedValue(mockReadinessData);
    vi.mocked(api.syncHevy).mockResolvedValue({
      success: true,
      message: "Sync complete",
      syncedWorkouts: 2,
      totalWorkouts: 5,
    });

    render(<Activities />);

    await waitFor(() => {
      expect(screen.getByRole("button", { name: /Sync Workouts/i })).toBeInTheDocument();
    });

    const syncBtn = screen.getByRole("button", { name: /Sync Workouts/i });
    fireEvent.click(syncBtn);

    await waitFor(() => {
      expect(api.syncHevy).toHaveBeenCalledWith(1, 20);
      expect(screen.getByText(/Workouts synchronized: 2 new sessions out of 5/i)).toBeInTheDocument();
    });
  });
});
