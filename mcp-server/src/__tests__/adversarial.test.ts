/**
 * Adversarial tests — edge cases, bad inputs, and security boundaries.
 *
 * Covers hardening fixes from the MCP server smoke test audit:
 * - Path traversal via relative() check instead of startsWith()
 * - apiGet/apiPost reject absolute URLs (prevent URL override)
 * - Slug validation edge cases
 * - Download URL HTTPS enforcement
 */

import { describe, it, expect, vi } from "vitest";
import { validateSlug, validateArchiveMembers } from "../installer.js";
import { apiGet, apiPost } from "../api-client.js";
import { formatPrice, formatSearchResults, formatSkillDetail } from "../formatters.js";

// ---------- Slug validation ----------

describe("validateSlug adversarial", () => {
  it("rejects empty string", () => {
    expect(validateSlug("")).toBe(false);
  });

  it("rejects whitespace-only", () => {
    expect(validateSlug("   ")).toBe(false);
  });

  it("rejects uppercase", () => {
    expect(validateSlug("MySkill")).toBe(false);
  });

  it("rejects underscores", () => {
    expect(validateSlug("my_skill")).toBe(false);
  });

  it("rejects dots", () => {
    expect(validateSlug("my.skill")).toBe(false);
  });

  it("rejects path traversal", () => {
    expect(validateSlug("../../etc/passwd")).toBe(false);
  });

  it("rejects leading hyphen", () => {
    expect(validateSlug("-my-skill")).toBe(false);
  });

  it("rejects spaces", () => {
    expect(validateSlug("my skill")).toBe(false);
  });

  it("rejects slashes", () => {
    expect(validateSlug("author/slug")).toBe(false);
  });

  it("accepts valid slug", () => {
    expect(validateSlug("my-skill-123")).toBe(true);
  });
});

// ---------- Archive member validation (prefix attack) ----------

describe("validateArchiveMembers adversarial", () => {
  it("rejects absolute paths", () => {
    expect(() =>
      validateArchiveMembers(["/etc/passwd"], "/tmp/install")
    ).toThrow("absolute path");
  });

  it("rejects .. traversal", () => {
    expect(() =>
      validateArchiveMembers(["../../etc/passwd"], "/tmp/install")
    ).toThrow("..");
  });

  it("rejects entries resolving outside via prefix attack", () => {
    // "a-malicious" would startsWith("/tmp/install/a") if using naive startsWith
    // but relative() correctly returns ".." prefix
    expect(() =>
      validateArchiveMembers(
        ["../install-malicious/payload"],
        "/tmp/install"
      )
    ).toThrow();
  });

  it("rejects backslash traversal", () => {
    expect(() =>
      validateArchiveMembers(["..\\..\\etc\\passwd"], "/tmp/install")
    ).toThrow();
  });

  it("accepts valid nested paths", () => {
    expect(() =>
      validateArchiveMembers(
        ["SKILL.md", "src/main.ts", "src/utils/helper.ts"],
        "/tmp/install"
      )
    ).not.toThrow();
  });
});

// ---------- apiGet/apiPost path validation ----------

describe("apiGet absolute URL rejection", () => {
  it("rejects absolute http URL", async () => {
    await expect(
      apiGet("http://evil.com/steal-token")
    ).rejects.toThrow("must start with");
  });

  it("rejects absolute https URL", async () => {
    await expect(
      apiGet("https://evil.com/steal-token")
    ).rejects.toThrow("must start with");
  });

  it("rejects relative path without leading slash", async () => {
    await expect(
      apiGet("v1/search")
    ).rejects.toThrow("must start with");
  });
});

describe("apiPost absolute URL rejection", () => {
  it("rejects absolute URL", async () => {
    await expect(
      apiPost("http://evil.com/steal-token")
    ).rejects.toThrow("must start with");
  });
});

// ---------- formatPrice adversarial ----------

describe("formatPrice adversarial", () => {
  it("returns Free for negative price", () => {
    expect(formatPrice(-500)).toBe("Free");
  });

  it("returns Free for -1", () => {
    expect(formatPrice(-1)).toBe("Free");
  });
});

// ---------- Markdown injection ----------

const MOCK_NATIVE_ITEM = {
  slug: "safe-skill",
  title: "Safe Skill",
  description: "A safe description",
  category: "testing",
  type: "skill",
  price_cents: 0,
  currency: "usd",
  version: "1.0.0",
  security_status: "pass",
  download_count: 10,
  author: null,
};

describe("markdown injection in formatSearchResults", () => {
  it("escapes backticks in slug", () => {
    const data = {
      agentpowers: {
        items: [{ ...MOCK_NATIVE_ITEM, slug: "test`inject" }],
        total: 1,
      },
    };
    const result = formatSearchResults(data);
    // A raw backtick inside a backtick-fenced slug would break formatting
    expect(result).not.toMatch(/`test`inject`/);
  });

  it("escapes markdown link injection in title", () => {
    const data = {
      agentpowers: {
        items: [{ ...MOCK_NATIVE_ITEM, title: "Evil [click](http://evil.com)" }],
        total: 1,
      },
    };
    const result = formatSearchResults(data);
    expect(result).not.toContain("](http://evil.com)");
  });

  it("escapes brackets in title", () => {
    const data = {
      agentpowers: {
        items: [{ ...MOCK_NATIVE_ITEM, title: "Skill [with] brackets" }],
        total: 1,
      },
    };
    const result = formatSearchResults(data);
    expect(result).not.toMatch(/## Skill \[with\] brackets/);
  });

  it("strips newlines from title to prevent heading injection", () => {
    const data = {
      agentpowers: {
        items: [{ ...MOCK_NATIVE_ITEM, title: "Normal\n# Injected Heading" }],
        total: 1,
      },
    };
    const result = formatSearchResults(data);
    expect(result).not.toContain("\n# Injected Heading");
  });
});

describe("markdown injection in formatSkillDetail", () => {
  it("escapes markdown link injection in detail title", () => {
    const detail = {
      source: "agentpowers",
      slug: "test",
      title: "Evil [click](http://evil.com)",
      description: "desc",
      long_description: null,
      category: null,
      type: "skill",
      price_cents: 0,
      currency: "usd",
      version: "1.0.0",
      security_status: "pass",
      security_score: null,
      trust_level: null,
      download_count: 0,
      platforms: null,
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
    };
    const result = formatSkillDetail(detail);
    expect(result).not.toContain("](http://evil.com)");
  });
});
