/**
 * Typed domain service error carrying an HTTP-compatible status code and machine-readable error code.
 */
export class ServiceError extends Error {
  readonly status: number;
  readonly code: string;

  constructor(message: string, status = 400, code = "SERVICE_ERROR") {
    super(message);
    this.name = "ServiceError";
    this.status = status;
    this.code = code;
  }
}

export function isServiceError(err: unknown): err is ServiceError {
  return err instanceof ServiceError;
}

/**
 * Parses an ISO date or YYYY-MM-DD boundary string into a UTC Date bound.
 */
export function parseDateRangeBound(raw: string, bound: "start" | "end"): Date {
  const trimmed = raw.trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) {
    const suffix = bound === "start" ? "T00:00:00.000Z" : "T23:59:59.999Z";
    const parsed = new Date(`${trimmed}${suffix}`);
    if (!Number.isNaN(parsed.getTime())) {
      return parsed;
    }
  }

  const parsed = new Date(trimmed);
  if (Number.isNaN(parsed.getTime())) {
    throw new ServiceError("Invalid ISO date format", 400, "INVALID_DATE");
  }
  return parsed;
}
