import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("../api-client.js", () => ({
  apiGet: vi.fn(),
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

import { apiGet } from "../api-client.js";
import { loadAuthToken } from "../auth.js";
import {
  handleGetCategories,
  handleGetSkillReviews,
  handleStartCheckout,
  handleGetAccountProfile,
  handleListPurchases,
} from "../handlers-commerce.js";

const mockApiGet = apiGet as ReturnType<typeof vi.fn>;
const mockLoadAuth = loadAuthToken as ReturnType<typeof vi.fn>;

beforeEach(() => {
  vi.clearAllMocks();
});

// ---------------------------------------------------------------------------
// get_categories
// ---------------------------------------------------------------------------

describe("handleGetCategories", () => {
  it("formats categories list", async () => {
    // Shape matches server's Pydantic CategoryItem: {category, name,
    // description, icon, sample_keywords, count}
    mockApiGet.mockResolvedValue({
      categories: [
        {
          category: "dev-tools",
          name: "Developer Tools",
          description: "Tools for developers",
          icon: "🔧",
          sample_keywords: "",
          count: 12,
        },
        {
          category: "writing",
          name: "Writing",
          description: null,
          icon: null,
          sample_keywords: "",
          count: 5,
        },
      ],
      total_count: 17,
    });

    const result = await handleGetCategories();
    expect(result).toContain("Marketplace Categories (2)");
    expect(result).toContain("Developer Tools");
    expect(result).toContain("`dev-tools`");
    expect(result).toContain("Tools for developers");
    expect(result).toContain("**Skills:** 12");
    expect(result).toContain("Writing");
    expect(result).toContain("**Skills:** 5");
    expect(mockApiGet).toHaveBeenCalledWith("/v1/categories");
  });

  it("falls back to `category` slug when `name` is null", async () => {
    mockApiGet.mockResolvedValue({
      categories: [
        {
          category: "raw-slug",
          name: null,
          description: null,
          icon: null,
          sample_keywords: "",
          count: 3,
        },
      ],
      total_count: 3,
    });
    const result = await handleGetCategories();
    // When name is null, we use the category slug as the label so
    // users never see "null" in the heading.
    expect(result).toContain("## raw-slug");
    expect(result).toContain("`raw-slug`");
  });

  it("returns message when no categories", async () => {
    mockApiGet.mockResolvedValue({ categories: [], total_count: 0 });
    const result = await handleGetCategories();
    expect(result).toBe("No categories found.");
  });
});

// ---------------------------------------------------------------------------
// get_skill_reviews
// ---------------------------------------------------------------------------

describe("handleGetSkillReviews", () => {
  it("formats reviews list", async () => {
    mockApiGet.mockResolvedValue({
      reviews: [
        {
          rating: 5,
          text: "Amazing skill!",
          created_at: "2025-01-15",
          author: "alice",
        },
        {
          rating: 3,
          text: null,
          created_at: "2025-01-10",
          author: "bob",
        },
      ],
      total: 2,
      average_rating: 4.0,
    });

    const result = await handleGetSkillReviews({ slug: "my-skill" });
    expect(result).toContain("Reviews for `my-skill` (2");
    expect(result).toContain("Average: 4.0/5");
    expect(result).toContain("by alice");
    expect(result).toContain("Amazing skill!");
    expect(result).toContain("by bob");
    expect(mockApiGet).toHaveBeenCalledWith("/v1/skills/my-skill/reviews");
  });

  it("returns message when no reviews", async () => {
    mockApiGet.mockResolvedValue({ reviews: [], total: 0, average_rating: null });
    const result = await handleGetSkillReviews({ slug: "no-reviews" });
    expect(result).toContain('No reviews found for "no-reviews"');
  });
});

// ---------------------------------------------------------------------------
// start_checkout
// ---------------------------------------------------------------------------

describe("handleStartCheckout", () => {
  it("returns install message for free skills", async () => {
    mockApiGet.mockResolvedValue({
      slug: "free-skill",
      title: "Free Skill",
      price_cents: 0,
    });

    const result = await handleStartCheckout({ slug: "free-skill" });
    expect(result).toContain("is free");
    expect(result).toContain("install_skill");
  });

  it("returns checkout URL for paid skills", async () => {
    mockApiGet.mockResolvedValue({
      slug: "paid-skill",
      title: "Paid Skill",
      price_cents: 999,
      currency: "usd",
    });

    const result = await handleStartCheckout({ slug: "paid-skill" });
    expect(result).toContain("$9.99");
    expect(result).toContain("https://agentpowers.ai/skills/paid-skill?action=buy");
    expect(result).toContain("Stripe");
  });

  it("strips trailing slash from AGENTPOWERS_FRONTEND_URL env override", async () => {
    const orig = process.env.AGENTPOWERS_FRONTEND_URL;
    process.env.AGENTPOWERS_FRONTEND_URL = "https://staging.agentpowers.ai/";

    // Re-import the module fresh so the env var is picked up
    vi.resetModules();
    const { handleStartCheckout: freshHandler } = await import("../handlers-commerce.js");

    mockApiGet.mockResolvedValue({
      slug: "edge-skill",
      title: "Edge Skill",
      price_cents: 500,
      currency: "usd",
    });

    const result = await freshHandler({ slug: "edge-skill" });
    // Must NOT have double slash after the host
    expect(result).not.toContain("staging.agentpowers.ai//skills");
    expect(result).toContain("staging.agentpowers.ai/skills/edge-skill?action=buy");

    // Restore
    if (orig === undefined) {
      delete process.env.AGENTPOWERS_FRONTEND_URL;
    } else {
      process.env.AGENTPOWERS_FRONTEND_URL = orig;
    }
    vi.resetModules();
  });

  it("falls back to production URL when AGENTPOWERS_FRONTEND_URL is empty string", async () => {
    const orig = process.env.AGENTPOWERS_FRONTEND_URL;
    process.env.AGENTPOWERS_FRONTEND_URL = "";

    vi.resetModules();
    const { handleStartCheckout: freshHandler } = await import("../handlers-commerce.js");

    mockApiGet.mockResolvedValue({
      slug: "empty-env-skill",
      title: "Empty Env Skill",
      price_cents: 500,
      currency: "usd",
    });

    const result = await freshHandler({ slug: "empty-env-skill" });
    // Must use production URL, not produce a relative path like /skills/...
    expect(result).toContain("https://agentpowers.ai/skills/empty-env-skill?action=buy");
    expect(result).not.toMatch(/^.*:\/skills\//);

    // Restore
    if (orig === undefined) {
      delete process.env.AGENTPOWERS_FRONTEND_URL;
    } else {
      process.env.AGENTPOWERS_FRONTEND_URL = orig;
    }
    vi.resetModules();
  });
});

// ---------------------------------------------------------------------------
// get_account_profile
// ---------------------------------------------------------------------------

describe("handleGetAccountProfile", () => {
  it("returns auth error when not logged in", async () => {
    mockLoadAuth.mockReturnValue(null);
    const result = await handleGetAccountProfile();
    expect(result).toContain("Not authenticated");
    expect(result).toContain("login");
  });

  it("formats profile when authenticated", async () => {
    mockLoadAuth.mockReturnValue("tok_abc123");
    mockApiGet.mockResolvedValue({
      id: "user_123",
      display_name: "Alice",
      display_name_slug: "alice",
      email: "alice@example.com",
      github_username: "alice",
      bio: "Hello world",
      avatar_url: null,
      created_at: "2025-01-01",
    });

    const result = await handleGetAccountProfile();
    expect(result).toContain("Your AgentPowers Profile");
    expect(result).toContain("**Name:** Alice");
    expect(result).toContain("**Email:** alice@example.com");
    expect(result).toContain("**GitHub:** alice");
    expect(result).toContain("Hello world");
    expect(result).toContain("2025-01-01");
    expect(mockApiGet).toHaveBeenCalledWith("/v1/users/profile", undefined, "tok_abc123");
  });
});

// ---------------------------------------------------------------------------
// list_purchases
// ---------------------------------------------------------------------------

describe("handleListPurchases", () => {
  it("returns auth error when not logged in", async () => {
    mockLoadAuth.mockReturnValue(null);
    const result = await handleListPurchases({});
    expect(result).toContain("Not authenticated");
  });

  it("formats purchases list", async () => {
    mockLoadAuth.mockReturnValue("tok_abc123");
    mockApiGet.mockResolvedValue({
      purchases: [
        {
          id: "pur_1",
          slug: "cool-skill",
          title: "Cool Skill",
          amount_cents: 499,
          currency: "usd",
          status: "completed",
          purchased_at: "2025-03-01",
          license_code: "LIC-ABC",
        },
      ],
      total: 1,
    });

    const result = await handleListPurchases({});
    expect(result).toContain("Your Purchases (1)");
    expect(result).toContain("Cool Skill");
    expect(result).toContain("$4.99");
    expect(result).toContain("Active");
    expect(result).toContain("LIC-ABC");
    expect(mockApiGet).toHaveBeenCalledWith("/v1/purchases", { limit: 20 }, "tok_abc123");
  });

  it("returns message when no purchases", async () => {
    mockLoadAuth.mockReturnValue("tok_abc123");
    mockApiGet.mockResolvedValue({ purchases: [], total: 0 });
    const result = await handleListPurchases({});
    expect(result).toContain("No purchases found");
  });

  it("respects max_results arg", async () => {
    mockLoadAuth.mockReturnValue("tok_abc123");
    mockApiGet.mockResolvedValue({ purchases: [], total: 0 });
    await handleListPurchases({ max_results: 5 });
    expect(mockApiGet).toHaveBeenCalledWith("/v1/purchases", { limit: 5 }, "tok_abc123");
  });
});
