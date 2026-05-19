/**
 * Additional api-client coverage tests — targets uncovered lines:
 * - recordInstallation fire-and-forget (lines 138-154)
 * - safeFetch re-throw of non-TypeError/non-DOMException errors (lines 95-96)
 * - apiGet/apiPost path validation
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  apiGet,
  apiPost,
  recordInstallation,
  APIError,
  NetworkError,
} from "../api-client.js";

const mockFetch = vi.fn();

beforeEach(() => {
  vi.stubGlobal("fetch", mockFetch);
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

// ---------------------------------------------------------------------------
// recordInstallation — fire-and-forget
// ---------------------------------------------------------------------------

describe("recordInstallation", () => {
  it("calls POST /v1/installations with correct body", async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      json: async () => ({ id: 1 }),
    });

    await recordInstallation("my-skill", "mcp", "agentpowers", "host1", "token123");

    expect(mockFetch).toHaveBeenCalledWith(
      expect.stringContaining("/v1/installations"),
      expect.objectContaining({
        method: "POST",
        headers: expect.objectContaining({
          Authorization: "Bearer token123",
        }),
        body: JSON.stringify({
          source_slug: "my-skill",
          platform: "mcp",
          source: "agentpowers",
          hostname: "host1",
        }),
      }),
    );
  });

  it("sends request without auth header when token is null", async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      json: async () => ({ id: 1 }),
    });

    await recordInstallation("my-skill", "mcp", "agentpowers", "host1", null);

    const headers = mockFetch.mock.calls[0][1].headers as Record<string, string>;
    expect(headers).not.toHaveProperty("Authorization");
  });

  it("swallows network errors silently", async () => {
    mockFetch.mockRejectedValue(new TypeError("fetch failed"));

    // Should not throw
    await expect(
      recordInstallation("my-skill", "mcp", "agentpowers", "host1"),
    ).resolves.toBeUndefined();
  });

  it("swallows API errors silently", async () => {
    mockFetch.mockResolvedValue({
      ok: false,
      status: 500,
      text: async () => "Internal Server Error",
    });

    // Should not throw
    await expect(
      recordInstallation("my-skill", "mcp", "agentpowers", "host1"),
    ).resolves.toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// safeFetch — re-throw of unexpected errors
// ---------------------------------------------------------------------------

describe("safeFetch — unexpected error re-throw", () => {
  it("re-throws errors that are not TypeError or DOMException", async () => {
    const customError = new RangeError("unexpected");
    mockFetch.mockRejectedValue(customError);

    await expect(apiGet("/v1/skills")).rejects.toThrow(RangeError);
    await expect(apiGet("/v1/skills")).rejects.toThrow("unexpected");
  });
});

// ---------------------------------------------------------------------------
// Path validation
// ---------------------------------------------------------------------------

describe("apiGet/apiPost — path validation", () => {
  it("apiGet throws on path without leading slash", async () => {
    await expect(apiGet("v1/skills")).rejects.toThrow(
      /must start with "\/"/,
    );
  });

  it("apiPost throws on path without leading slash", async () => {
    await expect(apiPost("v1/checkout", {})).rejects.toThrow(
      /must start with "\/"/,
    );
  });
});
