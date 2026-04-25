/**
 * Tests for index.ts — the MCP server entry point.
 * Covers: getVersion fallback, ListTools, CallTool dispatch for all tools,
 * error wrapping (APIError, NetworkError, unknown Error), and unknown tool.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock all handler functions
vi.mock("../handlers.js", () => ({
  handleSearchMarketplace: vi.fn().mockResolvedValue("search result"),
  handleGetSkillDetails: vi.fn().mockResolvedValue("detail result"),
  handleInstallSkill: vi.fn().mockResolvedValue("install result"),
  handleCheckPurchaseStatus: vi.fn().mockResolvedValue("purchase result"),
  handleCheckInstalled: vi.fn().mockResolvedValue("installed result"),
  handleUninstallSkill: vi.fn().mockResolvedValue("uninstall result"),
  handleCheckForUpdates: vi.fn().mockResolvedValue("updates result"),
}));

// Mock the MCP SDK to capture server behavior
const mockSetRequestHandler = vi.fn();
const mockConnect = vi.fn().mockResolvedValue(undefined);

vi.mock("@modelcontextprotocol/sdk/server/index.js", () => ({
  Server: vi.fn().mockImplementation(() => ({
    setRequestHandler: mockSetRequestHandler,
    connect: mockConnect,
  })),
}));

vi.mock("@modelcontextprotocol/sdk/server/stdio.js", () => ({
  StdioServerTransport: vi.fn(),
}));

vi.mock("@modelcontextprotocol/sdk/types.js", () => ({
  CallToolRequestSchema: "CallToolRequestSchema",
  ListToolsRequestSchema: "ListToolsRequestSchema",
}));

// Mock fs.readFileSync for getVersion
vi.mock("node:fs", async (importOriginal) => {
  const actual = await importOriginal<typeof import("node:fs")>();
  return {
    ...actual,
    readFileSync: vi.fn().mockImplementation((path: string, encoding?: string) => {
      if (typeof path === "string" && path.includes("package.json")) {
        return JSON.stringify({ version: "1.2.3" });
      }
      return actual.readFileSync(path, encoding as BufferEncoding);
    }),
  };
});

import {
  handleSearchMarketplace,
  handleGetSkillDetails,
  handleInstallSkill,
  handleCheckPurchaseStatus,
  handleCheckInstalled,
  handleUninstallSkill,
  handleCheckForUpdates,
} from "../handlers.js";
import { APIError, NetworkError } from "../api-client.js";

// Import index.ts to trigger module-level code (server setup, handlers)
// This must come AFTER all mocks
await import("../index.js");

// Extract the registered handlers
let listToolsHandler: (() => Promise<{ tools: unknown[] }>) | undefined;
let callToolHandler:
  | ((req: { params: { name: string; arguments?: Record<string, unknown> } }) => Promise<{
      content: { type: string; text: string }[];
      isError?: boolean;
    }>)
  | undefined;

for (const call of mockSetRequestHandler.mock.calls) {
  if (call[0] === "ListToolsRequestSchema") {
    listToolsHandler = call[1];
  }
  if (call[0] === "CallToolRequestSchema") {
    callToolHandler = call[1];
  }
}

beforeEach(() => {
  vi.clearAllMocks();
});

// ---------------------------------------------------------------------------
// ListTools
// ---------------------------------------------------------------------------

describe("ListTools handler", () => {
  it("returns all 12 tool definitions", async () => {
    expect(listToolsHandler).toBeDefined();
    const result = await listToolsHandler!();
    expect(result.tools).toHaveLength(12);

    const names = (result.tools as Array<{ name: string }>).map((t) => t.name);
    expect(names).toContain("search_marketplace");
    expect(names).toContain("get_skill_details");
    expect(names).toContain("install_skill");
    expect(names).toContain("check_purchase_status");
    expect(names).toContain("check_installed");
    expect(names).toContain("uninstall_skill");
    expect(names).toContain("check_for_updates");
    expect(names).toContain("get_categories");
    expect(names).toContain("get_skill_reviews");
    expect(names).toContain("start_checkout");
    expect(names).toContain("get_account_profile");
    expect(names).toContain("list_purchases");
  });
});

// ---------------------------------------------------------------------------
// CallTool dispatch
// ---------------------------------------------------------------------------

describe("CallTool handler — dispatch", () => {
  it("dispatches search_marketplace", async () => {
    const result = await callToolHandler!({
      params: { name: "search_marketplace", arguments: { query: "test" } },
    });
    expect(result.content[0].text).toBe("search result");
    expect(result.isError).toBeUndefined();
    expect(handleSearchMarketplace).toHaveBeenCalledWith({ query: "test" });
  });

  it("dispatches get_skill_details", async () => {
    const result = await callToolHandler!({
      params: { name: "get_skill_details", arguments: { slug: "my-skill" } },
    });
    expect(result.content[0].text).toBe("detail result");
    expect(handleGetSkillDetails).toHaveBeenCalledWith({ slug: "my-skill" });
  });

  it("dispatches install_skill", async () => {
    const result = await callToolHandler!({
      params: { name: "install_skill", arguments: { slug: "my-skill" } },
    });
    expect(result.content[0].text).toBe("install result");
    expect(handleInstallSkill).toHaveBeenCalledWith({ slug: "my-skill" });
  });

  it("dispatches check_purchase_status", async () => {
    const result = await callToolHandler!({
      params: {
        name: "check_purchase_status",
        arguments: { purchase_id: "p123" },
      },
    });
    expect(result.content[0].text).toBe("purchase result");
    expect(handleCheckPurchaseStatus).toHaveBeenCalledWith({
      purchase_id: "p123",
    });
  });

  it("dispatches check_installed", async () => {
    const result = await callToolHandler!({
      params: { name: "check_installed" },
    });
    expect(result.content[0].text).toBe("installed result");
    expect(handleCheckInstalled).toHaveBeenCalled();
  });

  it("dispatches uninstall_skill", async () => {
    const result = await callToolHandler!({
      params: { name: "uninstall_skill", arguments: { slug: "old-skill" } },
    });
    expect(result.content[0].text).toBe("uninstall result");
    expect(handleUninstallSkill).toHaveBeenCalledWith({ slug: "old-skill" });
  });

  it("dispatches check_for_updates", async () => {
    const result = await callToolHandler!({
      params: { name: "check_for_updates" },
    });
    expect(result.content[0].text).toBe("updates result");
    expect(handleCheckForUpdates).toHaveBeenCalled();
  });

  it("handles null arguments", async () => {
    const result = await callToolHandler!({
      params: { name: "check_installed", arguments: undefined },
    });
    expect(result.content[0].text).toBe("installed result");
  });
});

// ---------------------------------------------------------------------------
// Unknown tool
// ---------------------------------------------------------------------------

describe("CallTool handler — unknown tool", () => {
  it("returns isError for unknown tool name", async () => {
    const result = await callToolHandler!({
      params: { name: "nonexistent_tool" },
    });
    expect(result.content[0].text).toBe("Unknown tool: nonexistent_tool");
    expect(result.isError).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Error wrapping
// ---------------------------------------------------------------------------

describe("CallTool handler — error wrapping", () => {
  it("wraps APIError with formatAPIError", async () => {
    vi.mocked(handleSearchMarketplace).mockRejectedValueOnce(
      new APIError("Not found", 404),
    );

    const result = await callToolHandler!({
      params: { name: "search_marketplace", arguments: {} },
    });
    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain("Not found");
  });

  it("wraps NetworkError with its message", async () => {
    vi.mocked(handleSearchMarketplace).mockRejectedValueOnce(
      new NetworkError("Could not connect to AgentPowers API. Check your network connection."),
    );

    const result = await callToolHandler!({
      params: { name: "search_marketplace", arguments: {} },
    });
    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain("Could not connect");
  });

  it("wraps generic Error with 'Error: message'", async () => {
    vi.mocked(handleSearchMarketplace).mockRejectedValueOnce(
      new Error("Something went wrong"),
    );

    const result = await callToolHandler!({
      params: { name: "search_marketplace", arguments: {} },
    });
    expect(result.isError).toBe(true);
    expect(result.content[0].text).toBe("Error: Something went wrong");
  });

  it("wraps non-Error thrown values", async () => {
    vi.mocked(handleSearchMarketplace).mockRejectedValueOnce("string error");

    const result = await callToolHandler!({
      params: { name: "search_marketplace", arguments: {} },
    });
    expect(result.isError).toBe(true);
    expect(result.content[0].text).toBe("Error: An unknown error occurred");
  });
});
