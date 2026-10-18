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
      getWorkoutProgressions: vi.fn().mockResolvedValue({
        period: "1m",
        totalPrsInPeriod: 0,
        exercisesProgressedCount: 0,
        items: [],
      }),
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

  it("renders header, summary KPI cards, and expands workout feed", async () => {
    vi.mocked(api.getWorkouts).mockResolvedValue(mockWorkoutsData);
    vi.mocked(api.getMuscleReadiness).mockResolvedValue(mockReadinessData);

    render(<Activities />);

    await waitFor(() => {
      expect(screen.getByText("Workouts & Activities")).toBeInTheDocument();
      expect(screen.getByText("Training Overview")).toBeInTheDocument();
      expect(screen.getAllByText(/5,?200/i).length).toBeGreaterThanOrEqual(1);
      expect(screen.getAllByText(/365/i).length).toBeGreaterThanOrEqual(1);
      expect(screen.getByText(/\+45 kcal/i)).toBeInTheDocument();
      expect(screen.getAllByText(/8\.5/i).length).toBeGreaterThanOrEqual(1);
    });

    // Workouts history is collapsed by default
    expect(screen.queryByText("Chest & Triceps Power")).not.toBeInTheDocument();

    // Click expand button on Workouts History card (the second expand button or by title/aria-label)
    const expandButtons = screen.getAllByRole("button", { name: /Expandir|Expand/i });
    expect(expandButtons.length).toBeGreaterThanOrEqual(1);

    // Expand the history widget (the last expand button)
    fireEvent.click(expandButtons[expandButtons.length - 1]);

    await waitFor(() => {
      expect(screen.getByText("Chest & Triceps Power")).toBeInTheDocument();
    });
  });

  it("renders empty state when no workouts exist and history is expanded", async () => {
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
      expect(screen.getByText("Workouts & Activities")).toBeInTheDocument();
    });

    // Expand history
    const expandButtons = screen.getAllByRole("button", { name: /Expandir|Expand/i });
    fireEvent.click(expandButtons[expandButtons.length - 1]);

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

  it("filters history workouts by search query", async () => {
    vi.mocked(api.getWorkouts).mockResolvedValue({
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
          hasProgression: true,
          progressionCount: 1,
          exercises: [
            {
              id: "e-1",
              title: "Bench Press",
              index: 0,
              primaryMuscleGroup: "chest",
              equipment: "barbell",
              setsCount: 4,
              sets: [],
            },
          ],
        },
        {
          id: "w-2",
          title: "Legs & Abs Routine",
          description: "Squat day",
          startTime: "2026-10-14T10:00:00Z",
          endTime: "2026-10-14T11:00:00Z",
          durationSeconds: 3600,
          totalVolumeKg: 6000,
          sessionCaloriesBurned: 400,
          epocCaloriesBurned: 50,
          totalCaloriesBurned: 450,
          avgRpe: 9.0,
          source: "hevy",
          exerciseCount: 4,
          setCount: 16,
          hasProgression: false,
          progressionCount: 0,
          exercises: [],
        },
      ],
      total: 2,
      page: 1,
      pageSize: 15,
      hasMore: false,
    });
    vi.mocked(api.getMuscleReadiness).mockResolvedValue(mockReadinessData);

    render(<Activities />);

    await waitFor(() => {
      expect(screen.getByText("Workouts & Activities")).toBeInTheDocument();
    });

    // Expand history
    const expandButtons = screen.getAllByRole("button", { name: /Expandir|Expand/i });
    fireEvent.click(expandButtons[expandButtons.length - 1]);

    await waitFor(() => {
      expect(screen.getByText("Chest & Triceps Power")).toBeInTheDocument();
      expect(screen.getByText("Legs & Abs Routine")).toBeInTheDocument();
    });

    // Search for "Bench"
    const searchInput = screen.getByPlaceholderText(/Search by date or workout|Buscar por data/i);
    fireEvent.change(searchInput, { target: { value: "Bench" } });

    expect(screen.getByText("Chest & Triceps Power")).toBeInTheDocument();
    expect(screen.queryByText("Legs & Abs Routine")).not.toBeInTheDocument();

    // Toggle PR filter
    const prFilterBtn = screen.getByRole("button", { name: /PRs only|Apenas PRs/i });
    fireEvent.change(searchInput, { target: { value: "" } });
    fireEvent.click(prFilterBtn);

    expect(screen.getByText("Chest & Triceps Power")).toBeInTheDocument();
    expect(screen.queryByText("Legs & Abs Routine")).not.toBeInTheDocument();
  });
});
