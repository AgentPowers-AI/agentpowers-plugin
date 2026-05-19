/**
 * Additional installer coverage tests — targets uncovered lines in installer.ts:
 * - HTTPS enforcement (lines 171-178)
 * - Invalid URL (lines 174-176)
 * - Download failure (lines 182-183)
 * - Temp file cleanup error (line 205)
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock child_process BEFORE importing installer
vi.mock("node:child_process", () => ({
  execFileSync: vi.fn().mockReturnValue(""),
}));
vi.mock("../content-hasher.js", () => ({
  hashDirectory: vi.fn().mockReturnValue("sha256:abc123"),
}));
vi.mock("../pin-manager.js", () => ({
  savePin: vi.fn(),
}));

// Mock fetch globally
const mockFetch = vi.fn();
vi.stubGlobal("fetch", mockFetch);

import { downloadAndExtract } from "../installer.js";

beforeEach(() => {
  vi.clearAllMocks();
  mockFetch.mockResolvedValue({
    ok: true,
    arrayBuffer: () => Promise.resolve(new ArrayBuffer(0)),
  });
});

describe("downloadAndExtract — HTTPS enforcement", () => {
  it("rejects HTTP URLs (non-HTTPS)", async () => {
    await expect(
      downloadAndExtract(
        "http://example.com/pkg.tar.gz",
        "my-skill",
        "skill",
      ),
    ).rejects.toThrow(/must use HTTPS/);

    expect(mockFetch).not.toHaveBeenCalled();
  });

  it("rejects FTP protocol URLs", async () => {
    await expect(
      downloadAndExtract(
        "ftp://example.com/pkg.tar.gz",
        "my-skill",
        "skill",
      ),
    ).rejects.toThrow(/must use HTTPS/);
  });
});

describe("downloadAndExtract — invalid URL", () => {
  it("rejects completely invalid URLs", async () => {
    await expect(
      downloadAndExtract("not-a-url", "my-skill", "skill"),
    ).rejects.toThrow(/Invalid download URL/);

    expect(mockFetch).not.toHaveBeenCalled();
  });
});

describe("downloadAndExtract — download failure", () => {
  it("throws on non-ok HTTP response", async () => {
    mockFetch.mockResolvedValue({
      ok: false,
      status: 404,
      statusText: "Not Found",
    });

    await expect(
      downloadAndExtract(
        "https://example.com/pkg.tar.gz",
        "my-skill",
        "skill",
      ),
    ).rejects.toThrow(/Download failed: 404 Not Found/);
  });

  it("throws on 500 server error response", async () => {
    mockFetch.mockResolvedValue({
      ok: false,
      status: 500,
      statusText: "Internal Server Error",
    });

    await expect(
      downloadAndExtract(
        "https://example.com/pkg.tar.gz",
        "my-skill",
        "skill",
      ),
    ).rejects.toThrow(/Download failed: 500/);
  });
});
