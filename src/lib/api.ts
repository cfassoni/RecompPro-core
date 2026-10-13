// API Client and Interfaces for Recomp Pro

export interface RecompReport {
  id: number;
  record_id: number;
  filename: string;
  mime_type: string;
  file_size: number;
  uploaded_at: string;
  url: string;
}

export interface User {
  id: number;
  email: string;
  display_name: string | null;
  gender: string | null;
  birthday: string | null;
  height_cm: number | null;
  target_weight_kg: number | null;
  profile_image_path: string | null;
  profile_image_url: string | null;
  preferred_language: string | null;
  email_confirmed: boolean;
  pending_email: string | null;
  created_at: string;
}

export interface IntegrationProfile {
  suid: number;
  nickname: string;
  height: number;
  birthday: string;
  target_weight: number;
  sex: number;
}

export interface IntegrationDevice {
  name: string;
  model: string;
  mac: string;
}

export interface UserIntegrationConfig {
  baseUrl?: string;
  country?: string;
  selectedSuid?: number;
  selectedProfileName?: string;
  skipWeightOnly?: boolean;
  profiles?: IntegrationProfile[];
  devices?: IntegrationDevice[];
}

export interface UserIntegration {
  id: number;
  provider: string;
  accountIdentifier: string;
  status: "connected" | "error" | "disconnected";
  lastSyncedAt: string | null;
  lastSyncError: string | null;
  config: UserIntegrationConfig;
  createdAt: string;
  updatedAt: string;
}

export interface ConnectFitdaysResponse {
  success: boolean;
  activeSuid?: number;
  profiles: IntegrationProfile[];
  devices: IntegrationDevice[];
}

export interface FitdaysSyncResult {
  inserted: number;
  updated: number;
  totalProcessed: number;
}

export interface FitdaysSyncResponse {
  success: boolean;
  result: FitdaysSyncResult;
  lastSyncedAt?: string;
}

export interface HevyStatusResponse {
  connected: boolean;
  integration?: {
    id: number;
    accountIdentifier: string;
    status: string;
    lastSyncedAt: string | null;
    lastSyncError: string | null;
    createdAt: string;
    updatedAt: string;
  };
  config?: {
    webhookToken?: string;
    hevyUserId?: string;
    username?: string;
  };
  webhookUrl?: string;
}

export interface ConnectHevyResponse {
  success: boolean;
  message: string;
  accountIdentifier: string;
  webhookToken: string;
  webhookUrl: string;
  templateCount: number;
}

export interface HevySyncResponse {
  success: boolean;
  message?: string;
  syncedWorkouts: number;
  totalWorkouts: number;
  inserted?: number;
  updated?: number;
  total?: number;
  errors?: string[];
}

export interface WorkoutSet {
  id: number;
  index: number;
  type: string;
  weightKg: number | null;
  reps: number | null;
  rpe: number | null;
  durationSeconds: number | null;
  distanceMeters: number | null;
  customMetric: number | null;
}

export interface WorkoutExercise {
  id: number;
  title: string;
  index: number;
  notes: string | null;
  supersetId: number | null;
  primaryMuscleGroup: string | null;
  equipment: string | null;
  thumbnailUrl: string | null;
  sets: WorkoutSet[];
}

export interface WorkoutItem {
  id: string;
  title: string;
  description: string | null;
  startTime: string;
  endTime: string;
  durationSeconds: number;
  totalVolumeKg: number;
  sessionCaloriesBurned: number;
  epocCaloriesBurned: number;
  totalCaloriesBurned: number;
  avgRpe: number | null;
  source: string;
  exerciseCount: number;
  setCount: number;
  primaryMuscleGroups: string[];
}

export interface WorkoutDetail {
  id: string;
  title: string;
  description: string | null;
  startTime: string;
  endTime: string;
  durationSeconds: number;
  totalVolumeKg: number;
  sessionCaloriesBurned: number;
  epocCaloriesBurned: number;
  totalCaloriesBurned: number;
  avgRpe: number | null;
  source: string;
  exercises: WorkoutExercise[];
  createdAt: string;
  updatedAt: string;
}

