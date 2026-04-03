import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { mkdirSync, writeFileSync, rmSync, mkdtempSync, existsSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { hashDirectory } from "../content-hasher.js";

// Mock api-client before imports
vi.mock("../api-client.js", () => ({
  apiGet: vi.fn(),
  apiPost: vi.fn(),
  apiRoot: vi.fn(),
  fetchUrl: vi.fn(),
  API_BASE: "https://api.agentpowers.ai/v1",
  API_ROOT: "https://api.agentpowers.ai",
  recordInstallation: vi.fn().mockResolvedValue(undefined),
  APIError: class extends Error {
    statusCode: number;
    constructor(msg: string, statusCode: number) {
      super(msg);
      this.name = "APIError";
      this.statusCode = statusCode;
    }
  },
  formatAPIError: vi.fn((err: { message: string }) => err.message),
}));
vi.mock("../auth.js", () => ({ loadAuthToken: vi.fn() }));
vi.mock("../installer.js", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../installer.js")>();
  return {
    downloadAndExtract: vi.fn(),
    getInstallDir: vi.fn(),
    validateSlug: actual.validateSlug,
  };
});
vi.mock("../cli-runner.js", () => ({
  ensureApAvailable: vi.fn().mockResolvedValue(undefined),
  runAp: vi.fn().mockResolvedValue({ code: 0, signal: null, stdout: "OK", stderr: "", timedOut: false, error: null }),
  formatCommandResult: vi.fn().mockReturnValue("OK"),
  openInBrowser: vi.fn().mockResolvedValue({ ok: true, command: "open", output: "" }),
  stripAnsi: vi.fn((s: string) => s),
}));
vi.mock("../plugin-state.js", () => ({
  rememberCheckout: vi.fn(),
  getCheckoutRecord: vi.fn(),
  loadPluginState: vi.fn().mockReturnValue({ checkouts: {} }),
  savePluginState: vi.fn(),
}));

import { apiGet } from "../api-client.js";
import {
  handleCheckForUpdates,
  handleCheckPluginVersion,
  handleGetMarketplaceSnapshot,
  handleGetOpenApiSummary,
} from "../handlers.js";

function makeDetail(overrides: Record<string, unknown> = {}) {
  return {
    source: "agentpowers", slug: "test", title: "Test Skill",
    description: "desc", long_description: null, category: "dev",
    type: "skill", price_cents: 0, currency: "usd", version: "1.0.0",
    security_status: "pass", security_score: 0, trust_level: null,
    download_count: 10, platforms: ["claude-code"], published_at: null,
    created_at: null, updated_at: null, archived_at: null,
    author_display_name: null, author_github: null, author_avatar_url: null,
    source_url: null, source_downloads: null, source_stars: null,
    source_comments: null, source_versions_count: null, source_installs: null,
    ap_security_status: null, ap_security_score: null, ap_scan_hash: null,
    ap_scanned_at: null, rating_average: null, rating_count: 0,
    ...overrides,
  };
}

let tempDir: string;

beforeEach(() => {
  vi.clearAllMocks();
  tempDir = mkdtempSync(join(tmpdir(), "ap-test-"));
});

afterEach(() => {
  rmSync(tempDir, { recursive: true, force: true });
});

/** Install a fake skill in the temp dir. */
function installFake(baseDir: string, slug: string, content = "hello") {
  const dir = join(baseDir, slug);
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, "SKILL.md"), content);
  return dir;
}

describe("content hashing integration", () => {
  it("produces deterministic hash for installed skill", () => {
    const dir = installFake(tempDir, "hash-test", "test content");
    const hash1 = hashDirectory(dir);
    const hash2 = hashDirectory(dir);
    expect(hash1).toBe(hash2);
    expect(hash1).toMatch(/^sha256:[a-f0-9]{64}$/);
  });

  it("detects modifications to installed skill", () => {
    const dir = installFake(tempDir, "modify-test", "original");
    const hashBefore = hashDirectory(dir);
    writeFileSync(join(dir, "SKILL.md"), "modified");
    const hashAfter = hashDirectory(dir);
    expect(hashBefore).not.toBe(hashAfter);
  });
});

describe("handleCheckForUpdates", () => {
  it("runs without error when no skills are installed", async () => {
    const result = await handleCheckForUpdates();
    // May find skills in the real homedir or not, just verify it completes
    expect(typeof result).toBe("string");
  });
});

describe("handleCheckPluginVersion", () => {
  it("returns version info when registry is unreachable", async () => {
    const { fetchUrl } = await import("../api-client.js");
    vi.mocked(fetchUrl).mockRejectedValue(new Error("Network error"));

    const result = await handleCheckPluginVersion("0.1.8");
    expect(result).toContain("0.1.8");
    expect(result).toContain("unable to check for updates");
  });

  it("reports when up to date", async () => {
    const { fetchUrl } = await import("../api-client.js");
    vi.mocked(fetchUrl).mockResolvedValue({ "dist-tags": { latest: "0.1.8" } });

    const result = await handleCheckPluginVersion("0.1.8");
    expect(result).toContain("latest version");
  });

  it("reports when update available", async () => {
    const { fetchUrl } = await import("../api-client.js");
    vi.mocked(fetchUrl).mockResolvedValue({ "dist-tags": { latest: "1.0.0" } });

    const result = await handleCheckPluginVersion("0.1.8");
    expect(result).toContain("Update available");
    expect(result).toContain("1.0.0");
  });
});

describe("handleGetMarketplaceSnapshot", () => {
  it("returns snapshot info", async () => {
    const { apiRoot } = await import("../api-client.js");
    vi.mocked(apiRoot).mockResolvedValue({ status: "ok", version: "1.0" });
    vi.mocked(apiGet).mockImplementation(async (path: string) => {
      if (path.includes("/skills")) return { items: [], total: 42 };
      if (path.includes("/categories")) return { categories: [{ category: "dev" }] };
      if (path.includes("/sellers")) return { total: 5 };
      return {};
    });

    const result = await handleGetMarketplaceSnapshot();
    expect(result).toContain("AgentPowers marketplace snapshot");
    expect(result).toContain("Skills total: 42");
  });
});

describe("handleGetOpenApiSummary", () => {
  it("returns OpenAPI summary", async () => {
    const { fetchUrl } = await import("../api-client.js");
    vi.mocked(fetchUrl).mockResolvedValue({
      openapi: "3.0.0",
      info: { title: "AgentPowers API", version: "1.0" },
      servers: [{ url: "https://api.agentpowers.ai" }],
      paths: { "/v1/search": {}, "/v1/skills": {} },
    });

    const result = await handleGetOpenApiSummary();
    expect(result).toContain("AgentPowers OpenAPI summary");
    expect(result).toContain("Path count: 2");
  });
});
