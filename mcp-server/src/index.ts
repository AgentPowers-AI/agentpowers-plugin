#!/usr/bin/env node
/** AgentPowers MCP server -- marketplace tools for Claude Code/Cowork. */

import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
  ListResourcesRequestSchema,
  ReadResourceRequestSchema,
  ListPromptsRequestSchema,
  GetPromptRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";
import type { Tool } from "@modelcontextprotocol/sdk/types.js";
import { APIError, NetworkError, formatAPIError } from "./api-client.js";
import { INSTALL_TARGETS, INSTALL_TARGETS_WITH_ALL } from "./platforms.js";
import {
  handleSearchMarketplace,
  handleGetSkillDetails,
  handleInstallSkill,
  handleCheckPurchaseStatus,
  handleCheckInstalled,
  handleUninstallSkill,
  handleCheckForUpdates,
  // New discovery tools
  handleGetSellerProfile,
  handleGetSecurityResults,
  handleGetMarketplaceSnapshot,
  handleGetPlatforms,
  handleGetOpenApiSummary,
  // Account tools
  handleLoginAccount,
  handleLogoutAccount,
  handleWhoamiAccount,
  // Purchase tools
  handleConfirmPurchaseSession,
  handleDownloadPurchasedSkill,
  handleInstallPurchasedSkill,
  // Self-update
  handleCheckPluginVersion,
} from "./handlers.js";
import {
  handleGetCategories,
  handleGetSkillReviews,
  handleStartCheckout,
  handleGetAccountProfile,
  handleListPurchases,
} from "./handlers-commerce.js";

// Re-export formatters for tests (backward compat)
export {
  formatPrice,
  formatSecurityOutcome,
  formatTrustLevel,
  formatSearchResults,
  formatSkillDetail,
} from "./formatters.js";

// ---------- Version ----------

function getVersion(): string {
  try {
    const __dirname = dirname(fileURLToPath(import.meta.url));
    const pkg = JSON.parse(readFileSync(join(__dirname, "..", "package.json"), "utf-8"));
    return pkg.version ?? "0.1.0";
  } catch {
    return "0.1.0";
  }
}

const SERVER_VERSION = getVersion();

// ---------- Tool definitions ----------