export interface MuscleReadinessItem {
  group: string;
  name: string;
  status: "ready" | "recovering" | "exhausted";
  readinessScore: number;
  lastTrainedAt: string | null;
  hoursSinceLastTrained: number | null;
  recommendedRecoveryHours: number;
  remainingRecoveryHours: number;
  lastVolumeKg: number;
  lastSetCount: number;
  lastAvgRpe: number | null;
}

export interface MuscleReadinessResponse {
  muscleGroups: MuscleReadinessItem[];
  overallReadiness: "ready" | "recovering" | "exhausted";
  smartRecommendation: {
    status: string;
    readyGroups: string[];
    recoveringGroups: string[];
    suggestedFocus: string[];
    message: string;
  };
  userProfile: {
    gender: string;
    age: number | null;
    effectiveWeightKg: number;
  };
  muscles?: Record<string, unknown>;
}

export interface WeightHistoryPoint {
  date: string;
  weight: number;
  body_fat_pct: number;
  body_fat_mass: number;
  muscle_mass: number;
  skeletal_muscle_mass: number;
  skeletal_muscle_mass_pct: number;
}

export interface DashboardSummary {
  total_records: number;
  first_record_date: string | null;
  latest_record_date: string | null;
  starting_weight: number | null;
  current_weight: number | null;
  weight_change: number | null;
  starting_body_fat: number | null;
  current_body_fat: number | null;
  body_fat_change: number | null;
  starting_body_fat_mass: number | null;
  current_body_fat_mass: number | null;
  body_fat_mass_change: number | null;
  starting_muscle_mass: number | null;
  current_muscle_mass: number | null;
  muscle_mass_change: number | null;
  starting_skeletal_muscle_mass: number | null;
  current_skeletal_muscle_mass: number | null;
  skeletal_muscle_mass_change: number | null;
  starting_skeletal_muscle_mass_pct: number | null;
  current_skeletal_muscle_mass_pct: number | null;
  skeletal_muscle_mass_pct_change: number | null;
  weight_history: WeightHistoryPoint[];
}

export interface RecompRecord {
  id: number;
  user_id: number;
  date: string;
  starred: boolean;
  weight: number;
  bmi: number;
  body_fat_pct: number;
  subcutaneous_fat_pct: number;
  heart_rate: number | null;
  heart_index: number | null;
  visceral_fat: number;
  body_water_pct: number;
  skeletal_muscle_mass_pct: number;
  muscle_mass: number;
  bone_mass: number;
  protein_pct: number;
  bmr: number;
  metabolic_age: number;
  fat_mass: number;
  moisture_content: number;
  skeletal_muscle_mass: number;
  muscle_rate_pct: number;
  protein_mass: number;
  obesity_score: number;
  fat_free_mass: number;
  smi: number | null;
  body_score: number;
  target_weight: number;
  weight_control: number;
  fat_control: number;
  muscle_control: number;

  // Segmental Fat & Muscle
  right_arm_fat_mass: number | null;
  right_arm_fat_pct: number | null;
  right_arm_fat_level: string | null;
  right_arm_muscle_mass: number | null;
  right_arm_muscle_pct: number | null;
  right_arm_muscle_level: string | null;
  right_arm_impedance_high: number | null;
  right_arm_impedance_low: number | null;

  left_arm_fat_mass: number | null;
  left_arm_fat_pct: number | null;
  left_arm_fat_level: string | null;
  left_arm_muscle_mass: number | null;
  left_arm_muscle_pct: number | null;
  left_arm_muscle_level: string | null;
  left_arm_impedance_high: number | null;
  left_arm_impedance_low: number | null;

  trunk_fat_mass: number | null;
  trunk_fat_pct: number | null;
  trunk_fat_level: string | null;
  trunk_muscle_mass: number | null;
  trunk_muscle_pct: number | null;
  trunk_muscle_level: string | null;
  trunk_impedance_high: number | null;
  trunk_impedance_low: number | null;

  right_leg_fat_mass: number | null;
  right_leg_fat_pct: number | null;
  right_leg_fat_level: string | null;
  right_leg_muscle_mass: number | null;
  right_leg_muscle_pct: number | null;
  right_leg_muscle_level: string | null;
  right_leg_impedance_high: number | null;
  right_leg_impedance_low: number | null;

