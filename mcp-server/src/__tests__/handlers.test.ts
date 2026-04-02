import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("../api-client.js", () => ({
  apiGet: vi.fn(),
  recordInstallation: vi.fn().mockResolvedValue(undefined),
  APIError: class extends Error {
    statusCode: number;
    code?: string;
    constructor(msg: string, statusCode: number, code?: string) {
      super(msg);
      this.name = "APIError";
      this.statusCode = statusCode;
      this.code = code;
    }
  },
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

import { apiGet, APIError, recordInstallation } from "../api-client.js";
import { loadAuthToken } from "../auth.js";
import { downloadAndExtract } from "../installer.js";
import {
  handleSearchMarketplace,
  handleGetSkillDetails,
  handleInstallSkill,
  handleCheckPurchaseStatus,
} from "../handlers.js";

// ---------------------------------------------------------------------------
// Helper
// ---------------------------------------------------------------------------

function makeDetail(overrides: Record<string, unknown> = {}) {
  return {
    source: "agentpowers",
    slug: "test",
    title: "Test Skill",
    description: "desc",
    long_description: null,
    category: "dev",
    type: "skill",
    price_cents: 0,
    currency: "usd",
    version: "1.0.0",
    security_status: "pass",
    security_score: 0,
    trust_level: null,
    download_count: 10,
    platforms: ["claude-code"],
    published_at: null,
    created_at: null,
    updated_at: null,
    archived_at: null,
    author_display_name: null,
    author_github: null,
    author_avatar_url: null,
    source_url: null,
    source_downloads: null,
    source_stars: null,
    source_comments: null,
    source_versions_count: null,
    source_installs: null,
    ap_security_status: null,
    ap_security_score: null,
    ap_scan_hash: null,
    ap_scanned_at: null,
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Setup
// ---------------------------------------------------------------------------

beforeEach(() => {
  vi.clearAllMocks();
});

// ---------------------------------------------------------------------------
// handleSearchMarketplace
// ---------------------------------------------------------------------------

describe("handleSearchMarketplace", () => {
  const emptyResponse = {
    agentpowers: { items: [], total: 0, limit: 20, offset: 0 },
  };

  it("passes query as q param", async () => {
    vi.mocked(apiGet).mockResolvedValue(emptyResponse);

    await handleSearchMarketplace({ query: "git tools" });

    expect(vi.mocked(apiGet)).toHaveBeenCalledWith(
      "/v1/search",
      expect.objectContaining({ q: "git tools" }),
    );
  });

  it("passes category, type, and max_results as limit", async () => {
    vi.mocked(apiGet).mockResolvedValue(emptyResponse);

    await handleSearchMarketplace({
      query: "test",
      category: "productivity",
      type: "agent",
      max_results: 5,
    });

    expect(vi.mocked(apiGet)).toHaveBeenCalledWith(
      "/v1/search",
      expect.objectContaining({
        q: "test",
        category: "productivity",
        type: "agent",
        limit: 5,
      }),
    );
  });

  it("returns formatted results string", async () => {
    vi.mocked(apiGet).mockResolvedValue({
      agentpowers: {
        items: [
          {
            slug: "git-helper",
            title: "Git Helper",
            description: "A git utility",
            category: "development",
            type: "skill",
            price_cents: 0,
            currency: "usd",
            version: "1.0.0",
            security_status: "pass",
            download_count: 100,
            author: { display_name: "Alice", github_username: "alice" },
          },
        ],
        total: 1,
        limit: 20,
        offset: 0,
      },
    });

    const result = await handleSearchMarketplace({ query: "git" });

    expect(result).toContain("# AgentPowers Marketplace");
    expect(result).toContain("Git Helper");
    expect(result).toContain("`git-helper`");
  });
});

// ---------------------------------------------------------------------------
// handleGetSkillDetails
// ---------------------------------------------------------------------------

describe("handleGetSkillDetails", () => {
  it("calls /v1/detail/{slug}", async () => {
    vi.mocked(apiGet).mockResolvedValue(makeDetail());

    await handleGetSkillDetails({ slug: "my-skill" });

    expect(vi.mocked(apiGet)).toHaveBeenCalledWith(
      "/v1/detail/my-skill",
      expect.any(Object),
    );
  });

  it("passes source param when provided", async () => {
    vi.mocked(apiGet).mockResolvedValue(makeDetail({ source: "clawhub" }));

    await handleGetSkillDetails({ slug: "ext-skill", source: "clawhub" });

    expect(vi.mocked(apiGet)).toHaveBeenCalledWith(
      "/v1/detail/ext-skill",
      expect.objectContaining({ source: "clawhub" }),
    );
  });

  it("does not pass source param when omitted", async () => {
    vi.mocked(apiGet).mockResolvedValue(makeDetail());

    await handleGetSkillDetails({ slug: "native-skill" });

    const callParams = vi.mocked(apiGet).mock.calls[0][1] as Record<
      string,
      unknown
    >;
    expect(callParams).not.toHaveProperty("source");
  });
});

// ---------------------------------------------------------------------------
// handleInstallSkill
// ---------------------------------------------------------------------------

describe("handleInstallSkill", () => {
  it("blocks install when security_status is BLOCK", async () => {
    vi.mocked(apiGet).mockResolvedValue(
      makeDetail({ security_status: "block" }),
    );

    const result = await handleInstallSkill({ slug: "bad-skill" });

    expect(result).toContain("blocked due to security issues");
    expect(vi.mocked(downloadAndExtract)).not.toHaveBeenCalled();
  });

  it("blocks when ap_security_status is BLOCK (external skill)", async () => {
    vi.mocked(apiGet).mockResolvedValue(
      makeDetail({ security_status: null, ap_security_status: "BLOCK" }),
    );

    const result = await handleInstallSkill({ slug: "bad-ext-skill" });

    expect(result).toContain("blocked due to security issues");
    expect(vi.mocked(downloadAndExtract)).not.toHaveBeenCalled();
  });

  it("requires login for paid skills when no token is present", async () => {
    vi.mocked(apiGet).mockResolvedValue(makeDetail({ price_cents: 500 }));
    vi.mocked(loadAuthToken).mockReturnValue(null);

    const result = await handleInstallSkill({ slug: "paid-skill" });

    expect(result).toContain("ap login");
    expect(result).toContain("$5.00");
    expect(vi.mocked(downloadAndExtract)).not.toHaveBeenCalled();
  });

  it("calls download endpoint and downloadAndExtract on success", async () => {
    vi.mocked(apiGet).mockImplementation(async (path: string) => {
      if (path.includes("/download")) {
        return { url: "https://dl.example.com/pkg.tar.gz", slug: "test" };
      }
      return makeDetail({ price_cents: 0 });
    });
    vi.mocked(downloadAndExtract).mockResolvedValue("/home/user/.claude/skills/test");

    const result = await handleInstallSkill({ slug: "test" });

    expect(vi.mocked(apiGet)).toHaveBeenCalledWith(
      "/v1/skills/test/download",
      undefined,
      null,
    );
    expect(vi.mocked(downloadAndExtract)).toHaveBeenCalledWith(
      "https://dl.example.com/pkg.tar.gz",
      "test",
      "skill",
      "agentpowers",
      "1.0.0",
      "pass",
      "claude-code",
    );
    expect(result).toContain("Installed");
    expect(result).toContain("/home/user/.claude/skills/test");
  });

  it("returns 'purchase first' message on 403 for a paid skill", async () => {
    vi.mocked(apiGet).mockImplementation(async (path: string) => {
      if (path.includes("/download")) {
        throw new APIError("Forbidden", 403);
      }
      return makeDetail({ price_cents: 500 });
    });
    vi.mocked(loadAuthToken).mockReturnValue("token123");

    const result = await handleInstallSkill({ slug: "paid-skill" });

    expect(result).toContain("Purchase it first");
    expect(result).toContain("$5.00");
  });

  it("returns 'access denied' on 403 for a free skill", async () => {
    vi.mocked(apiGet).mockImplementation(async (path: string) => {
      if (path.includes("/download")) {
        throw new APIError("Forbidden", 403);
      }
      return makeDetail({ price_cents: 0 });
    });

    const result = await handleInstallSkill({ slug: "free-skill" });

    expect(result).toContain("access denied");
  });

  it("re-throws non-403 API errors", async () => {
    vi.mocked(apiGet).mockImplementation(async (path: string) => {
      if (path.includes("/download")) {
        throw new APIError("Server Error", 500);
      }
      return makeDetail({ price_cents: 0 });
    });

    await expect(handleInstallSkill({ slug: "broken-skill" })).rejects.toThrow(
      "Server Error",
    );
  });
});

// ---------------------------------------------------------------------------
// handleCheckPurchaseStatus
// ---------------------------------------------------------------------------

describe("handleCheckPurchaseStatus", () => {
  it("returns 'not authenticated' message when no token", async () => {
    vi.mocked(loadAuthToken).mockReturnValue(null);

    const result = await handleCheckPurchaseStatus({ purchase_id: "abc123" });

    expect(result).toContain("Not authenticated");
    expect(vi.mocked(apiGet)).not.toHaveBeenCalled();
  });

  it("returns formatted purchase status", async () => {
    vi.mocked(loadAuthToken).mockReturnValue("token123");
    vi.mocked(apiGet).mockResolvedValue({
      purchase_id: "abc123",
      skill_slug: "my-skill",
      status: "completed",
    });

    const result = await handleCheckPurchaseStatus({ purchase_id: "abc123" });

    expect(result).toContain("**Purchase:** abc123");
    expect(result).toContain("**Skill:** my-skill");
    expect(result).toContain("**Status:** completed");
    expect(vi.mocked(apiGet)).toHaveBeenCalledWith(
      "/v1/purchases/abc123/status",
      undefined,
      "token123",
    );
  });

  it("includes license code in output when present", async () => {
    vi.mocked(loadAuthToken).mockReturnValue("token123");
    vi.mocked(apiGet).mockResolvedValue({
      purchase_id: "abc123",
      skill_slug: "my-skill",
      status: "completed",
      license_code: "LIC-XYZ-9999",
    });

    const result = await handleCheckPurchaseStatus({ purchase_id: "abc123" });

    expect(result).toContain("**License Code:** LIC-XYZ-9999");
  });
});

// ---------------------------------------------------------------------------
// recordInstallation tracking in handleInstallSkill
// ---------------------------------------------------------------------------

describe("handleInstallSkill — installation tracking", () => {
  it("calls recordInstallation after successful install", async () => {
    vi.mocked(loadAuthToken).mockReturnValue(null);
    vi.mocked(apiGet).mockResolvedValue(makeDetail({ price_cents: 0 }));
    vi.mocked(downloadAndExtract).mockResolvedValue("/home/.claude/skills/test");

    await handleInstallSkill({ slug: "test" });

    expect(vi.mocked(recordInstallation)).toHaveBeenCalledWith(
      "test",
      "mcp",
      "agentpowers",
      expect.any(String),
      null,
    );
  });

  it("calls recordInstallation with clawhub source for external skill", async () => {
    vi.mocked(loadAuthToken).mockReturnValue(null);
    vi.mocked(apiGet).mockResolvedValue(
      makeDetail({ price_cents: 0, source: "clawhub" }),
    );
    vi.mocked(downloadAndExtract).mockResolvedValue("/home/.claude/skills/ext");

    await handleInstallSkill({ slug: "ext-skill" });

    expect(vi.mocked(recordInstallation)).toHaveBeenCalledWith(
      "ext-skill",
      "mcp",
      "clawhub",
      expect.any(String),
      null,
    );
  });

  it("does NOT call recordInstallation when skill is blocked", async () => {
    vi.mocked(loadAuthToken).mockReturnValue(null);
    vi.mocked(apiGet).mockResolvedValue(
      makeDetail({ security_status: "BLOCK" }),
    );

    await handleInstallSkill({ slug: "bad-skill" });

    expect(vi.mocked(recordInstallation)).not.toHaveBeenCalled();
  });

  it("tracking failure does not reject the handler", async () => {
    vi.mocked(loadAuthToken).mockReturnValue(null);
    vi.mocked(apiGet).mockResolvedValue(makeDetail({ price_cents: 0 }));
    vi.mocked(downloadAndExtract).mockResolvedValue("/home/.claude/skills/test");
    vi.mocked(recordInstallation).mockRejectedValue(new Error("network down"));

    // Should resolve, not reject
    await expect(handleInstallSkill({ slug: "test" })).resolves.toContain(
      "Installed",
    );
  });
});