const TOOLS: Tool[] = [
  // --- Marketplace & Search ---
  {
    name: "search_marketplace",
    description:
      "Search the AgentPowers marketplace for skills and agents. Returns matching results with names, descriptions, prices, and security ratings.",
    inputSchema: {
      type: "object" as const,
      properties: {
        query: { type: "string", description: "Search query text (optional)" },
        category: { type: "string", description: "Filter by category (optional)" },
        type: { type: "string", enum: ["skill", "agent"], description: "Filter by type: skill or agent (optional)" },
        max_results: { type: "number", description: "Maximum number of results (default: 10)" },
      },
    },
  },
  {
    name: "search_skills",
    description: "Compatibility alias for search_marketplace.",
    inputSchema: {
      type: "object" as const,
      properties: {
        query: { type: "string" },
        category: { type: "string" },
        type: { type: "string", enum: ["skill", "agent"] },
        max_results: { type: "number" },
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
        slug: { type: "string", description: "The unique slug identifier for the skill or agent" },
        source: { type: "string", description: "Filter to a specific source (e.g. 'agentpowers', 'clawhub'). Optional." },
      },
      required: ["slug"],
    },
  },
  {
    name: "get_categories",
    description:
      "List all skill categories in the AgentPowers marketplace with skill counts. Useful for browsing and filtering.",
    inputSchema: {
      type: "object" as const,
      properties: {},
    },
  },
  {
    name: "get_seller_profile",
    description: "Get seller public profile and published skills.",
    inputSchema: {
      type: "object" as const,
      properties: {
        seller_slug: { type: "string", description: "The seller's slug identifier" },
      },
      required: ["seller_slug"],
    },
  },
  {
    name: "get_skill_reviews",
    description:
      "Get user reviews for a skill or agent. Returns ratings, review text, and authors.",
    inputSchema: {
      type: "object" as const,
      properties: {
        slug: {
          type: "string",
          description: "The unique slug identifier for the skill or agent",
        },
      },
      required: ["slug"],
    },
  },
  {
    name: "get_security_results",
    description: "Get security scan results for a skill slug.",
    inputSchema: {
      type: "object" as const,
      properties: {
        skill_slug: { type: "string", description: "The skill slug to check" },
      },
      required: ["skill_slug"],
    },
  },
  {
    name: "get_marketplace_snapshot",
    description: "Get API/account snapshot for quick health checks.",
    inputSchema: { type: "object" as const, properties: {} },
  },
  {
    name: "get_platforms",
    description: "List AI platforms supported by AgentPowers.",
    inputSchema: { type: "object" as const, properties: {} },
  },
  {
    name: "get_openapi_summary",
    description: "Summarize the AgentPowers OpenAPI spec.",
    inputSchema: { type: "object" as const, properties: {} },
  },

  // --- Account ---
  {
    name: "login_account",
    description: "Run browser-based AgentPowers login (equivalent to `ap login`).",
    inputSchema: {
      type: "object" as const,
      properties: {
        timeout_sec: { type: "number", description: "Login timeout in seconds (default 240)" },
      },
    },
  },
  {
    name: "logout_account",
    description: "Log out from AgentPowers account (equivalent to `ap logout`).",
    inputSchema: { type: "object" as const, properties: {} },
  },
  {
    name: "whoami_account",
    description: "Show current account identity from CLI and API.",
    inputSchema: { type: "object" as const, properties: {} },
  },
  {
    name: "get_account_profile",
    description:
      "Get your AgentPowers account profile. Requires authentication via `npx @agentpowers/cli login`.",
    inputSchema: {
      type: "object" as const,
      properties: {},
    },
  },

  // --- Purchases ---
  {
    name: "list_purchases",
    description:
      "List your purchased skills with license codes and status. Requires authentication.",
    inputSchema: {
      type: "object" as const,
      properties: {
        max_results: {
          type: "number",
          description: "Maximum number of results (default: 20)",
        },
      },
    },
  },
  {
    name: "start_checkout",
    description:
      "Start a purchase for a paid skill. Returns a checkout URL to complete payment in the browser. Free skills do not need checkout — use install_skill directly.",
    inputSchema: {
      type: "object" as const,
      properties: {
        slug: {
          type: "string",
          description: "The slug of the skill to purchase",
        },
      },
      required: ["slug"],
    },
  },
  {
    name: "check_purchase_status",
    description:
      "Check purchase status by purchase_id/session_id; optionally wait and auto-install on completion.",
    inputSchema: {
      type: "object" as const,
      properties: {
        purchase_id: { type: "string" },
        session_id: { type: "string" },
        wait_for_completion: { type: "boolean" },
        timeout_sec: { type: "number" },
        poll_interval_sec: { type: "number" },
        auto_install: { type: "boolean" },
        include_download_url: { type: "boolean", description: "When session_id is provided and status is completed, also fetch download URL." },
        target_tool: { type: "string", enum: [...INSTALL_TARGETS] },
        source: { type: "string" },
      },
    },
  },
  {
    name: "confirm_purchase_session",
    description:
      "Frontend-style purchase confirmation by Stripe session_id with optional download URL and auto-install.",
    inputSchema: {
      type: "object" as const,
      properties: {
        session_id: { type: "string" },
        wait_for_completion: { type: "boolean" },
        timeout_sec: { type: "number" },
        poll_interval_sec: { type: "number" },
        include_download_url: { type: "boolean" },
        auto_open_browser: { type: "boolean", description: "Open download URL in browser when available (default false)." },
        auto_install: { type: "boolean" },
        target_tool: { type: "string", enum: [...INSTALL_TARGETS] },
        source: { type: "string" },
        global: { type: "boolean" },
      },
      required: ["session_id"],
    },
  },
  {
    name: "download_purchased_skill",
    description: "Get purchased-skill package download URL by checkout session_id, and optionally open it.",
    inputSchema: {
      type: "object" as const,
      properties: {
        session_id: { type: "string" },
        auto_open_browser: { type: "boolean", description: "Open download URL in browser (default true)." },
      },
      required: ["session_id"],
    },
  },

  // --- Install / Manage ---
  {
    name: "install_skill",
    description:
      "Install a skill with full automation: free install, paid checkout, polling, and final install.",
    inputSchema: {
      type: "object" as const,
      properties: {
        slug: { type: "string", description: "The skill slug to install" },
        target_tool: { type: "string", enum: [...INSTALL_TARGETS], description: "Target AI tool (default: claude-code)" },
        source: { type: "string", description: "Optional external source" },
        license_code: { type: "string", description: "Optional explicit license code" },
        auto_open_browser: { type: "boolean" },
        wait_for_completion: { type: "boolean" },
        timeout_sec: { type: "number" },
        poll_interval_sec: { type: "number" },
        global: { type: "boolean", description: "Force global install location" },
      },
      required: ["slug"],
    },
  },
  {
    name: "install_purchased_skill",
    description: "Install a previously purchased skill using session_id, purchase_id, or skill_slug.",
    inputSchema: {
      type: "object" as const,
      properties: {
        session_id: { type: "string" },
        purchase_id: { type: "string" },
        skill_slug: { type: "string" },
        license_code: { type: "string" },
        target_tool: { type: "string", enum: [...INSTALL_TARGETS] },
        source: { type: "string" },
      },
    },
  },
  {
    name: "check_installed",
    description:
      "List installed skills/agents across all tool roots, with version/source/edit signal.",
    inputSchema: {
      type: "object" as const,
      properties: {
        target_tool: { type: "string", enum: [...INSTALL_TARGETS_WITH_ALL], description: "Filter by tool (default: all)" },
      },
    },
  },
  {
    name: "uninstall_skill",
    description:
      "Uninstall a skill/agent from tool locations and remove pin metadata.",
    inputSchema: {
      type: "object" as const,
      properties: {
        slug: { type: "string", description: "The slug to uninstall" },
        target_tool: { type: "string", enum: [...INSTALL_TARGETS_WITH_ALL], description: "Target tool or 'all' (default: claude-code)" },
      },
      required: ["slug"],
    },
  },
  {
    name: "check_for_updates",
    description:
      "Check installed marketplace skills for newer versions without applying updates.",
    inputSchema: {
      type: "object" as const,
      properties: {
        target_tool: { type: "string", enum: [...INSTALL_TARGETS_WITH_ALL] },
      },
    },
  },
  {
    name: "check_plugin_version",
    description: "Check if a newer version of the AgentPowers plugin is available on npm.",
    inputSchema: { type: "object" as const, properties: {} },
  },
];

