import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import WorkoutStatsWidget from "../WorkoutStatsWidget";
import type { WorkoutStatsResponse } from "@/lib/api";
import "@/lib/i18n";

const mockStats: WorkoutStatsResponse = {
  period: "3m",
  summary: {
    totalWorkouts: 24,
    totalDurationSeconds: 86400,
    totalVolumeKg: 78500,
    totalReps: 5400,
    currentWeekDurationSeconds: 7380, // 2 h 3 min
    currentWeekVolumeKg: 6200,
    currentWeekReps: 450,
    currentWeekWorkoutsCount: 3,
  },
  chartData: [
    {
      label: "2 de ago.",
      startDate: "2026-08-02T00:00:00Z",
      endDate: "2026-08-08T23:59:59Z",
      durationHours: 5.2,
      durationSeconds: 18720,
      volumeKg: 15400,
      reps: 1120,
      workoutsCount: 4,
    },
    {
      label: "9 de ago.",
      startDate: "2026-08-09T00:00:00Z",
      endDate: "2026-08-15T23:59:59Z",
      durationHours: 3.4,
      durationSeconds: 12240,
      volumeKg: 9800,
      reps: 780,
      workoutsCount: 3,
    },
  ],
  calendarDays: {},
};

describe("WorkoutStatsWidget Component", () => {
  it("renders loading skeleton when isLoading is true", () => {
    const { container } = render(
      <WorkoutStatsWidget
        stats={null}
        selectedPeriod="3m"
        onPeriodChange={vi.fn()}
        isLoading={true}
      />
    );
    expect(container.querySelector(".animate-pulse")).toBeInTheDocument();
  });

  it("renders empty state when chartData has no workouts", () => {
    const emptyStats: WorkoutStatsResponse = {
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
    };

    render(
      <WorkoutStatsWidget
        stats={emptyStats}
        selectedPeriod="3m"
        onPeriodChange={vi.fn()}
        isLoading={false}
      />
    );

    expect(screen.getByText(/Workout Statistics/i)).toBeInTheDocument();
    expect(screen.getByText(/No strength workouts recorded in this period/i)).toBeInTheDocument();
  });

  it("renders stats with tabs and triggers metric tab switching", () => {
    render(
      <WorkoutStatsWidget
        stats={mockStats}
        selectedPeriod="3m"
        onPeriodChange={vi.fn()}
        isLoading={false}
      />
    );

    // Title
    expect(screen.getByText(/Workout Statistics/i)).toBeInTheDocument();

    // Default tab is Duration -> 2 h 3 min
    expect(screen.getByText(/2 h 3 min/i)).toBeInTheDocument();
    expect(screen.getByText(/This week/i)).toBeInTheDocument();

    // Switch to Reps tab
    const repsTab = screen.getByRole("button", { name: /^Reps$/i });
    fireEvent.click(repsTab);

    // Headline changes to reps (450)
    expect(screen.getByText("450")).toBeInTheDocument();

    // Switch to Volume tab
    const volumeTab = screen.getByRole("button", { name: /^Volume$/i });
    fireEvent.click(volumeTab);

    // Headline changes to volume (6,200 kg)
    expect(screen.getByText(/6,200 kg/i)).toBeInTheDocument();
  });

  it("calls onPeriodChange when horizon button is clicked", () => {
    const handlePeriodChange = vi.fn();
    render(
      <WorkoutStatsWidget
        stats={mockStats}
        selectedPeriod="3m"
        onPeriodChange={handlePeriodChange}
        isLoading={false}
      />
    );

    const oneMonthBtn = screen.getByRole("button", { name: "1M" });
    fireEvent.click(oneMonthBtn);

    expect(handlePeriodChange).toHaveBeenCalledWith("1m");
  });
});
