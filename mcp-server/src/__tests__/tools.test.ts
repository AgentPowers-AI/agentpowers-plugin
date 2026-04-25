import { describe, it, expect } from "vitest";
import {
  formatPrice,
  formatSecurityOutcome,
  formatTrustLevel,
  formatSearchResults,
  formatSkillDetail,
} from "../index.js";

describe("formatPrice", () => {
  it("returns 'Free' for zero cents", () => {
    expect(formatPrice(0)).toBe("Free");
  });

  it("formats whole dollar amounts", () => {
    expect(formatPrice(500)).toBe("$5.00");
  });

  it("formats amounts with cents", () => {
    expect(formatPrice(999)).toBe("$9.99");
  });

  it("formats large amounts", () => {
    expect(formatPrice(10000)).toBe("$100.00");
  });

  it("formats single cent amounts", () => {
    expect(formatPrice(1)).toBe("$0.01");
  });
});

describe("formatSecurityOutcome", () => {
  it("formats PASS outcome", () => {
    expect(formatSecurityOutcome("PASS")).toBe("Passed security review");
  });

  it("formats WARN outcome", () => {
    expect(formatSecurityOutcome("WARN")).toBe("Passed with warnings");
  });

  it("formats BLOCK outcome", () => {
    expect(formatSecurityOutcome("BLOCK")).toBe(
      "Blocked - security issues found",
    );
  });

  it("handles lowercase input", () => {
    expect(formatSecurityOutcome("pass")).toBe("Passed security review");
    expect(formatSecurityOutcome("warn")).toBe("Passed with warnings");
    expect(formatSecurityOutcome("block")).toBe(
      "Blocked - security issues found",
    );
  });

  it("returns unknown values as-is", () => {
    expect(formatSecurityOutcome("PENDING")).toBe("PENDING");
  });
});

describe("formatTrustLevel", () => {
  it("formats verified level", () => {
    expect(formatTrustLevel("verified")).toBe("Verified publisher");
  });

  it("formats community level", () => {
    expect(formatTrustLevel("community")).toBe("Community contributor");
  });

  it("formats official level", () => {
    expect(formatTrustLevel("official")).toBe("Official AgentPowers");
  });

  it("handles mixed case input", () => {
    expect(formatTrustLevel("Verified")).toBe("Verified publisher");
    expect(formatTrustLevel("COMMUNITY")).toBe("Community contributor");
  });

  it("returns unknown values as-is", () => {
    expect(formatTrustLevel("unknown-level")).toBe("unknown-level");
  });
});

