/**
 * Hevy Public REST API Client (https://api.hevyapp.com/docs/)
 * 100% Pure TypeScript Node.js 22+ with zero external runtime dependencies.
 */

export interface HevyUserInfo {
  id?: string;
  email?: string;
  username?: string;
  [key: string]: unknown;
}

export interface HevySet {
  index: number;
  type: string; // "normal" | "warmup" | "dropset" | "failure"
  weight_kg: number | null;
  reps: number | null;
  distance_meters: number | null;
  duration_seconds: number | null;
  rpe: number | null;
  custom_metric: number | null;
}

export interface HevyWorkoutExercise {
  index: number;
  title: string;
  notes: string | null;
  exercise_template_id: string;
  supersets_id?: number | null;
  superset_id?: number | null;
  sets: HevySet[];
}

export interface HevyWorkout {
  id: string;
  title: string;
  description: string | null;
  start_time: string; // ISO 8601
  end_time: string; // ISO 8601
  created_at: string;
  updated_at: string;
  routine_id: string | null;
  exercises: HevyWorkoutExercise[];
}

export interface HevyPaginatedWorkouts {
  page: number;
  page_count: number;
  workouts: HevyWorkout[];
}

export interface HevyExerciseTemplate {
  id: string;
  title: string;
  type?: string;
  primary_muscle_group?: string;
  secondary_muscle_groups?: string[];
  equipment?: string;
  is_custom?: boolean;
  thumbnail_url?: string | null;
}

export interface HevyPaginatedExerciseTemplates {
  page: number;
  page_count: number;
  exercise_templates: HevyExerciseTemplate[];
}

export interface HevyWorkoutEvent {
  type: "updated" | "deleted";
  workout?: HevyWorkout;
  id?: string;
  deleted_at?: string;
}

export interface HevyPaginatedWorkoutEvents {
  page: number;
  page_count: number;
  events: HevyWorkoutEvent[];
}

export interface HevyClientOptions {
  apiKey: string;
  baseUrl?: string;
  fetchFn?: typeof fetch;
  maxRetries?: number;
}

export class HevyApiError extends Error {
  public readonly status: number;
  public readonly responseBody?: unknown;

  constructor(message: string, status: number, responseBody?: unknown) {
    super(message);
    this.name = "HevyApiError";
    this.status = status;
    this.responseBody = responseBody;
  }
}

export class HevyClient {
  private readonly apiKey: string;
  private readonly baseUrl: string;
  private readonly fetchFn: typeof fetch;
  private readonly maxRetries: number;

  constructor(options: HevyClientOptions) {
    if (!options.apiKey) {
      throw new Error("HevyClient requires an API key");
    }
    this.apiKey = options.apiKey.trim();
    this.baseUrl = (options.baseUrl || "https://api.hevyapp.com/v1").replace(/\/+$/, "");
    this.fetchFn = options.fetchFn || globalThis.fetch;
    this.maxRetries = options.maxRetries ?? 3;
  }

  private async request<T>(endpoint: string, init?: RequestInit): Promise<T> {
    const url = `${this.baseUrl}${endpoint.startsWith("/") ? "" : "/"}${endpoint}`;
    let attempt = 0;

    while (attempt <= this.maxRetries) {
      attempt++;
      try {
        const res = await this.fetchFn(url, {
          ...init,
          headers: {
            "Content-Type": "application/json",
            "api-key": this.apiKey,
            ...init?.headers,
          },
        });

        if (res.status === 429) {
          // Rate limit encountered
          if (attempt <= this.maxRetries) {
            const backoffMs = Math.min(1000 * Math.pow(2, attempt), 8000);
            await new Promise((resolve) => setTimeout(resolve, backoffMs));
            continue;
          }
          throw new HevyApiError("Hevy API rate limit exceeded (429)", 429);
        }

        if (!res.ok) {
          let errData: unknown;
          try {
            errData = await res.json();
          } catch {
            errData = await res.text();
          }
          throw new HevyApiError(
            `Hevy API error (${res.status}): ${typeof errData === "string" ? errData : JSON.stringify(errData)}`,
            res.status,
            errData
          );
        }

        return (await res.json()) as T;
      } catch (err: unknown) {
        if (err instanceof HevyApiError) {
          throw err;
        }
        if (attempt <= this.maxRetries) {
          await new Promise((resolve) => setTimeout(resolve, 500 * attempt));
          continue;
        }
        throw new HevyApiError(
          `Network error connecting to Hevy API: ${err instanceof Error ? err.message : String(err)}`,
          0
        );
      }
    }

    throw new HevyApiError("Hevy request failed after maximum retries", 0);
  }

  /**
   * Verifies the API Key by fetching basic account info.
   */
  public async getUserInfo(): Promise<HevyUserInfo> {
    return this.request<HevyUserInfo>("/user/info");
  }

  /**
   * Retrieves paginated workouts (max pageSize is 10).
   */
  public async getWorkouts(page = 1, pageSize = 10): Promise<HevyPaginatedWorkouts> {
    const clampedSize = Math.min(10, Math.max(1, pageSize));
    return this.request<HevyPaginatedWorkouts>(`/workouts?page=${page}&pageSize=${clampedSize}`);
  }

  /**
   * Retrieves single workout by its UUID.
   */
  public async getWorkout(workoutId: string): Promise<HevyWorkout> {
    const res = await this.request<HevyWorkout | { workout: HevyWorkout }>(
      `/workouts/${encodeURIComponent(workoutId)}`
    );
    if ("workout" in res && res.workout) {
      return res.workout;
    }
    return res as HevyWorkout;
  }

  /**
   * Retrieves paginated workout events since a specific ISO date.
   */
  public async getWorkoutEvents(
    since = "1970-01-01T00:00:00Z",
    page = 1,
    pageSize = 10
  ): Promise<HevyPaginatedWorkoutEvents> {
    const clampedSize = Math.min(10, Math.max(1, pageSize));
    return this.request<HevyPaginatedWorkoutEvents>(
      `/workouts/events?since=${encodeURIComponent(since)}&page=${page}&pageSize=${clampedSize}`
    );
  }

  /**
   * Retrieves paginated exercise templates (max pageSize is 100).
   */
  public async getExerciseTemplates(
    page = 1,
    pageSize = 100
  ): Promise<HevyPaginatedExerciseTemplates> {
    const clampedSize = Math.min(100, Math.max(1, pageSize));
    return this.request<HevyPaginatedExerciseTemplates>(
      `/exercise_templates?page=${page}&pageSize=${clampedSize}`
    );
  }
}
