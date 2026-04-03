const DEFAULT_BASE = "https://api.agentpowers.ai";
const TIMEOUT_MS = 30_000;

function getBaseUrl(): string {
  // Prefer AGENTPOWERS_API_URL (CLI standard), fall back to AP_API_BASE (legacy)
  return (
    process.env.AGENTPOWERS_API_URL ??
    process.env.AP_API_BASE ??
    DEFAULT_BASE
  );
}

/** Normalize to ensure the base always has /v1 suffix. */
function normalizeApiBase(raw: string): string {
  const base = raw.replace(/\/+$/, "");
  return base.endsWith("/v1") ? base : `${base}/v1`;
}

/** The full /v1 API base URL. */
export const API_BASE = normalizeApiBase(
  process.env.AGENTPOWERS_API_BASE ??
  process.env.PUBLIC_API_URL ??
  `${getBaseUrl()}/v1`,
);

/** The root API URL without /v1 (for health endpoint, etc). */
export const API_ROOT = API_BASE.replace(/\/v1$/, "");

export class APIError extends Error {
  constructor(
    message: string,
    public readonly statusCode: number,
    public readonly code?: string,
  ) {
    super(message);
    this.name = "APIError";
  }
}

export class NetworkError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "NetworkError";
  }
}

/**
 * Extract a human-readable message from the API response body.
 * API returns JSON like {"detail": "message"} or {"detail": {"detail": "msg", "code": "CODE"}}.
 */
function parseErrorBody(body: string): { message: string; code?: string } {
  try {
    const json = JSON.parse(body);
    if (typeof json.detail === "string") {
      return { message: json.detail };
    }
    if (json.detail && typeof json.detail === "object") {
      return {
        message: json.detail.detail ?? body,
        code: json.detail.code,
      };
    }
  } catch {
    // Not JSON — use raw body
  }
  return { message: body };
}

/**
 * Map HTTP status codes to user-friendly messages (CLI parity).
 */
export function formatAPIError(error: APIError): string {
  switch (error.statusCode) {
    case 401:
      return "Not logged in. Run `ap login` in your terminal first.";
    case 403:
      return "Access denied. You may need to purchase this skill first.";
    case 404:
      return "Not found. Check the slug and try again.";
    case 409:
      return error.message || "Conflict — this action has already been taken.";
    case 422:
      return `Invalid request: ${error.message}`;
    case 429:
      return "Too many requests. Please wait a moment and try again.";
    default:
      return error.message || `API error (${error.statusCode})`;
  }
}

async function safeFetch(
  url: string,
  init?: RequestInit,
): Promise<Response> {
  try {
    return await fetch(url, {
      ...init,
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
  } catch (err: unknown) {
    if (err instanceof DOMException && err.name === "TimeoutError") {
      throw new NetworkError(
        "Request timed out. The API may be temporarily unavailable.",
      );
    }
    if (err instanceof TypeError) {
      throw new NetworkError(
        "Could not connect to AgentPowers API. Check your network connection.",
      );
    }
    throw err;
  }
}

export async function apiGet<T = unknown>(
  path: string,
  params?: Record<string, string | number | undefined>,
  auth?: string | null,
): Promise<T> {
  if (!path.startsWith("/")) {
    throw new Error(`Invalid API path: "${path}" — must start with "/".`);
  }
  const url = new URL(path, getBaseUrl());
  if (params) {
    for (const [key, value] of Object.entries(params)) {
      if (value !== undefined) {
        url.searchParams.set(key, String(value));
      }
    }
  }

  const headers: Record<string, string> = {
    Accept: "application/json",
  };
  if (auth) {
    headers["Authorization"] = `Bearer ${auth}`;
  }

  const response = await safeFetch(url.toString(), { headers });

  if (!response.ok) {
    const body = await response.text();
    const { message, code } = parseErrorBody(body);
    throw new APIError(message, response.status, code);
  }

  return (await response.json()) as T;
}

/**
 * Fire-and-forget installation tracking. Never rejects — caller must not await errors.
 * Sends the auth token if provided; omits it otherwise.
 */
export async function recordInstallation(
  sourceSlug: string,
  platform: string,
  source: string,
  hostname: string,
  auth?: string | null,
): Promise<void> {
  try {
    await apiPost(
      "/v1/installations",
      { source_slug: sourceSlug, platform, source, hostname },
      auth,
    );
  } catch {
    // Swallow all errors — tracking must not break install flow
  }
}

export async function apiPost<T = unknown>(
  path: string,
  body?: unknown,
  auth?: string | null,
): Promise<T> {
  if (!path.startsWith("/")) {
    throw new Error(`Invalid API path: "${path}" — must start with "/".`);
  }
  const url = new URL(path, getBaseUrl());

  const headers: Record<string, string> = {
    Accept: "application/json",
    "Content-Type": "application/json",
  };
  if (auth) {
    headers["Authorization"] = `Bearer ${auth}`;
  }

  const response = await safeFetch(url.toString(), {
    method: "POST",
    headers,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });

  if (!response.ok) {
    const text = await response.text();
    const { message, code } = parseErrorBody(text);
    throw new APIError(message, response.status, code);
  }

  return (await response.json()) as T;
}

/**
 * GET request against the root API (without /v1 prefix).
 * Used for health endpoint, etc.
 */
export async function apiRoot<T = unknown>(
  path: string,
  auth?: string | null,
): Promise<T> {
  const url = `${API_ROOT}${path.startsWith("/") ? path : `/${path}`}`;

  const headers: Record<string, string> = { Accept: "application/json" };
  if (auth) {
    headers["Authorization"] = `Bearer ${auth}`;
  }

  const response = await safeFetch(url, { headers });

  if (!response.ok) {
    const body = await response.text();
    const { message, code } = parseErrorBody(body);
    throw new APIError(message, response.status, code);
  }

  return (await response.json()) as T;
}

/**
 * Fetch JSON from an arbitrary URL (for OpenAPI spec, npm registry, etc).
 */
export async function fetchUrl<T = unknown>(url: string): Promise<T> {
  const response = await safeFetch(url, {
    headers: { Accept: "application/json" },
  });

  if (!response.ok) {
    const body = await response.text();
    throw new APIError(body, response.status);
  }

  return (await response.json()) as T;
}
