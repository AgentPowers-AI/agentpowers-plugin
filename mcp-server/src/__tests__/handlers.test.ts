import { describe, it, expect, vi, beforeEach } from "vitest";

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
    code?: string;
    constructor(msg: string, statusCode: number, code?: string) {
      super(msg);
      this.name = "APIError";
      this.statusCode = statusCode;
      this.code = code;
    }
  },
  NetworkError: class extends Error {
    constructor(msg: string) {
      super(msg);
      this.name = "NetworkError";
    }
  },
  formatAPIError: vi.fn((err: { statusCode: number; message: string }) => err.message),
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
  runAp: vi.fn().mockResolvedValue({ code: 0, signal: null, stdout: "Installed successfully", stderr: "", timedOut: false, error: null }),
  formatCommandResult: vi.fn().mockReturnValue("Installed successfully"),
  openInBrowser: vi.fn().mockResolvedValue({ ok: true, command: "open", output: "" }),
  stripAnsi: vi.fn((s: string) => s),
}));
vi.mock("../plugin-state.js", () => ({
  rememberCheckout: vi.fn(),
  getCheckoutRecord: vi.fn(),
  loadPluginState: vi.fn().mockReturnValue({ checkouts: {} }),
  savePluginState: vi.fn(),
}));

import { apiGet, apiPost } from "../api-client.js";
import { loadAuthToken } from "../auth.js";
import { runAp } from "../cli-runner.js";
import {
  handleSearchMarketplace,
  handleGetSkillDetails,
  handleInstallSkill,
  handleCheckPurchaseStatus,
  handleGetCategories,
  handleGetSellerProfile,
  handleGetSkillReviews,
  handleGetSecurityResults,
  handleGetPlatforms,
  handleLoginAccount,
  handleLogoutAccount,
  handleWhoamiAccount,
  handleListPurchases,
  handleStartCheckout,
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
    author_slug: null,
    author_github: null,
    author_avatar_url: null,
    source_url: null,
    source_downloads: null,
    source_stars: null,
    source_comments: null,
    source_versions_count: null,
    source_installs: null,
    rating_average: null,
    rating_count: 0,
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
  // Default: unauthenticated
  vi.mocked(loadAuthToken).mockReturnValue(null);
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

    const callParams = vi.mocked(apiGet).mock.calls[0][1] as Record<string, unknown>;
    expect(callParams).not.toHaveProperty("source");
  });
});

// ---------------------------------------------------------------------------
// handleInstallSkill
// ---------------------------------------------------------------------------