  left_leg_fat_mass: number | null;
  left_leg_fat_pct: number | null;
  left_leg_fat_level: string | null;
  left_leg_muscle_mass: number | null;
  left_leg_muscle_pct: number | null;
  left_leg_muscle_level: string | null;
  left_leg_impedance_high: number | null;
  left_leg_impedance_low: number | null;
  report: RecompReport | null;
}

export interface UploadResponse {
  message: string;
  inserted: number;
  updated: number;
  total_processed: number;
}

export interface FailedDeletion {
  id: number;
  reason: string;
}

export interface DeleteRecordsResponse {
  deleted: number[];
  failed: FailedDeletion[];
}

export interface DeleteDataResponse {
  message: string;
  deleted_records_count: number;
  deleted_shared_links_count: number;
}

export interface SharedLink {
  id: string;
  token: string;
  description: string;
  has_password: boolean;
  include_attachments: boolean;
  auto_share_starred: boolean;
  expires_at: string | null;
  created_at: string;
  entry_count: number;
  access_count: number;
  last_accessed_at: string | null;
}

export interface SharedLinkPublicMetadata {
  id: string;
  description: string;
  has_password: boolean;
  expires_at: string | null;
  created_at: string;
  owner_name: string | null;
  owner_email: string | null;
  latest_measurement_date: string | null;
}

export interface SharedLinkPublicData {
  dashboard: DashboardSummary;
  entries: RecompRecord[];
}

const TOKEN_KEY = "recomp_pro_token";

export const getAuthToken = (): string | null => {
  if (typeof window === "undefined") return null;
  return localStorage.getItem(TOKEN_KEY);
};

export const setAuthToken = (token: string): void => {
  if (typeof window === "undefined") return;
  localStorage.setItem(TOKEN_KEY, token);
  document.cookie = `${TOKEN_KEY}=${encodeURIComponent(token)}; path=/; max-age=604800; SameSite=Lax`;
};

export const removeAuthToken = (): void => {
  if (typeof window === "undefined") return;
  localStorage.removeItem(TOKEN_KEY);
  document.cookie = `${TOKEN_KEY}=; path=/; max-age=0; SameSite=Lax`;
};

interface FetchOptions extends RequestInit {
  json?: unknown;
  formData?: FormData;
  skipAuthExpire?: boolean;
}

async function apiFetch<T>(endpoint: string, options: FetchOptions = {}): Promise<T> {
  const token = getAuthToken();
  const headers = new Headers(options.headers || {});
  const isPublicEndpoint =
    endpoint.startsWith("/api/shared-links/public/") ||
    endpoint === "/api/users/login";

  if (token && !headers.has("Authorization") && !isPublicEndpoint) {
    headers.set("Authorization", `Bearer ${token}`);
  }

  const fetchOptions: RequestInit = {
    ...options,
    headers,
  };

  if (options.json !== undefined) {
    headers.set("Content-Type", "application/json");
    fetchOptions.body = JSON.stringify(options.json);
  } else if (options.formData) {
    fetchOptions.body = options.formData;
  }

  const response = await fetch(endpoint, fetchOptions);

  if (!response.ok) {
    if (
      response.status === 401 &&
      typeof window !== "undefined" &&
      !options.skipAuthExpire &&
      !isPublicEndpoint
    ) {
      removeAuthToken();
      window.dispatchEvent(new Event("auth-session-expired"));
    }

    let errorMessage = `HTTP error! status: ${response.status}`;
    try {
      const errorData = await response.json();
      errorMessage = errorData.detail || errorMessage;
    } catch {
      // JSON parsing failed, fallback to default error
    }
    throw new Error(errorMessage);
  }

  if (response.status === 204) {
    return {} as T;
  }

  const contentType = response.headers.get("content-type");
  if (contentType && contentType.includes("application/json")) {
    return response.json() as Promise<T>;
  }

  return {} as T;
}

