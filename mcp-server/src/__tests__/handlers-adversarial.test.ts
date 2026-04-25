/**
 * Adversarial tests for handler-level logic that requires mocking.
 *
 * Covers: input bounds, format validation, whitelist enforcement.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import type { Mock } from "vitest";

vi.mock("../api-client.js", async (importOriginal) => {
  const original = await importOriginal<typeof import("../api-client.js")>();
  return {
    ...original,
    apiGet: vi.fn(),
    apiPost: vi.fn(),
    recordInstallation: vi.fn(),
  };
});

vi.mock("../auth.js", () => ({
  loadAuthToken: vi.fn(() => null),
}));

vi.mock("../installer.js", async (importOriginal) => {
  const original = await importOriginal<typeof import("../installer.js")>();
  return {
    ...original,
    downloadAndExtract: vi.fn(async () => "/fake/install/dir"),
  };
});

import { apiGet } from "../api-client.js";
import {
  handleSearchMarketplace,
  handleCheckPurchaseStatus,
  handleInstallSkill,
} from "../handlers.js";

beforeEach(() => {
  vi.clearAllMocks();
});

// ---------- max_results bounds ----------

describe("max_results bounds", () => {
  it("clamps max_results above 100 down to 100", async () => {
    (apiGet as Mock).mockResolvedValueOnce({ agentpowers: { items: [], total: 0 } });
    await handleSearchMarketplace({ max_results: 999999 });
    expect(apiGet).toHaveBeenCalledWith(
      "/v1/search",
      expect.objectContaining({ limit: 100 }),
    );
  });

  it("clamps negative max_results to 1", async () => {
    (apiGet as Mock).mockResolvedValueOnce({ agentpowers: { items: [], total: 0 } });
    await handleSearchMarketplace({ max_results: -5 });
    expect(apiGet).toHaveBeenCalledWith(
      "/v1/search",
      expect.objectContaining({ limit: 1 }),
    );
  });

  it("passes valid max_results unchanged", async () => {
    (apiGet as Mock).mockResolvedValueOnce({ agentpowers: { items: [], total: 0 } });
    await handleSearchMarketplace({ max_results: 5 });
    expect(apiGet).toHaveBeenCalledWith(
      "/v1/search",
      expect.objectContaining({ limit: 5 }),
    );
  });

  it("clamps NaN max_results to 1", async () => {
    (apiGet as Mock).mockResolvedValueOnce({ agentpowers: { items: [], total: 0 } });
    await handleSearchMarketplace({ max_results: "not-a-number" });
    expect(apiGet).toHaveBeenCalledWith(
      "/v1/search",
      expect.objectContaining({ limit: 1 }),
    );
  });
});

// ---------- purchase_id validation ----------

describe("purchase_id validation", () => {
  it("rejects empty purchase_id", async () => {
    const result = await handleCheckPurchaseStatus({ purchase_id: "" });
    expect(result).toContain("Invalid purchase ID");
  });

  it("rejects purchase_id with path traversal chars", async () => {
    const result = await handleCheckPurchaseStatus({ purchase_id: "../../etc" });
    expect(result).toContain("Invalid purchase ID");
  });

  it("rejects extremely long purchase_id", async () => {
    const result = await handleCheckPurchaseStatus({ purchase_id: "a".repeat(500) });
    expect(result).toContain("Invalid purchase ID");
  });

  it("rejects purchase_id with special characters", async () => {
    const result = await handleCheckPurchaseStatus({ purchase_id: "abc<script>alert(1)" });
    expect(result).toContain("Invalid purchase ID");
  });
});

// ---------- targetTool whitelist ----------

describe("targetTool whitelist", () => {
  it("rejects unknown target_tool with path traversal", async () => {
    const result = await handleInstallSkill({ slug: "valid-skill", target_tool: "../../evil" });
    expect(result).toContain("Unsupported target tool");
  });

  it("defaults empty string target_tool to claude-code (not rejected)", async () => {
    (apiGet as Mock).mockResolvedValueOnce({
      title: "Test", slug: "valid-skill", price_cents: 0,
      security_status: "pass", type: "skill", source: "agentpowers", version: "1.0.0",
    });
    (apiGet as Mock).mockResolvedValueOnce({
      url: "https://example.com/pkg.tar.gz", slug: "valid-skill",
    });
    const result = await handleInstallSkill({ slug: "valid-skill", target_tool: "" });
    expect(result).not.toContain("Unsupported target tool");
  });

  it("rejects made-up tool name", async () => {
    const result = await handleInstallSkill({ slug: "valid-skill", target_tool: "notepad" });
    expect(result).toContain("Unsupported target tool");
  });

  it("lists supported tools in rejection message", async () => {
    const result = await handleInstallSkill({ slug: "valid-skill", target_tool: "fake" });
    expect(result).toContain("claude-code");
    expect(result).toContain("gemini");
  });

  it("accepts claude-code (reaches API call)", async () => {
    (apiGet as Mock).mockResolvedValueOnce({
      title: "Test", slug: "valid-skill", price_cents: 0,
      security_status: "pass", type: "skill", source: "agentpowers", version: "1.0.0",
    });
    (apiGet as Mock).mockResolvedValueOnce({
      url: "https://example.com/pkg.tar.gz", slug: "valid-skill",
    });
    const result = await handleInstallSkill({ slug: "valid-skill", target_tool: "claude-code" });
    // Should NOT contain "Unsupported target tool" -- it proceeds past validation
    expect(result).not.toContain("Unsupported target tool");
  });
});
