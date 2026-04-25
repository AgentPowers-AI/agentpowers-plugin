import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { apiGet, apiPost, APIError, NetworkError, formatAPIError } from "../api-client.js";

const mockFetch = vi.fn();

beforeEach(() => {
  vi.stubGlobal("fetch", mockFetch);
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

describe("apiGet", () => {
  it("builds the correct URL with base and path", async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      json: async () => ({ data: "ok" }),
    });

    await apiGet("/v1/skills");

    expect(mockFetch).toHaveBeenCalledWith(
      expect.stringContaining("/v1/skills"),
      expect.objectContaining({
        headers: expect.objectContaining({ Accept: "application/json" }),
      }),
    );
  });

  it("appends query params and skips undefined values", async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      json: async () => ({ results: [] }),
    });

    await apiGet("/v1/search", {
      q: "testing",
      category: undefined,
      limit: 5,
    });

    const calledUrl = mockFetch.mock.calls[0][0] as string;
    const url = new URL(calledUrl);
    expect(url.searchParams.get("q")).toBe("testing");
    expect(url.searchParams.get("limit")).toBe("5");
    expect(url.searchParams.has("category")).toBe(false);
  });

  it("includes auth header when token is provided", async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      json: async () => ({}),
    });

    await apiGet("/v1/purchases/123/status", undefined, "my-token");

    const headers = mockFetch.mock.calls[0][1].headers as Record<
      string,
      string
    >;
    expect(headers["Authorization"]).toBe("Bearer my-token");
  });

  it("throws APIError on non-ok response", async () => {
    mockFetch.mockResolvedValue({
      ok: false,
      status: 404,
      text: async () => "Not Found",
    });

    await expect(apiGet("/v1/skills/missing")).rejects.toThrow(APIError);
    await expect(apiGet("/v1/skills/missing")).rejects.toMatchObject({
      statusCode: 404,
    });
  });

  it("parses JSON error detail from response body", async () => {
    mockFetch.mockResolvedValue({
      ok: false,
      status: 422,
      text: async () => JSON.stringify({ detail: "Price must be >= $3.00" }),
    });

    await expect(apiGet("/v1/skills")).rejects.toMatchObject({
      message: "Price must be >= $3.00",
      statusCode: 422,
    });
  });

  it("parses nested JSON error detail with code", async () => {
    mockFetch.mockResolvedValue({
      ok: false,
      status: 409,
      text: async () =>
        JSON.stringify({ detail: { detail: "Already claimed", code: "ALREADY_CLAIMED" } }),
    });

    await expect(apiGet("/v1/skills/x/claim")).rejects.toMatchObject({
      message: "Already claimed",
      statusCode: 409,
      code: "ALREADY_CLAIMED",
    });
  });

  it("uses default base URL when env var is not set", async () => {
    vi.unstubAllEnvs();

    mockFetch.mockResolvedValue({
      ok: true,
      json: async () => ({}),
    });

    await apiGet("/v1/skills");

    const calledUrl = mockFetch.mock.calls[0][0] as string;
    expect(calledUrl).toMatch(/^https:\/\/api\.agentpowers\.ai/);
  });

  it("env var fallback is handled at module init (API_BASE_URL constant)", async () => {
    // API_BASE_URL is evaluated at import time from process.env.
    // Runtime env changes don't affect it. This test verifies the default URL is used.
    mockFetch.mockResolvedValue({
      ok: true,
      json: async () => ({}),
    });

    await apiGet("/v1/skills");

    const calledUrl = mockFetch.mock.calls[0][0] as string;
    expect(calledUrl).toMatch(/^https:\/\/api\.agentpowers\.ai/);
  });

  it("throws NetworkError on connection failure", async () => {
    mockFetch.mockRejectedValue(new TypeError("fetch failed"));

    await expect(apiGet("/v1/skills")).rejects.toThrow(NetworkError);
    await expect(apiGet("/v1/skills")).rejects.toMatchObject({
      message: "Could not connect to AgentPowers API. Check your network connection.",
    });
  });

  it("throws NetworkError on timeout", async () => {
    const timeoutErr = new DOMException("The operation was aborted", "TimeoutError");
    mockFetch.mockRejectedValue(timeoutErr);

    await expect(apiGet("/v1/skills")).rejects.toThrow(NetworkError);
    await expect(apiGet("/v1/skills")).rejects.toMatchObject({
      message: "Request timed out. The API may be temporarily unavailable.",
    });
  });
});