export const api = {
  async register(
    email: string,
    password: string,
    display_name: string,
    gender: string,
    birthday: string,
    height_cm: number,
    target_weight_kg: number,
    preferred_language: string,
    profilePic?: File | null
  ): Promise<User> {
    if (profilePic) {
      const formData = new FormData();
      formData.append("email", email);
      formData.append("password", password);
      formData.append("display_name", display_name);
      formData.append("gender", gender);
      formData.append("birthday", birthday);
      formData.append("height_cm", String(height_cm));
      formData.append("target_weight_kg", String(target_weight_kg));
      formData.append("preferred_language", preferred_language);
      formData.append("file", profilePic);

      return apiFetch<User>("/api/users/register", {
        method: "POST",
        formData,
      });
    }

    return apiFetch<User>("/api/users/register", {
      method: "POST",
      json: {
        email,
        password,
        display_name,
        gender,
        birthday,
        height_cm,
        target_weight_kg,
        preferred_language,
      },
    });
  },

  async login(email: string, password: string): Promise<{ access_token: string; token_type: string }> {
    const data = await apiFetch<{ access_token: string; token_type: string }>("/api/users/login", {
      method: "POST",
      json: {
        email,
        password,
      },
    });

    if (data.access_token) {
      setAuthToken(data.access_token);
    }
    return data;
  },

  async verifyCode(email: string, code: string): Promise<{ message: string; email: string; email_confirmed: boolean }> {
    return apiFetch<{ message: string; email: string; email_confirmed: boolean }>("/api/users/verify-code", {
      method: "POST",
      json: { email, code },
    });
  },

  async verifyEmailLink(email: string, code: string): Promise<{ message: string; email: string; email_confirmed: boolean }> {
    return apiFetch<{ message: string; email: string; email_confirmed: boolean }>(
      `/api/users/verify-email?email=${encodeURIComponent(email)}&code=${encodeURIComponent(code)}`,
      {
        method: "GET",
      }
    );
  },

  async resendVerification(email: string): Promise<{ message: string }> {
    return apiFetch<{ message: string }>("/api/users/resend-verification", {
      method: "POST",
      json: { email },
    });
  },

  async cancelEmailChange(): Promise<{ message: string }> {
    return apiFetch<{ message: string }>("/api/users/cancel-email-change", {
      method: "POST",
    });
  },

  async forgotPassword(email: string): Promise<{ message: string }> {
    return apiFetch<{ message: string }>("/api/users/forgot-password", {
      method: "POST",
      json: { email },
    });
  },

  async validateResetToken(tokenOrCode: string, email?: string): Promise<{ valid: boolean; email?: string }> {
    return apiFetch<{ valid: boolean; email?: string }>("/api/users/validate-reset-token", {
      method: "POST",
      json: { token_or_code: tokenOrCode, token: tokenOrCode, code: tokenOrCode, email },
    });
  },

  async resetPassword(data: { tokenOrCode: string; email?: string; newPassword: string }): Promise<{ access_token: string; token_type: string; message: string }> {
    const res = await apiFetch<{ access_token: string; token_type: string; message: string }>("/api/users/reset-password", {
      method: "POST",
      json: {
        token_or_code: data.tokenOrCode,
        token: data.tokenOrCode,
        code: data.tokenOrCode,
        email: data.email,
        new_password: data.newPassword,
      },
    });
    if (res.access_token) {
      setAuthToken(res.access_token);
    }
    return res;
  },

  async getMe(): Promise<User> {
    return apiFetch<User>("/api/users/me", {
      method: "GET",
    });
  },

  async updateProfile(profileData: Partial<Omit<User, "id" | "created_at" | "profile_image_path" | "profile_image_url">>): Promise<User> {
    return apiFetch<User>("/api/users/profile", {
      method: "PUT",
      json: profileData,
    });
  },

  async uploadProfilePicture(file: File): Promise<User> {
    const formData = new FormData();
    formData.append("file", file);
    return apiFetch<User>("/api/users/profile-picture", {
      method: "POST",
      formData,
    });
  },

  async deleteUserData(password: string): Promise<DeleteDataResponse> {
    return apiFetch<DeleteDataResponse>("/api/users/me/delete-data", {
      method: "POST",
      json: { password },
    });
  },

  async deleteAccount(password: string): Promise<{ message: string }> {
    return apiFetch<{ message: string }>("/api/users/me/delete-account", {
      method: "POST",
      json: { password },
    });
  },

  async changePassword(currentPassword: string, newPassword: string): Promise<{ message: string }> {
    return apiFetch<{ message: string }>("/api/users/change-password", {
      method: "POST",
      json: {
        current_password: currentPassword,
        new_password: newPassword,
      },
    });
  },

  async getSummary(): Promise<DashboardSummary> {
    return apiFetch<DashboardSummary>("/api/records/summary", {
      method: "GET",
    });
  },

  async getRecords(): Promise<RecompRecord[]> {
    return apiFetch<RecompRecord[]>("/api/records", {
      method: "GET",
    });
  },

  async uploadCSV(file: File): Promise<UploadResponse> {
    const formData = new FormData();
    formData.append("file", file);
    return apiFetch<UploadResponse>("/api/records/upload", {
      method: "POST",
      formData,
    });
  },

  async deleteRecords(ids: number[]): Promise<DeleteRecordsResponse> {
    return apiFetch<DeleteRecordsResponse>("/api/records/delete", {
      method: "POST",
      json: { ids, record_ids: ids },
    });
  },

  async uploadReport(recordId: number, file: File): Promise<RecompReport> {
    const formData = new FormData();
    formData.append("file", file);
    return apiFetch<RecompReport>(`/api/records/${recordId}/report`, {
      method: "POST",
      formData,
    });
  },

  async deleteReport(recordId: number): Promise<void> {
    await apiFetch<void>(`/api/records/${recordId}/report`, {
      method: "DELETE",
    });
  },

  async toggleRecordStar(
    recordId: number,
    starred?: boolean
  ): Promise<{ success: boolean; id: number; starred: boolean }> {
    return apiFetch<{ success: boolean; id: number; starred: boolean }>(
      `/api/records/${recordId}/star`,
      {
        method: "POST",
        json: starred !== undefined ? { starred } : undefined,
      }
    );
  },

  async createSharedLink(
    description: string,
    password: string | null,
    include_attachments: boolean,
    expires_at: string | null,
    entry_ids: number[] = [],
    auto_share_starred: boolean = false
  ): Promise<SharedLink> {
    return apiFetch<SharedLink>("/api/shared-links", {
      method: "POST",
      json: {
        description,
        password,
        include_attachments,
        expires_at,
        entry_ids,
        auto_share_starred,
      },
    });
  },

  async getSharedLinks(): Promise<SharedLink[]> {
    return apiFetch<SharedLink[]>("/api/shared-links", {
      method: "GET",
    });
  },

  async getSharedLinkDetails(linkId: string): Promise<SharedLink> {
    return apiFetch<SharedLink>(`/api/shared-links/${linkId}`, {
      method: "GET",
    });
  },

  async updateSharedLink(
    linkId: string,
    updateData: {
      description?: string;
      expires_at?: string | null;
      password?: string;
      clear_password?: boolean;
      auto_share_starred?: boolean;
    }
  ): Promise<SharedLink> {
    return apiFetch<SharedLink>(`/api/shared-links/${linkId}`, {
      method: "PATCH",
      json: updateData,
    });
  },

  async deleteSharedLink(linkId: string): Promise<void> {
    await apiFetch<void>(`/api/shared-links/${linkId}`, {
      method: "DELETE",
    });
  },

  async getPublicSharedLinkMetadata(token: string): Promise<SharedLinkPublicMetadata> {
    return apiFetch<SharedLinkPublicMetadata>(`/api/shared-links/public/${token}`, {
      method: "GET",
      skipAuthExpire: true,
    });
  },

  async verifyPublicSharedLinkPassword(token: string, password: string): Promise<{ guest_token: string }> {
    return apiFetch<{ guest_token: string }>(`/api/shared-links/public/${token}/verify`, {
      method: "POST",
      json: { password },
      skipAuthExpire: true,
    });
  },

  async getPublicSharedLinkData(token: string, guestToken?: string | null): Promise<SharedLinkPublicData> {
    const headers: Record<string, string> = {};
    if (guestToken) {
      headers["Authorization"] = `Bearer ${guestToken}`;
    }
    return apiFetch<SharedLinkPublicData>(`/api/shared-links/public/${token}/data`, {
      method: "GET",
      headers,
      skipAuthExpire: true,
    });
  },

  // ---------------------------------------------------------------------------
  // External Provider Integrations
  // ---------------------------------------------------------------------------
  async getIntegrations(): Promise<UserIntegration[]> {
    return apiFetch<UserIntegration[]>("/api/integrations", {
      method: "GET",
    });
  },

  async connectFitdays(data: {
    email: string;
    password: string;
    country?: string;
    region?: string;
  }): Promise<ConnectFitdaysResponse> {
    return apiFetch<ConnectFitdaysResponse>("/api/integrations/fitdays/connect", {
      method: "POST",
      json: data,
    });
  },

  async selectFitdaysProfile(
    suid: number,
    syncNow = true
  ): Promise<{ success: boolean; selectedSuid: number; selectedProfileName?: string; result: FitdaysSyncResult }> {
    return apiFetch<{ success: boolean; selectedSuid: number; selectedProfileName?: string; result: FitdaysSyncResult }>(
      "/api/integrations/fitdays/select-profile",
      {
        method: "POST",
        json: { suid, syncNow },
      }
    );
  },

  async syncFitdays(forceFull = false): Promise<FitdaysSyncResponse> {
    return apiFetch<FitdaysSyncResponse>("/api/integrations/fitdays/sync", {
      method: "POST",
      json: { forceFull },
    });
  },

  async disconnectFitdays(): Promise<{ success: boolean; message: string }> {
    return apiFetch<{ success: boolean; message: string }>("/api/integrations/fitdays", {
      method: "DELETE",
    });
  },

  async updateFitdaysConfig(config: {
    skipWeightOnly?: boolean;
  }): Promise<{ success: boolean; config: UserIntegrationConfig }> {
    return apiFetch<{ success: boolean; config: UserIntegrationConfig }>("/api/integrations/fitdays", {
      method: "PATCH",
      json: config,
    });
  },

  // ---------------------------------------------------------------------------
  // Hevy Strength Integration & Workouts
  // ---------------------------------------------------------------------------
  async connectHevy(apiKey: string): Promise<ConnectHevyResponse> {
    return apiFetch<ConnectHevyResponse>("/api/integrations/hevy/connect", {
      method: "POST",
      json: { apiKey },
    });
  },

  async getHevyStatus(): Promise<HevyStatusResponse> {
    return apiFetch<HevyStatusResponse>("/api/integrations/hevy", {
      method: "GET",
    });
  },

  async syncHevy(page = 1, pageSize = 10): Promise<HevySyncResponse> {
    return apiFetch<HevySyncResponse>("/api/integrations/hevy/sync", {
      method: "POST",
      json: { page, pageSize },
    });
  },

  async regenerateHevyWebhook(): Promise<{ success: boolean; webhookToken: string; webhookUrl: string }> {
    return apiFetch<{ success: boolean; webhookToken: string; webhookUrl: string }>(
      "/api/integrations/hevy/regenerate-webhook",
      {
        method: "POST",
      }
    );
  },

  async disconnectHevy(deleteData = false): Promise<{ success: boolean; message: string }> {
    return apiFetch<{ success: boolean; message: string }>("/api/integrations/hevy", {
      method: "DELETE",
      json: { deleteData },
    });
  },

  async getWorkouts(
    page = 1,
    pageSize = 20
  ): Promise<{
    workouts: WorkoutItem[];
    total: number;
    page: number;
    pageSize: number;
    hasMore: boolean;
  }> {
    return apiFetch<{
      workouts: WorkoutItem[];
      total: number;
      page: number;
      pageSize: number;
      hasMore: boolean;
    }>(`/api/workouts?page=${page}&pageSize=${pageSize}`, {
      method: "GET",
    });
  },

  async getWorkoutDetails(id: string): Promise<WorkoutDetail> {
    return apiFetch<WorkoutDetail>(`/api/workouts/${id}`, {
      method: "GET",
    });
  },

  async getMuscleReadiness(): Promise<MuscleReadinessResponse> {
    return apiFetch<MuscleReadinessResponse>("/api/workouts/readiness", {
      method: "GET",
    });
  },
};
