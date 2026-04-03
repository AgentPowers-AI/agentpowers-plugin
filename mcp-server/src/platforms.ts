/** Platform constants, install targets, and tool aliases. */

import type { PlatformInfo } from "./types.js";

export const INSTALL_TARGETS = [
  "codex",
  "claude-code",
  "claude-ai",
  "claude-cowork",
  "cursor",
  "windsurf",
  "antigravity",
  "gemini-cli",
  "github-copilot",
  "opencode",
  "openclaw",
  "kiro",
] as const;

export const INSTALL_TARGET_SET = new Set<string>(INSTALL_TARGETS);
export const INSTALL_TARGETS_WITH_ALL = ["all", ...INSTALL_TARGETS] as const;
export const CLI_PRIMARY_SUPPORTED_TOOLS = new Set(["codex", "claude-code"]);

export const TOOL_ALIASES: Record<string, string> = {
  codex: "codex",
  claude: "claude-code",
  "claude-code": "claude-code",
  "claude-ai": "claude-ai",
  "claude-cowork": "claude-cowork",
  "claude-desktop": "claude-cowork",
  cursor: "cursor",
  windsurf: "windsurf",
  antigravity: "antigravity",
  gemini: "gemini-cli",
  "gemini-cli": "gemini-cli",
  copilot: "github-copilot",
  "github-copilot": "github-copilot",
  "open-code": "opencode",
  opencode: "opencode",
  openclaw: "openclaw",
  kiro: "kiro",
};

export const PLATFORMS: PlatformInfo[] = [
  { slug: "claude-code", name: "Claude Code", tagline: "Anthropic terminal-native coding assistant" },
  { slug: "claude-cowork", name: "Claude Desktop", tagline: "Anthropic desktop agent for workflows" },
  { slug: "claude-ai", name: "claude.ai", tagline: "Anthropic web-based Claude interface" },
  { slug: "cursor", name: "Cursor", tagline: "AI-first code editor" },
  { slug: "codex", name: "Codex", tagline: "OpenAI autonomous coding agent" },
  { slug: "windsurf", name: "Windsurf", tagline: "AI coding editor by Codeium" },
  { slug: "antigravity", name: "Antigravity", tagline: "AI development platform" },
  { slug: "gemini-cli", name: "Gemini CLI", tagline: "Google CLI-based coding agent" },
  { slug: "github-copilot", name: "GitHub Copilot", tagline: "GitHub AI coding assistant" },
  { slug: "openclaw", name: "OpenClaw", tagline: "Open-source AI agent platform" },
  { slug: "opencode", name: "OpenCode", tagline: "Open-source terminal AI coding agent" },
  { slug: "kiro", name: "Kiro", tagline: "AWS AI-powered development environment" },
];

export const SITE_ORIGIN =
  process.env.AGENTPOWERS_SITE_ORIGIN || "https://agentpowers.ai";

export const OPENAPI_URL =
  process.env.AGENTPOWERS_OPENAPI_URL || "https://docs.agentpowers.ai/openapi.json";

function normalizeToolKey(value: string): string {
  return String(value || "").trim().toLowerCase().replace(/[_.\s]+/g, "-");
}

export function resolveTargetTool(
  value: string | undefined,
  defaultTool = "claude-code",
  allowAll = false,
): string {
  const fallback = allowAll ? "all" : defaultTool;
  const normalized = normalizeToolKey(value || fallback);
  if (allowAll && normalized === "all") return "all";

  const mapped = TOOL_ALIASES[normalized] || normalized;
  if (!INSTALL_TARGET_SET.has(mapped)) {
    const supported = INSTALL_TARGETS.join(", ");
    const suffix = allowAll ? ", all" : "";
    throw new Error(
      `Unknown target_tool '${value}'. Supported tools: ${supported}${suffix}.`,
    );
  }
  return mapped;
}

export function toolConfigDirName(tool: string): string {
  if (tool === "claude-code") return ".claude";
  return `.${tool}`;
}
