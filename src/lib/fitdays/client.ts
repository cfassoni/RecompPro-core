import {
  FitDaysClient,
  FitDaysApiError,
  hashPassword,
  parseSyncFromServerData,
} from "fitdays-api";
import type {
  ClientOptions,
  Session,
  SyncFromServerData,
  SyncFromServerDataRaw,
  ApiResponse,
} from "fitdays-api";

export interface RecompFitdaysClientOptions extends ClientOptions {
  onBaseUrlChanged?: (newBaseUrl: string) => void;
}

export class RecompFitdaysClient extends FitDaysClient {
  private readonly onBaseUrlChangedCallback?: (newBaseUrl: string) => void;

  constructor(opts: RecompFitdaysClientOptions = {}) {
    super(opts);
    this.onBaseUrlChangedCallback = opts.onBaseUrlChanged;

    const baseSyncAll = this.syncAll;
    this.syncAll = async (): Promise<ApiResponse<SyncFromServerData>> => {
      const previousBaseUrl = this.baseUrl;
      const res = await baseSyncAll();
      if (this.baseUrl !== previousBaseUrl && this.onBaseUrlChangedCallback) {
        this.onBaseUrlChangedCallback(this.baseUrl);
      }
      return res;
    };
  }

  /**
   * Performs unattended login using the pre-hashed MD5(MD5(password + "hx")) digest,
   * avoiding the need to retain or re-transmit the user's plaintext password.
   */
  public loginWithPasswordHash = async (
    email: string,
    passwordHash: string
  ): Promise<Session> => {
    const res = await this.request<{
      token?: string;
      refresh_token?: string;
      uid?: number;
      account?: {
        token?: string;
        uid?: number;
      };
    }>("api/users/login", {
      email,
      password: passwordHash,
    });

    const data = res.data;
    const token = data.token ?? data.account?.token;
    const uid = data.account?.uid ?? data.uid;

    if (!token || uid === undefined) {
      throw new FitDaysApiError(res.code, res, "Login response missing token or uid");
    }

    this.session = {
      refreshToken: data.refresh_token ?? "",
      token,
      uid,
    };

    return this.session;
  };

  /**
   * Helper that logs in with plaintext password, returning both the session
   * and the uppercase double-MD5 digest for encrypted storage.
   */
  public loginWithPlainPassword = async (
    email: string,
    plainPassword: string
  ): Promise<{ session: Session; passwordHash: string }> => {
    const passwordHash = hashPassword(plainPassword);
    const session = await this.loginWithPasswordHash(email, passwordHash);
    return { session, passwordHash };
  };

  /**
   * Incremental synchronization endpoint (POST /api/sync/syncIncrements).
   * Pulls measurements and metadata created or modified since `syncTime` (Unix seconds).
   */
  public syncIncrements = async (
    syncTime: number
  ): Promise<ApiResponse<SyncFromServerData>> => {
    if (!this.session) {
      throw new Error("Not logged in: session must be initialized");
    }

    const previousBaseUrl = this.baseUrl;
    const raw = await this.request<SyncFromServerDataRaw>("api/sync/syncIncrements", {
      sync_time: syncTime,
    });

    if (this.baseUrl !== previousBaseUrl && this.onBaseUrlChangedCallback) {
      this.onBaseUrlChangedCallback(this.baseUrl);
    }

    return {
      ...raw,
      data: parseSyncFromServerData(raw.data),
    };
  };
}