// ---------- Resource definitions ----------

const RESOURCE_DEFS = [
  {
    uri: "agentpowers://marketplace/snapshot",
    name: "marketplace_snapshot",
    description: "Live API/account snapshot for marketplace integration.",
    mimeType: "text/plain",
  },
  {
    uri: "agentpowers://account/purchases",
    name: "purchase_snapshot",
    description: "Current purchase list (requires auth).",
    mimeType: "text/plain",
  },
  {
    uri: "agentpowers://docs/openapi-summary",
    name: "openapi_summary",
    description: "Summary of the AgentPowers OpenAPI schema.",
    mimeType: "text/plain",
  },
  {
    uri: "agentpowers://plugin/version",
    name: "plugin_version",
    description: "Current plugin version and whether an update is available.",
    mimeType: "text/plain",
  },
];

// ---------- Prompt definitions ----------

const PROMPT_DEFS = [
  {
    name: "find_skill_for_task",
    description: "Find and compare the best marketplace skill for a task.",
    arguments: [
      { name: "task", required: true, description: "Task the user wants to solve." },
    ],
  },
  {
    name: "buy_and_install_skill",
    description: "Run full login -> checkout -> install workflow for a paid skill.",
    arguments: [
      { name: "slug", required: true, description: "Skill slug to purchase and install." },
      { name: "tool", required: false, description: "Target tool, default claude-code." },
    ],
  },
];

function makePromptMessages(name: string, args: Record<string, string> = {}) {
  if (name === "buy_and_install_skill") {
    const slug = args.slug || "<skill-slug>";
    const tool = args.tool || "claude-code";
    return [
      {
        role: "user" as const,
        content: {
          type: "text" as const,
          text: [
            `Help me buy and install ${slug} for ${tool}.`,
            "",
            "Please do this sequence:",
            "1. Run whoami_account (or login_account if needed)",
            "2. Run install_skill with wait_for_completion=true and target_tool set",
            "3. If checkout is still pending, run check_purchase_status until completed",
            "4. Confirm install path and command output",
          ].join("\n"),
        },
      },
    ];
  }

  const task = args.task || "the user request";
  return [
    {
      role: "user" as const,
      content: {
        type: "text" as const,
        text: [
          `I need the best AgentPowers marketplace skill for: ${task}`,
          "",
          "Please:",
          "1. Use search_marketplace",
          "2. Use get_skill_details on top candidates",
          "3. Use get_skill_reviews and get_security_results",
          "4. Recommend one skill and provide install command",
        ].join("\n"),
      },
    },
  ];
}

// ---------- Server setup ----------

const server = new Server(
  { name: "agentpowers", version: SERVER_VERSION },
  { capabilities: { tools: {}, resources: {}, prompts: {} } },
);

// --- tools/list ---
server.setRequestHandler(ListToolsRequestSchema, async () => ({
  tools: TOOLS,
}));

