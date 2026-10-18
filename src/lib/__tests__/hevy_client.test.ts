import { describe, it, expect, vi } from "vitest";
import { HevyClient, HevyApiError } from "../hevy/client";

describe("HevyClient (client.ts)", () => {
  it("should throw an error if no apiKey is provided", () => {
    expect(() => new HevyClient({ apiKey: "" })).toThrow("HevyClient requires an API key");
  });

  it("should send request with api-key header", async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ id: "123", username: "athlete" }),
    });

    const client = new HevyClient({
      apiKey: "test-api-key-123",
      fetchFn: mockFetch as unknown as typeof fetch,
    });

    const userInfo = await client.getUserInfo();
    expect(userInfo).toEqual({ id: "123", username: "athlete" });
    expect(mockFetch).toHaveBeenCalledWith(
      "https://api.hevyapp.com/v1/user/info",
      expect.objectContaining({
        headers: expect.objectContaining({
          "api-key": "test-api-key-123",
        }),
      })
    );
  });

  it("should throw HevyApiError on 401 unauthorized", async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 401,
      json: async () => ({ error: "Invalid API key" }),
    });

    const client = new HevyClient({
      apiKey: "bad-key",
      fetchFn: mockFetch as unknown as typeof fetch,
    });

    await expect(client.getUserInfo()).rejects.toThrow(HevyApiError);
  });

  it("should fetch paginated workouts with clamped pageSize", async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        page: 1,
        page_count: 3,
        workouts: [{ id: "w-1", title: "Leg Day", exercises: [] }],
      }),
    });

    const client = new HevyClient({
      apiKey: "valid-key",
      fetchFn: mockFetch as unknown as typeof fetch,
    });

    const res = await client.getWorkouts(1, 20); // should clamp to 10
    expect(res.workouts.length).toBe(1);
    expect(mockFetch).toHaveBeenCalledWith(
      "https://api.hevyapp.com/v1/workouts?page=1&pageSize=10",
      expect.anything()
    );
  });

  it("should fetch single exercise template by id", async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        exercise_template: {
          id: "tpl-123",
          title: "Incline Dumbbell Press",
          primary_muscle_group: "chest",
          equipment: "dumbbell",
        },
      }),
    });

    const client = new HevyClient({
      apiKey: "valid-key",
      fetchFn: mockFetch as unknown as typeof fetch,
    });

    const tpl = await client.getExerciseTemplate("tpl-123");
    expect(tpl.id).toBe("tpl-123");
    expect(tpl.title).toBe("Incline Dumbbell Press");
    expect(mockFetch).toHaveBeenCalledWith(
      "https://api.hevyapp.com/v1/exercise_templates/tpl-123",
      expect.anything()
    );
  });

  it("should attach timeout signal when timeoutMs is provided", async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ id: "123" }),
    });

    const client = new HevyClient({
      apiKey: "valid-key",
      timeoutMs: 3000,
      fetchFn: mockFetch as unknown as typeof fetch,
    });

    await client.getUserInfo();
    expect(mockFetch).toHaveBeenCalledWith(
      "https://api.hevyapp.com/v1/user/info",
      expect.objectContaining({
        signal: expect.any(AbortSignal),
      })
    );
  });
});

