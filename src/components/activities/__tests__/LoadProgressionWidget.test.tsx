import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import LoadProgressionWidget from "../LoadProgressionWidget";
import { api } from "@/lib/api";
import "@/lib/i18n";

vi.mock("@/lib/api", () => ({
  api: {
    getWorkoutProgressions: vi.fn(),
  },
}));

describe("LoadProgressionWidget Component", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("renders loading state initially", () => {
    vi.mocked(api.getWorkoutProgressions).mockReturnValue(new Promise(() => {}));
    const { container } = render(<LoadProgressionWidget />);
    expect(container.querySelector(".animate-spin")).toBeInTheDocument();
  });

  it("renders progression items when data is returned", async () => {
    vi.mocked(api.getWorkoutProgressions).mockResolvedValue({
      period: "1m",
      totalPrsInPeriod: 3,
      exercisesProgressedCount: 2,
      items: [
        {
          canonicalKey: "bench-press",
          title: "Supino Reto (Barra)",
          primaryMuscleGroup: "chest",
          isAssisted: false,
          startWeightKg: 80,
          currentWeightKg: 85,
          deltaWeightKg: 5,
          pctChange: 6.3,
          bestWeightKg: 85,
          bestRepsAtWeight: 8,
          bestEst1RmKg: 107.7,
          prCountInPeriod: 2,
          lastProgressedAt: "2026-10-14T10:00:00Z",
        },
        {
          canonicalKey: "graviton-pullup",
          title: "Pull Up (Assisted)",
          primaryMuscleGroup: "back",
          isAssisted: true,
          startWeightKg: 35,
          currentWeightKg: 30,
          deltaWeightKg: -5,
          pctChange: 14.3,
          bestWeightKg: 30,
          bestRepsAtWeight: 10,
          bestEst1RmKg: 0,
          prCountInPeriod: 1,
          lastProgressedAt: "2026-10-15T10:00:00Z",
        },
      ],
    });

    render(<LoadProgressionWidget />);

    await waitFor(() => {
      expect(screen.getByText("Supino Reto (Barra)")).toBeInTheDocument();
      expect(screen.getByText("Pull Up (Assisted)")).toBeInTheDocument();
    });

    expect(screen.getByText("+5 kg (+6.3%)")).toBeInTheDocument();
    expect(screen.getByText("-5 kg assist. (+14.3%)")).toBeInTheDocument();
  });

  it("renders empty state when no exercises progressed in period", async () => {
    vi.mocked(api.getWorkoutProgressions).mockResolvedValue({
      period: "1m",
      totalPrsInPeriod: 0,
      exercisesProgressedCount: 0,
      items: [],
    });

    render(<LoadProgressionWidget />);

    await waitFor(() => {
      expect(screen.queryByText("Supino Reto (Barra)")).not.toBeInTheDocument();
    });
  });
});
