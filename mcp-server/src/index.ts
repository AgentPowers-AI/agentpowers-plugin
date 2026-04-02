#!/usr/bin/env node
/** AgentPowers MCP server — marketplace tools for Claude Code/Cowork. */

import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";
import type { Tool } from "@modelcontextprotocol/sdk/types.js";
import { APIError, NetworkError, formatAPIError } from "./api-client.js";
import {
  handleSearchMarketplace,
  handleGetSkillDetails,
  handleInstallSkill,
  handleCheckPurchaseStatus,
  handleCheckInstalled,
  handleUninstallSkill,
  handleCheckForUpdates,
} from "./handlers.js";

// Re-export formatters for tests (backward compat)
export {
  formatPrice,
  formatSecurityOutcome,
  formatTrustLevel,
  formatSearchResults,
  formatSkillDetail,
} from "./formatters.js";

// ---------- Tool definitions ----------

const TOOLS: Tool[] = [
  {
    name: "search_marketplace",
    description:
      "Search the AgentPowers marketplace for skills and agents. Returns matching results with names, descriptions, prices, and security ratings.",
    inputSchema: {
      type: "object" as const,
      properties: {
        query: {
          type: "string",
          description: "Search query text (optional)",
        },
        category: {
          type: "string",
          description: "Filter by category (optional)",
        },
        type: {
          type: "string",
          enum: ["skill", "agent"],
          description: "Filter by type: skill or agent (optional)",
        },
        max_results: {
          type: "number",
          description: "Maximum number of results (default: 10)",
        },
      },
    },
  },
  {
    name: "get_skill_details",
    description:
      "Get detailed information about a specific skill or agent by its slug. Works for both AgentPowers native and external (ClawHub) skills. Includes price, security status, trust level, supported platforms, and version info.",
    inputSchema: {
      type: "object" as const,
      properties: {
        slug: {
          type: "string",
          description: "The unique slug identifier for the skill or agent",
        },
        source: {
          type: "string",
          description: "Filter to a specific source (e.g. 'agentpowers', 'clawhub'). Optional — omit to search all sources.",
        },
      },
      required: ["slug"],
    },
  },
  {
    name: "install_skill",
    description:
      "Download and install a skill or agent from the marketplace. Checks security status before installing.",
    inputSchema: {
      type: "object" as const,
      properties: {
        slug: {
          type: "string",
          description: "The unique slug identifier for the skill or agent to install",
        },
        target_tool: {
          type: "string",
          description:
            "Target AI tool to install for (e.g. claude-code, claude-desktop, codex, gemini, kiro). Default: claude-code.",
        },
      },
      required: ["slug"],
    },
  },
  {
    name: "check_purchase_status",
    description:
      "Check the status of a purchase. Requires authentication. Returns payment status and license code if completed.",
    inputSchema: {
      type: "object" as const,
      properties: {
        purchase_id: {
          type: "string",
          description: "The purchase ID to check",
        },
      },
      required: ["purchase_id"],
    },
  },
  {
    name: "check_installed",
    description:
      "List all installed skills and agents with their version, source, security status, and whether they have been locally edited.",
    inputSchema: {
      type: "object" as const,
      properties: {},
    },
  },
  {
    name: "uninstall_skill",
    description:
      "Remove an installed skill or agent. Deletes the skill directory and removes its version pin.",
    inputSchema: {
      type: "object" as const,
      properties: {
        slug: {
          type: "string",
          description: "The slug of the skill or agent to uninstall",
        },
      },
      required: ["slug"],
    },
  },
  {
    name: "check_for_updates",
    description:
      "Check if any installed skills or agents have newer versions available. Reports which are up to date, which have updates, and which have been locally edited.",
    inputSchema: {
      type: "object" as const,
      properties: {},
    },
  },
];

// ---------- Server setup ----------

function getVersion(): string {
  try {
    const __dirname = dirname(fileURLToPath(import.meta.url));
    const pkg = JSON.parse(readFileSync(join(__dirname, "..", "package.json"), "utf-8"));
    return pkg.version ?? "0.1.0";
  } catch {
    return "0.1.0";
  }
}

const server = new Server(
  {
    name: "agentpowers",
    version: getVersion(),
  },
  {
    capabilities: {
      tools: {},
    },
  },
);

server.setRequestHandler(ListToolsRequestSchema, async () => ({
  tools: TOOLS,
}));

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;
  const toolArgs = (args ?? {}) as Record<string, unknown>;

  try {
    let text: string;

    switch (name) {
      case "search_marketplace":
        text = await handleSearchMarketplace(toolArgs);
        break;
      case "get_skill_details":
        text = await handleGetSkillDetails(toolArgs);
        break;
      case "install_skill":
        text = await handleInstallSkill(toolArgs);
        break;
      case "check_purchase_status":
        text = await handleCheckPurchaseStatus(toolArgs);
        break;
      case "check_installed":
        text = await handleCheckInstalled();
        break;
      case "uninstall_skill":
        text = await handleUninstallSkill(toolArgs);
        break;
      case "check_for_updates":
        text = await handleCheckForUpdates();
        break;
      default:
        return {
          content: [{ type: "text", text: `Unknown tool: ${name}` }],
          isError: true,
        };
    }

    return { content: [{ type: "text", text }] };
  } catch (error) {
    // User-friendly error messages matching CLI behavior
    if (error instanceof APIError) {
      return {
        content: [{ type: "text", text: formatAPIError(error) }],
        isError: true,
      };
    }
    if (error instanceof NetworkError) {
      return {
        content: [{ type: "text", text: error.message }],
        isError: true,
      };
    }
    const message =
      error instanceof Error ? error.message : "An unknown error occurred";
    return {
      content: [{ type: "text", text: `Error: ${message}` }],
      isError: true,
    };
  }
});

async function main(): Promise<void> {
  const transport = new StdioServerTransport();
  await server.connect(transport);
}

main().catch((error: unknown) => {
  console.error("Server failed to start:", error);
  process.exit(1);
});