// --- tools/call ---
server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;
  const toolArgs = (args ?? {}) as Record<string, unknown>;

  try {
    let text: string;

    switch (name) {
      // Search & Discovery
      case "search_marketplace":
      case "search_skills":
        text = await handleSearchMarketplace(toolArgs);
        break;
      case "get_skill_details":
        text = await handleGetSkillDetails(toolArgs);
        break;
      case "get_categories":
        text = await handleGetCategories();
        break;
      case "get_seller_profile":
        text = await handleGetSellerProfile(toolArgs);
        break;
      case "get_skill_reviews":
        text = await handleGetSkillReviews(toolArgs);
        break;
      case "get_security_results":
        text = await handleGetSecurityResults(toolArgs);
        break;
      case "get_marketplace_snapshot":
        text = await handleGetMarketplaceSnapshot();
        break;
      case "get_platforms":
        text = handleGetPlatforms();
        break;
      case "get_openapi_summary":
        text = await handleGetOpenApiSummary();
        break;

      // Account
      case "login_account":
        text = await handleLoginAccount(toolArgs);
        break;
      case "logout_account":
        text = await handleLogoutAccount();
        break;
      case "whoami_account":
        text = await handleWhoamiAccount();
        break;
      case "get_account_profile":
        text = await handleGetAccountProfile();
        break;

      // Purchases
      case "list_purchases":
        text = await handleListPurchases(toolArgs);
        break;
      case "start_checkout":
        text = await handleStartCheckout(toolArgs);
        break;
      case "check_purchase_status":
        text = await handleCheckPurchaseStatus(toolArgs);
        break;
      case "confirm_purchase_session":
        text = await handleConfirmPurchaseSession(toolArgs);
        break;
      case "download_purchased_skill":
        text = await handleDownloadPurchasedSkill(toolArgs);
        break;

      // Install / Manage
      case "install_skill":
        text = await handleInstallSkill(toolArgs);
        break;
      case "install_purchased_skill":
        text = await handleInstallPurchasedSkill(toolArgs);
        break;
      case "check_installed":
        text = await handleCheckInstalled(toolArgs);
        break;
      case "uninstall_skill":
        text = await handleUninstallSkill(toolArgs);
        break;
      case "check_for_updates":
        text = await handleCheckForUpdates(toolArgs);
        break;

      // Self-update
      case "check_plugin_version":
        text = await handleCheckPluginVersion(SERVER_VERSION);
        break;

      default:
        return {
          content: [{ type: "text", text: `Unknown tool: ${name}` }],
          isError: true,
        };
    }

    return { content: [{ type: "text", text }] };
  } catch (error) {
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
    const message = error instanceof Error ? error.message : "An unknown error occurred";
    return {
      content: [{ type: "text", text: `Error: ${message}` }],
      isError: true,
    };
  }
});

// --- resources/list ---
server.setRequestHandler(ListResourcesRequestSchema, async () => ({
  resources: RESOURCE_DEFS,
}));

// --- resources/read ---
server.setRequestHandler(ReadResourceRequestSchema, async (request) => {
  const uri = String(request.params.uri || "");
  let text: string;

  if (uri === "agentpowers://marketplace/snapshot") {
    text = await handleGetMarketplaceSnapshot();
  } else if (uri === "agentpowers://account/purchases") {
    text = await handleListPurchases({ limit: 100 });
  } else if (uri === "agentpowers://docs/openapi-summary") {
    text = await handleGetOpenApiSummary();
  } else if (uri === "agentpowers://plugin/version") {
    text = await handleCheckPluginVersion(SERVER_VERSION);
  } else {
    throw new Error(`Unknown resource URI: ${uri}`);
  }

  return {
    contents: [{ uri, mimeType: "text/plain", text }],
  };
});

// --- prompts/list ---
server.setRequestHandler(ListPromptsRequestSchema, async () => ({
  prompts: PROMPT_DEFS,
}));

// --- prompts/get ---
server.setRequestHandler(GetPromptRequestSchema, async (request) => {
  const promptName = String(request.params.name || "");
  if (!PROMPT_DEFS.some((p) => p.name === promptName)) {
    throw new Error(`Unknown prompt: ${promptName}`);
  }
  return {
    messages: makePromptMessages(promptName, (request.params.arguments ?? {}) as Record<string, string>),
  };
});

// ---------- Start ----------

async function main(): Promise<void> {
  const transport = new StdioServerTransport();
  await server.connect(transport);
}

main().catch((error: unknown) => {
  console.error("Server failed to start:", error);
  process.exit(1);
});