describe("formatSearchResults", () => {
  it("returns 'No results found.' when all sections are empty", () => {
    const data = {
      agentpowers: { items: [], total: 0, limit: 20, offset: 0 },
    };
    expect(formatSearchResults(data)).toBe("No results found.");
  });

  it("returns 'No results found.' when agentpowers and external are both empty", () => {
    const data = {
      agentpowers: { items: [], total: 0, limit: 20, offset: 0 },
      clawhub: { items: [], total: 0 },
    };
    expect(formatSearchResults(data)).toBe("No results found.");
  });

  it("formats native AgentPowers results with section header", () => {
    const data = {
      agentpowers: {
        items: [
          {
            slug: "test-skill",
            title: "Test Skill",
            description: "A test skill",
            category: "development",
            type: "skill",
            price_cents: 0,
            currency: "usd",
            version: "1.0.0",
            security_status: "pass",
            download_count: 42,
            author: { display_name: "Alice", github_username: "alice" },
          },
        ],
        total: 1,
        limit: 20,
        offset: 0,
      },
    };

    const result = formatSearchResults(data);
    expect(result).toContain("# AgentPowers Marketplace (1 result)");
    expect(result).toContain("## Test Skill (`test-skill`)");
    expect(result).toContain("**Type:** skill");
    expect(result).toContain("**Category:** development");
    expect(result).toContain("**Version:** 1.0.0");
    expect(result).toContain("**Price:** Free");
    expect(result).toContain("**Security:** Passed security review");
    expect(result).toContain("**Author:** Alice");
    expect(result).toContain("**Downloads:** 42");
    expect(result).toContain("A test skill");
  });

  it("shows github_username when display_name is null", () => {
    const data = {
      agentpowers: {
        items: [
          {
            slug: "s",
            title: "S",
            description: "d",
            category: "c",
            type: "skill",
            price_cents: 0,
            currency: "usd",
            version: "1.0.0",
            security_status: "pass",
            download_count: 0,
            author: { display_name: null, github_username: "bob" },
          },
        ],
        total: 1,
        limit: 20,
        offset: 0,
      },
    };

    const result = formatSearchResults(data);
    expect(result).toContain("**Author:** bob");
  });

  it("omits author line when author is null", () => {
    const data = {
      agentpowers: {
        items: [
          {
            slug: "s",
            title: "S",
            description: "d",
            category: "c",
            type: "skill",
            price_cents: 0,
            currency: "usd",
            version: "1.0.0",
            security_status: "pass",
            download_count: 0,
            author: null,
          },
        ],
        total: 1,
        limit: 20,
        offset: 0,
      },
    };

    const result = formatSearchResults(data);
    expect(result).not.toContain("**Author:**");
  });

  it("formats external ClawHub results with section header", () => {
    const data = {
      agentpowers: { items: [], total: 0, limit: 20, offset: 0 },
      clawhub: {
        items: [
          {
            slug: "ext-skill",
            title: "External Skill",
            description: "From ClawHub",
            author: "extdev",
            source: "clawhub",
            source_url: "https://clawhub.io/skills/ext-skill",
            source_installs: 150,
            source_rating: 4.5,
            price_cents: 0,
            version: "1.2.0",
            ap_security_status: "pass",
            ap_security_score: null,
            ap_scanned_at: null,
          },
        ],
        total: 1,
      },
    };

    const result = formatSearchResults(data);
    expect(result).not.toContain("# AgentPowers Marketplace");
    expect(result).toContain("# Clawhub (1 result)");
    expect(result).toContain("## External Skill (`ext-skill`)");
    expect(result).toContain("**Author:** extdev");
    expect(result).toContain("**Price:** Free");
    expect(result).toContain("**AgentPowers Scan:** Passed security review");
    expect(result).toContain("**Installs:** 150");
    expect(result).toContain("**Version:** 1.2.0");
    expect(result).toContain("**Source URL:** https://clawhub.io/skills/ext-skill");
    expect(result).toContain("From ClawHub");
  });

  it("shows 'Not yet scanned' when ap_security_status is null", () => {
    const data = {
      agentpowers: { items: [], total: 0, limit: 20, offset: 0 },
      clawhub: {
        items: [
          {
            slug: "unscanned",
            title: "Unscanned",
            description: "No scan yet",
            author: "dev",
            source: "clawhub",
            source_url: "https://clawhub.io/skills/unscanned",
            source_installs: null,
            source_rating: null,
            price_cents: 0,
            version: null,
            ap_security_status: null,
            ap_security_score: null,
            ap_scanned_at: null,
          },
        ],
        total: 1,
      },
    };

    const result = formatSearchResults(data);
    expect(result).toContain("**AgentPowers Scan:** Not yet scanned");
    expect(result).not.toContain("**Installs:**");
    expect(result).not.toContain("**Version:**");
  });

  it("formats mixed results with AgentPowers first, then external", () => {
    const data = {
      agentpowers: {
        items: [
          {
            slug: "native-skill",
            title: "Native Skill",
            description: "From AP",
            category: "productivity",
            type: "skill",
            price_cents: 500,
            currency: "usd",
            version: "1.0.0",
            security_status: "pass",
            download_count: 100,
            author: { display_name: "Nate", github_username: null },
          },
        ],
        total: 1,
        limit: 20,
        offset: 0,
      },
      clawhub: {
        items: [
          {
            slug: "ch-skill",
            title: "ClawHub Skill",
            description: "From CH",
            author: "chdev",
            source: "clawhub",
            source_url: "https://clawhub.io/skills/ch-skill",
            source_installs: 50,
            source_rating: null,
            price_cents: 0,
            version: "0.5.0",
            ap_security_status: "warn",
            ap_security_score: 3,
            ap_scanned_at: "2026-02-25T00:00:00Z",
          },
        ],
        total: 1,
      },
    };

    const result = formatSearchResults(data);
    const apIndex = result.indexOf("# AgentPowers Marketplace");
    const chIndex = result.indexOf("# Clawhub");
    expect(apIndex).toBeGreaterThanOrEqual(0);
    expect(chIndex).toBeGreaterThan(apIndex);
    expect(result).toContain("**Price:** $5.00");
    expect(result).toContain("**AgentPowers Scan:** Passed with warnings");
  });

  it("pluralizes section headers correctly", () => {
    const data = {
      agentpowers: {
        items: [
          {
            slug: "a",
            title: "A",
            description: "d",
            category: "c",
            type: "skill",
            price_cents: 0,
            currency: "usd",
            version: "1.0.0",
            security_status: "pass",
            download_count: 0,
            author: null,
          },
          {
            slug: "b",
            title: "B",
            description: "d",
            category: "c",
            type: "skill",
            price_cents: 0,
            currency: "usd",
            version: "1.0.0",
            security_status: "pass",
            download_count: 0,
            author: null,
          },
        ],
        total: 2,
        limit: 20,
        offset: 0,
      },
    };

    const result = formatSearchResults(data);
    expect(result).toContain("# AgentPowers Marketplace (2 results)");
  });
});

