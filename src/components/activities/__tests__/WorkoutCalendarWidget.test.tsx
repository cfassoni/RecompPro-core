import { describe, it, expect } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import WorkoutCalendarWidget from "../WorkoutCalendarWidget";
import type { WorkoutCalendarItem } from "@/lib/api";
import "@/lib/i18n";

const mockCalendarDays: Record<string, WorkoutCalendarItem[]> = {
  "2026-10-13": [
    {
      id: "w-1",
      title: "Hypertrophy Upper A",
      startTime: "2026-10-13T10:00:00Z",
      durationSeconds: 3600,
      totalVolumeKg: 4200,
      repsCount: 280,
    },
  ],
  "2026-10-05": [
    {
      id: "w-2",
      title: "Leg Day Squats",
      startTime: "2026-10-05T18:00:00Z",
      durationSeconds: 4500,
      totalVolumeKg: 6800,
      repsCount: 320,
    },
  ],
};

describe("WorkoutCalendarWidget Component", () => {
  it("renders loading skeleton when isLoading is true", () => {
    const { container } = render(
      <WorkoutCalendarWidget calendarDays={{}} isLoading={true} />
    );
    expect(container.querySelector(".animate-pulse")).toBeInTheDocument();
  });

  it("renders calendar with day cells and navigation", () => {
    render(
      <WorkoutCalendarWidget calendarDays={mockCalendarDays} isLoading={false} />
    );

    // Title
    expect(screen.getByText(/Calendar/i)).toBeInTheDocument();

    // Month navigation buttons
    expect(
      screen.getByRole("button", { name: /Previous Month/i })
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /Next Month/i })
    ).toBeInTheDocument();

    // Link to all workouts
    expect(
      screen.getByRole("link", { name: /View all workouts/i })
    ).toHaveAttribute("href", "/activities");
  });

  it("inspects workout details when a day with workout is clicked", () => {
    render(
      <WorkoutCalendarWidget calendarDays={mockCalendarDays} isLoading={false} />
    );

    // Click on day button with title containing "2026-10-13"
    const dayBtn = screen.getByTitle(/2026-10-13/i);
    fireEvent.click(dayBtn);

    // Details for 2026-10-13 should appear
    expect(screen.getByText("Hypertrophy Upper A")).toBeInTheDocument();
    expect(screen.getByText(/4,200 kg/i)).toBeInTheDocument();
  });

  it("navigates months when clicking next and previous buttons", () => {
    render(
      <WorkoutCalendarWidget calendarDays={mockCalendarDays} isLoading={false} />
    );

    const prevBtn = screen.getByRole("button", { name: /Previous Month/i });
    const nextBtn = screen.getByRole("button", { name: /Next Month/i });

    // Navigate to previous month
    fireEvent.click(prevBtn);
    // Navigate back to current month
    fireEvent.click(nextBtn);
  });
});