describe("apiPost", () => {
  it("sends POST request with JSON body", async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      json: async () => ({ id: "purchase-1" }),
    });

    const result = await apiPost("/v1/checkout", {
      skill_slug: "test-skill",
    });

    expect(mockFetch).toHaveBeenCalledWith(
      expect.stringContaining("/v1/checkout"),
      expect.objectContaining({
        method: "POST",
        headers: expect.objectContaining({
          "Content-Type": "application/json",
        }),
        body: JSON.stringify({ skill_slug: "test-skill" }),
      }),
    );
    expect(result).toEqual({ id: "purchase-1" });
  });

  it("sends POST without body when not provided", async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      json: async () => ({}),
    });

    await apiPost("/v1/some-action");

    const options = mockFetch.mock.calls[0][1] as RequestInit;
    expect(options.body).toBeUndefined();
  });

  it("includes auth header when token is provided", async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      json: async () => ({}),
    });

    await apiPost("/v1/checkout", { slug: "x" }, "secret-token");

    const headers = mockFetch.mock.calls[0][1].headers as Record<
      string,
      string
    >;
    expect(headers["Authorization"]).toBe("Bearer secret-token");
  });

  it("throws APIError on failure", async () => {
    mockFetch.mockResolvedValue({
      ok: false,
      status: 400,
      text: async () => "Bad Request",
    });

    await expect(apiPost("/v1/checkout", {})).rejects.toThrow(APIError);
    await expect(apiPost("/v1/checkout", {})).rejects.toMatchObject({
      statusCode: 400,
    });
  });

  it("throws NetworkError on connection failure", async () => {
    mockFetch.mockRejectedValue(new TypeError("fetch failed"));

    await expect(apiPost("/v1/checkout", {})).rejects.toThrow(NetworkError);
  });

  it("throws NetworkError on timeout", async () => {
    const timeoutErr = new DOMException("The operation was aborted", "TimeoutError");
    mockFetch.mockRejectedValue(timeoutErr);

    await expect(apiPost("/v1/checkout", {})).rejects.toThrow(NetworkError);
  });
});

describe("formatAPIError", () => {
  it("maps 401 to login message", () => {
    const err = new APIError("Unauthorized", 401);
    expect(formatAPIError(err)).toBe("Not logged in. Run `npx @agentpowers/cli login` first.");
  });

  it("maps 403 to access denied", () => {
    const err = new APIError("Forbidden", 403);
    expect(formatAPIError(err)).toBe("Access denied. You may need to purchase this skill first.");
  });

  it("maps 404 to not found", () => {
    const err = new APIError("Not found", 404);
    expect(formatAPIError(err)).toBe("Not found. Check the slug and try again.");
  });

  it("maps 409 to conflict with original message", () => {
    const err = new APIError("Already claimed", 409);
    expect(formatAPIError(err)).toBe("Already claimed");
  });

  it("maps 422 to invalid request", () => {
    const err = new APIError("Price must be >= $3.00", 422);
    expect(formatAPIError(err)).toBe("Invalid request: Price must be >= $3.00");
  });

  it("maps 429 to rate limit", () => {
    const err = new APIError("Too Many Requests", 429);
    expect(formatAPIError(err)).toBe("Too many requests. Please wait a moment and try again.");
  });

  it("falls back to message for unknown status codes", () => {
    const err = new APIError("Internal Server Error", 500);
    expect(formatAPIError(err)).toBe("Internal Server Error");
  });
});
