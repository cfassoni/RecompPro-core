import { describe, it, expect } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import MuscleReadinessWidget from "../MuscleReadinessWidget";
import type { MuscleReadinessResponse } from "@/lib/api";
import "@/lib/i18n";

const mockReadiness: MuscleReadinessResponse = {
  overallReadiness: "recovering",
  smartRecommendation: {
    status: "recovering",
    readyGroups: ["chest", "back"],
    recoveringGroups: ["quadriceps"],
    suggestedFocus: ["chest", "back"],
    message: "Chest and Back are fully recovered (100%). Quadriceps have ~14h of recovery remaining.",
  },
  userProfile: {
    gender: "male",
    age: 34,
    effectiveWeightKg: 78.5,
  },
  muscleGroups: [
    {
      group: "chest",
      name: "Chest",
      status: "ready",
      readinessScore: 100,
      lastTrainedAt: "2026-10-10T10:00:00Z",
      hoursSinceLastTrained: 72,
      recommendedRecoveryHours: 48,
      remainingRecoveryHours: 0,
      lastVolumeKg: 3200,
      lastSetCount: 12,
      lastAvgRpe: 8,
    },
    {
      group: "quadriceps",
      name: "Quadriceps",
      status: "recovering",
      readinessScore: 65,
      lastTrainedAt: "2026-10-12T10:00:00Z",
      hoursSinceLastTrained: 24,
      recommendedRecoveryHours: 54,
      remainingRecoveryHours: 30,
      lastVolumeKg: 4500,
      lastSetCount: 15,
      lastAvgRpe: 8.5,
    },
  ],
};

describe("MuscleReadinessWidget Component", () => {
  it("renders loading skeleton when isLoading is true", () => {
    const { container } = render(<MuscleReadinessWidget readiness={null} isLoading={true} />);
    expect(container.querySelector(".animate-pulse")).toBeInTheDocument();
  });

  it("renders empty state when no readiness data is available", () => {
    render(<MuscleReadinessWidget readiness={null} isLoading={false} />);
    expect(screen.getByText(/Muscle Group Readiness/i)).toBeInTheDocument();
    expect(screen.getByText(/No strength workouts recorded yet/i)).toBeInTheDocument();
  });

  it("renders full view with recommendation and muscle group cards", () => {
    render(<MuscleReadinessWidget readiness={mockReadiness} isLoading={false} compact={false} />);

    expect(screen.getByText(/Muscle Group Readiness/i)).toBeInTheDocument();
    expect(screen.getByText(/Chest and Back are fully recovered/i)).toBeInTheDocument();
    expect(screen.getAllByText("Chest").length).toBeGreaterThanOrEqual(1);
    expect(screen.getByText("Quadriceps")).toBeInTheDocument();
    expect(screen.getByText("100%")).toBeInTheDocument();
    expect(screen.getByText("65%")).toBeInTheDocument();
  });

  it("renders compact view with link to activities", () => {
    render(<MuscleReadinessWidget readiness={mockReadiness} isLoading={false} compact={true} />);

    expect(screen.getByText(/Muscle Group Readiness/i)).toBeInTheDocument();
    expect(screen.getByText(/Chest and Back are fully recovered/i)).toBeInTheDocument();
    const link = screen.getByRole("link", { name: /View Workouts/i });
    expect(link).toHaveAttribute("href", "/activities");
  });

  it("toggles collapse and expand when clicking the collapse button in full view", () => {
    render(<MuscleReadinessWidget readiness={mockReadiness} isLoading={false} compact={false} />);

    expect(screen.getByText(/Chest and Back are fully recovered/i)).toBeInTheDocument();

    // Click collapse
    const collapseBtn = screen.getByRole("button", { name: /Recolher|Collapse/i });
    expect(collapseBtn).toBeInTheDocument();
    fireEvent.click(collapseBtn);

    // Body should be hidden
    expect(screen.queryByText(/Chest and Back are fully recovered/i)).not.toBeInTheDocument();

    // Click expand
    const expandBtn = screen.getByRole("button", { name: /Expandir|Expand/i });
    expect(expandBtn).toBeInTheDocument();
    fireEvent.click(expandBtn);

    // Body should be visible again
    expect(screen.getByText(/Chest and Back are fully recovered/i)).toBeInTheDocument();
  });
});