describe("handleInstallSkill", () => {
  it("installs free skill via CLI", async () => {
    vi.mocked(apiGet).mockResolvedValue(makeDetail({ price_cents: 0 }));

    const result = await handleInstallSkill({ slug: "test" });

    expect(result).toContain("Installed free skill test");
    expect(vi.mocked(runAp)).toHaveBeenCalled();
  });

  it("returns missing slug message", async () => {
    const result = await handleInstallSkill({ slug: "" });
    expect(result).toContain("Missing required argument: slug");
  });

  it("rejects invalid slugs", async () => {
    const result = await handleInstallSkill({ slug: "../evil" });
    expect(result).toContain("Invalid slug");
  });

  it("requires login for paid skills when no existing purchase", async () => {
    vi.mocked(apiGet).mockImplementation(async (path: string) => {
      if (path.includes("/detail/")) return makeDetail({ price_cents: 500 });
      // /v1/auth/me called by ensureAuthenticated
      if (path.includes("/auth/me")) throw new Error("Not authenticated");
      return {};
    });
    vi.mocked(loadAuthToken).mockReturnValue(null);

    await expect(handleInstallSkill({ slug: "paid-skill" })).rejects.toThrow("Not authenticated");
  });

  it("installs with explicit license code", async () => {
    const result = await handleInstallSkill({ slug: "test", license_code: "LIC-123" });

    expect(result).toContain("Installed test with provided license code");
    expect(vi.mocked(runAp)).toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// handleCheckPurchaseStatus
// ---------------------------------------------------------------------------

describe("handleCheckPurchaseStatus", () => {
  it("throws when no token for purchase_id check", async () => {
    vi.mocked(loadAuthToken).mockReturnValue(null);

    await expect(
      handleCheckPurchaseStatus({ purchase_id: "abc123" }),
    ).rejects.toThrow("Not authenticated");
  });

  it("returns formatted purchase status", async () => {
    vi.mocked(loadAuthToken).mockReturnValue("token123");
    vi.mocked(apiGet).mockImplementation(async (path: string) => {
      if (path.includes("/auth/me")) return { email: "test@example.com" };
      return {
        purchase_id: "abc123",
        skill_slug: "my-skill",
        status: "completed",
      };
    });

    const result = await handleCheckPurchaseStatus({ purchase_id: "abc123" });

    expect(result).toContain("purchase_id: abc123");
    expect(result).toContain("skill_slug: my-skill");
    expect(result).toContain("status: completed");
  });

  it("includes license code in output when present", async () => {
    vi.mocked(loadAuthToken).mockReturnValue("token123");
    vi.mocked(apiGet).mockImplementation(async (path: string) => {
      if (path.includes("/auth/me")) return { email: "test@example.com" };
      return {
        purchase_id: "abc123",
        skill_slug: "my-skill",
        status: "completed",
        license_code: "LIC-XYZ-9999",
      };
    });

    const result = await handleCheckPurchaseStatus({ purchase_id: "abc123" });

    expect(result).toContain("license_code: LIC-XYZ-9999");
  });
});

// ---------------------------------------------------------------------------
// New discovery tools
// ---------------------------------------------------------------------------

describe("handleGetCategories", () => {
  it("returns formatted categories", async () => {
    vi.mocked(apiGet).mockResolvedValue({
      categories: [
        { category: "dev", name: "Development", count: 10, sample_keywords: "code, git" },
      ],
      total_count: 10,
    });

    const result = await handleGetCategories();
    expect(result).toContain("Development");
    expect(result).toContain("10 skills");
  });

  it("returns message when no categories", async () => {
    vi.mocked(apiGet).mockResolvedValue({ categories: [], total_count: 0 });
    const result = await handleGetCategories();
    expect(result).toContain("No categories found");
  });
});

describe("handleGetSellerProfile", () => {
  it("returns formatted seller profile", async () => {
    vi.mocked(apiGet).mockResolvedValue({
      display_name: "Alice Dev",
      bio: "Builder of things",
      verified: true,
      total_skills: 5,
      total_downloads: 1000,
      joined_at: "2025-01-01",
      website_url: null,
      github_url: "https://github.com/alice",
      linkedin_url: null,
      twitter_url: null,
      skills: [{ slug: "cool-skill", title: "Cool Skill", price_cents: 0, download_count: 100 }],
    });

    const result = await handleGetSellerProfile({ seller_slug: "alice" });
    expect(result).toContain("Alice Dev");
    expect(result).toContain("Cool Skill");
    expect(result).toContain("github.com/alice");
  });

  it("returns error for missing seller_slug", async () => {
    const result = await handleGetSellerProfile({});
    expect(result).toContain("Missing required argument: seller_slug");
  });
});

describe("handleGetSkillReviews", () => {
  it("returns formatted reviews", async () => {
    vi.mocked(apiGet).mockResolvedValue({
      items: [
        { author_display_name: "Bob", rating: 5, text: "Great skill!" },
      ],
      total: 1,
    });

    const result = await handleGetSkillReviews({ skill_slug: "cool-skill" });
    expect(result).toContain("Bob");
    expect(result).toContain("5/5");
    expect(result).toContain("Great skill!");
  });
});

describe("handleGetSecurityResults", () => {
  it("returns security scan info", async () => {
    vi.mocked(apiGet).mockResolvedValue({
      slug: "test-skill",
      status: "pass",
      score: 95,
      trust_level: "verified",
      findings: [],
    });

    const result = await handleGetSecurityResults({ skill_slug: "test-skill" });
    expect(result).toContain("pass");
    expect(result).toContain("95");
    expect(result).toContain("No findings reported");
  });
});

describe("handleGetPlatforms", () => {
  it("lists all supported platforms", () => {
    const result = handleGetPlatforms();
    expect(result).toContain("Claude Code");
    expect(result).toContain("Cursor");
    expect(result).toContain("Codex");
    expect(result).toContain("12 AI platforms");
  });
});

// ---------------------------------------------------------------------------
// Account tools
// ---------------------------------------------------------------------------

describe("handleLoginAccount", () => {
  it("runs ap login and returns success", async () => {
    const result = await handleLoginAccount({});
    expect(result).toContain("Login completed");
  });
});

describe("handleLogoutAccount", () => {
  it("runs ap logout and returns success", async () => {
    vi.mocked(runAp).mockResolvedValue({ code: 0, signal: null, stdout: "Logged out", stderr: "", timedOut: false, error: null });

    const result = await handleLogoutAccount();
    expect(result).toContain("Logged out successfully");
  });
});

describe("handleWhoamiAccount", () => {
  it("returns CLI and API identity", async () => {
    vi.mocked(runAp).mockResolvedValue({ code: 0, signal: null, stdout: "user@example.com", stderr: "", timedOut: false, error: null });

    const result = await handleWhoamiAccount();
    expect(result).toContain("CLI whoami output");
    expect(result).toContain("API /v1/auth/me output");
  });
});

// ---------------------------------------------------------------------------
// Purchase tools
// ---------------------------------------------------------------------------

describe("handleListPurchases", () => {
  it("requires authentication", async () => {
    vi.mocked(loadAuthToken).mockReturnValue(null);
    await expect(handleListPurchases({})).rejects.toThrow("Not authenticated");
  });

  it("returns formatted purchase list", async () => {
    vi.mocked(loadAuthToken).mockReturnValue("token123");
    vi.mocked(apiGet).mockImplementation(async (path: string) => {
      if (path.includes("/auth/me")) return { email: "test@example.com" };
      return {
        items: [{
          purchase_id: "p1",
          skill_slug: "cool-skill",
          skill_title: "Cool Skill",
          status: "completed",
          amount_cents: 500,
          license_code: "LIC-1",
          purchased_at: "2025-06-01",
        }],
      };
    });

    const result = await handleListPurchases({});
    expect(result).toContain("Cool Skill");
    expect(result).toContain("$5.00");
    expect(result).toContain("LIC-1");
  });
});

describe("handleStartCheckout", () => {
  it("requires slug", async () => {
    const result = await handleStartCheckout({});
    expect(result).toContain("Missing required argument: slug");
  });

  it("creates checkout and returns info", async () => {
    vi.mocked(loadAuthToken).mockReturnValue("token123");
    vi.mocked(apiGet).mockImplementation(async (path: string) => {
      if (path.includes("/auth/me")) return { email: "test@example.com" };
      return {};
    });
    vi.mocked(apiPost).mockResolvedValue({
      purchase_id: "p1",
      checkout_url: "https://checkout.stripe.com/abc",
      status: "pending",
    });

    const result = await handleStartCheckout({ slug: "paid-skill" });
    expect(result).toContain("Checkout created");
    expect(result).toContain("purchase_id: p1");
    expect(result).toContain("checkout_url:");
  });
});