describe("formatSkillDetail", () => {
  // Helper to build a minimal UnifiedDetail with overrides
  function makeDetail(overrides: Record<string, unknown> = {}) {
    return {
      source: "agentpowers",
      slug: "test",
      title: "Test",
      description: "desc",
      long_description: null,
      category: null,
      type: "skill",
      price_cents: 0,
      currency: "usd",
      version: "1.0.0",
      security_status: "pass",
      security_score: 0,
      trust_level: null,
      download_count: 0,
      platforms: null,
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

  it("formats a native skill with all fields", () => {
    const detail = makeDetail({
      slug: "code-reviewer",
      title: "Code Reviewer",
      description: "Automated code review for Python",
      category: "development",
      type: "skill",
      price_cents: 500,
      version: "1.0.0",
      security_status: "pass",
      trust_level: "verified",
      download_count: 42,
      platforms: ["claude-code", "claude-ai"],
      author_display_name: "Alice",
      author_github: "alice",
    });

    const result = formatSkillDetail(detail);
    expect(result).toContain("# Code Reviewer (`code-reviewer`)");
    expect(result).toContain("Automated code review for Python");
    expect(result).toContain("**Source:** agentpowers");
    expect(result).toContain("**Type:** skill");
    expect(result).toContain("**Version:** 1.0.0");
    expect(result).toContain("**Price:** $5.00");
    expect(result).toContain("**Security:** Passed security review");
    expect(result).toContain("**Trust:** Verified publisher");
    expect(result).toContain("**Platforms:** claude-code, claude-ai");
    expect(result).toContain("**Downloads:** 42");
    expect(result).toContain("**Author:** Alice");
    expect(result).toContain("**Category:** development");
  });

  it("formats a free skill with no author", () => {
    const detail = makeDetail({
      slug: "free-tool",
      title: "Free Tool",
      description: "A free tool",
      category: "productivity",
      type: "skill",
      version: "0.1.0",
      security_status: "warn",
      trust_level: "community",
      download_count: 100,
      platforms: ["claude-code"],
    });

    const result = formatSkillDetail(detail);
    expect(result).toContain("**Price:** Free");
    expect(result).toContain("**Security:** Passed with warnings");
    expect(result).toContain("**Author:** --");
  });

  it("shows github_username when display_name is null", () => {
    const detail = makeDetail({
      author_display_name: null,
      author_github: "bob",
    });

    const result = formatSkillDetail(detail);
    expect(result).toContain("**Author:** bob");
  });

  it("formats an external skill with source-specific fields", () => {
    const detail = makeDetail({
      source: "clawhub",
      slug: "ext-skill",
      title: "External Skill",
      description: "From ClawHub",
      security_status: null,
      ap_security_status: "warn",
      source_url: "https://clawhub.ai/dev/ext-skill",
      source_downloads: 200,
      source_installs: 150,
      download_count: null,
      author_display_name: "extdev",
    });

    const result = formatSkillDetail(detail);
    expect(result).toContain("**Source:** clawhub");
    expect(result).toContain("**Security:** Passed with warnings");
    expect(result).toContain("**Source URL:** https://clawhub.ai/dev/ext-skill");
    expect(result).toContain("**Author:** extdev");
    expect(result).toContain("**Downloads:** 200");
  });

  it("shows -- for missing fields", () => {
    const detail = makeDetail({
      type: null,
      version: null,
      security_status: null,
      download_count: null,
    });

    const result = formatSkillDetail(detail);
    expect(result).toContain("**Type:** --");
    expect(result).toContain("**Version:** --");
    expect(result).toContain("**Security:** --");
    expect(result).toContain("**Downloads:** --");
  });

  it("includes long_description after separator", () => {
    const detail = makeDetail({
      long_description: "This is a detailed explanation.",
    });

    const result = formatSkillDetail(detail);
    expect(result).toContain("---");
    expect(result).toContain("This is a detailed explanation.");
  });
});
