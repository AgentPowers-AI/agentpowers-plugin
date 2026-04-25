/** MCP tool handler functions — business logic for each tool. */

import { readdirSync, rmSync, lstatSync, realpathSync } from "node:fs";
import { join, resolve } from "node:path";
import { homedir, hostname } from "node:os";
import { apiGet, APIError, recordInstallation } from "./api-client.js";
import { loadAuthToken } from "./auth.js";
import { hashDirectory, isDirectory } from "./content-hasher.js";
import { downloadAndExtract, getInstallDir, validateSlug, SUPPORTED_TOOLS } from "./installer.js";
import { loadPins, removePin } from "./pin-manager.js";
import { formatPrice, formatSearchResults, formatSkillDetail, formatSecurityOutcome } from "./formatters.js";
import type {
  SectionedSearchResponse,
  UnifiedDetail,
  DownloadResponse,
  PurchaseStatus,
  InstalledSkillInfo,
} from "./types.js";

export async function handleSearchMarketplace(
  args: Record<string, unknown>,
): Promise<string> {
  const params: Record<string, string | number | undefined> = {};
  if (args.query) params.q = String(args.query);
  if (args.category) params.category = String(args.category);
  if (args.type) params.type = String(args.type);
  if (args.max_results) {
    const n = Number(args.max_results);
    params.limit = Math.max(1, Math.min(100, Number.isNaN(n) ? 1 : n));
  }

  const data = await apiGet<SectionedSearchResponse>("/v1/search", params);
  return formatSearchResults(data);
}

export async function handleGetSkillDetails(
  args: Record<string, unknown>,
): Promise<string> {
  const slug = String(args.slug);
  if (!validateSlug(slug)) {
    return `Invalid slug "${slug}" — slugs must be lowercase alphanumeric with hyphens only.`;
  }
  const params: Record<string, string | undefined> = {};
  if (args.source) params.source = String(args.source);

  const detail = await apiGet<UnifiedDetail>(`/v1/detail/${slug}`, params);
  return formatSkillDetail(detail);
}

export async function handleInstallSkill(
  args: Record<string, unknown>,
): Promise<string> {
  const slug = String(args.slug);
  const targetTool = args.target_tool ? String(args.target_tool) : "claude-code";
  if (!validateSlug(slug)) {
    return `Invalid slug "${slug}" — slugs must be lowercase alphanumeric with hyphens only.`;
  }
  if (!SUPPORTED_TOOLS.has(targetTool)) {
    return `Unsupported target tool "${targetTool}". Supported: ${[...SUPPORTED_TOOLS].join(", ")}`;
  }

  // Use unified detail endpoint (works for native AND external)
  const detail = await apiGet<UnifiedDetail>(`/v1/detail/${slug}`);

  // Check security status (native or external)
  const secStatus = (detail.security_status ?? detail.ap_security_status ?? "").toUpperCase();
  if (secStatus === "BLOCK") {
    return `Cannot install "${detail.title}" — it has been blocked due to security issues.`;
  }

  // For paid skills, require auth
  const auth = detail.price_cents > 0 ? loadAuthToken() : null;

  if (detail.price_cents > 0 && !auth) {
    return `"${detail.title}" costs ${formatPrice(detail.price_cents)}. Run \`npx @agentpowers/cli login\` first, then purchase it.`;
  }

  try {
    // Call the download endpoint — it enforces purchase checks server-side
    const download = await apiGet<DownloadResponse>(
      `/v1/skills/${slug}/download`,
      undefined,
      auth,
    );

    const type = detail.type === "agent" ? "agent" : "skill";
    const secStatus = detail.security_status ?? detail.ap_security_status ?? "pass";
    const result = await downloadAndExtract(
      download.url,
      slug,
      type,
      detail.source,
      detail.version,
      secStatus,
      targetTool,
    );

    // Fire-and-forget installation tracking (never awaited for errors)
    void recordInstallation(
      slug,
      "mcp",
      detail.source ?? "agentpowers",
      hostname(),
      auth,
    );

    return `Installed "${detail.title}" to ${result.installDir}`;
  } catch (error) {
    if (error instanceof APIError && error.statusCode === 403) {
      if (detail.price_cents > 0) {
        return `"${detail.title}" costs ${formatPrice(detail.price_cents)}. Purchase it first, then use install_skill again.`;
      }
      return `Cannot download "${detail.title}" — access denied.`;
    }
    throw error;
  }
}

/** Purchase IDs must be hex/hyphens, 8-64 chars (UUIDs, Stripe IDs, etc.). */
const PURCHASE_ID_RE = /^[a-f0-9-]{8,64}$/i;

export async function handleCheckPurchaseStatus(
  args: Record<string, unknown>,
): Promise<string> {
  const purchaseId = args.purchase_id != null ? String(args.purchase_id) : "";
  if (!purchaseId || !PURCHASE_ID_RE.test(purchaseId)) {
    return `Invalid purchase ID "${purchaseId}".`;
  }
  const auth = loadAuthToken();

  if (!auth) {
    return "Not authenticated. Run `npx @agentpowers/cli login` first.";
  }

  const status = await apiGet<PurchaseStatus>(
    `/v1/purchases/${encodeURIComponent(purchaseId)}/status`,
    undefined,
    auth,
  );

  const lines = [
    `**Purchase:** ${status.purchase_id}`,
    `**Skill:** ${status.skill_slug}`,
    `**Status:** ${status.status}`,
  ];

  if (status.license_code) {
    lines.push(`**License Code:** ${status.license_code}`);
  }

  return lines.join("\n");
}

// ---------- New tools: check_installed, uninstall_skill, check_for_updates ----------

/** Scan ~/.claude/{skills,agents}/ directories and cross-reference pins.json. */
export function getInstalledSkills(): InstalledSkillInfo[] {
  const pins = loadPins();
  const claudeDir = join(homedir(), ".claude");
  const results: InstalledSkillInfo[] = [];

  // Track which slugs we've already processed (from pins with type field)
  const seen = new Set<string>();

  for (const installType of ["skill", "agent"] as const) {
    const base = installType === "skill" ? "skills" : "agents";
    const dir = join(claudeDir, base);
    if (!isDirectory(dir)) continue;

    let entries: string[];
    try {
      entries = readdirSync(dir);
    } catch {
      continue;
    }

    for (const slug of entries) {
      if (seen.has(slug)) continue;
      const fullPath = join(dir, slug);
      if (!isDirectory(fullPath)) continue;

      const pin = pins[slug];
      let isEdited = false;

      if (pin) {
        const currentHash = hashDirectory(fullPath);
        isEdited = currentHash !== pin.content_hash;
      }

      // Use pin type if available, otherwise infer from directory
      const resolvedType = pin?.type ?? installType;

      seen.add(slug);
      results.push({
        slug,
        source: pin?.source ?? "unknown",
        version: pin?.version ?? null,
        security_status: pin?.security_status ?? "unknown",
        install_type: resolvedType === "agent" ? "agent" : "skill",
        is_edited: isEdited,
      });
    }
  }

  return results;
}

export async function handleCheckInstalled(): Promise<string> {
  const installed = getInstalledSkills();

  if (installed.length === 0) {
    return "No skills or agents installed.";
  }

  const lines = [`# Installed Skills & Agents (${installed.length})\n`];

  for (const item of installed) {
    const editTag = item.is_edited ? " (edited)" : "";
    const secLabel = item.security_status !== "unknown"
      ? formatSecurityOutcome(item.security_status)
      : "--";
    lines.push(`## \`${item.slug}\`${editTag}`);
    lines.push(`- **Type:** ${item.install_type}`);
    lines.push(`- **Source:** ${item.source}`);
    lines.push(`- **Version:** ${item.version ?? "--"}`);
    lines.push(`- **Security:** ${secLabel}`);
    lines.push("");
  }

  return lines.join("\n");
}

export async function handleUninstallSkill(
  args: Record<string, unknown>,
): Promise<string> {
  const slug = String(args.slug);
  if (!validateSlug(slug)) {
    return `Invalid slug "${slug}" — slugs must be lowercase alphanumeric with hyphens only.`;
  }

  // Try to find the skill in either skills or agents directory
  for (const type of ["skill", "agent"] as const) {
    const installDir = getInstallDir(slug, type);
    if (isDirectory(installDir)) {
      // Guard against symlink traversal: the real path of the install dir
      // must be inside its expected parent directory (e.g., ~/.claude/skills/).
      const expectedParent = resolve(installDir, "..");
      try {
        const realPath = realpathSync(installDir);
        const realParent = realpathSync(expectedParent);
        if (!realPath.startsWith(realParent)) {
          return `Refusing to delete "${slug}" — it is a symlink pointing outside its install directory.`;
        }
      } catch {
        // realpathSync fails if target doesn't exist — safe to delete the dangling link
      }
      rmSync(installDir, { recursive: true, force: true });
      removePin(slug);
      return `Uninstalled "${slug}" from ${installDir}`;
    }
  }

  return `"${slug}" is not installed.`;
}

export async function handleCheckForUpdates(): Promise<string> {
  const installed = getInstalledSkills();

  if (installed.length === 0) {
    return "No skills or agents installed.";
  }

  const updates: string[] = [];
  const upToDate: string[] = [];
  const errors: string[] = [];

  for (const item of installed) {
    if (item.source === "unknown") {
      // No pin — can't check for updates
      errors.push(`\`${item.slug}\`: No pin data — reinstall to enable update checking.`);
      continue;
    }

    try {
      const params: Record<string, string | undefined> = {};
      if (item.source !== "agentpowers") params.source = item.source;

      const detail = await apiGet<UnifiedDetail>(`/v1/detail/${item.slug}`, params);
      const latestVersion = detail.version;

      if (latestVersion && item.version && latestVersion !== item.version) {
        const editTag = item.is_edited ? " **(locally edited)**" : "";
        updates.push(
          `\`${item.slug}\`: ${item.version} → ${latestVersion}${editTag}`,
        );
      } else {
        upToDate.push(item.slug);
      }
    } catch (err) {
      if (err instanceof APIError && err.statusCode === 404) {
        errors.push(`\`${item.slug}\`: Not found on server (may have been unpublished).`);
      } else {
        errors.push(`\`${item.slug}\`: Could not check — ${err instanceof Error ? err.message : "unknown error"}`);
      }
    }
  }

  const lines: string[] = [];

  if (updates.length > 0) {
    lines.push(`# Updates Available (${updates.length})\n`);
    for (const u of updates) lines.push(`- ${u}`);
    lines.push("\nUse `npx @agentpowers/cli update` in your terminal to install updates.");
  }

  if (upToDate.length > 0) {
    lines.push(`\n# Up to Date (${upToDate.length})\n`);
    lines.push(upToDate.map((s) => `\`${s}\``).join(", "));
  }

  if (errors.length > 0) {
    lines.push(`\n# Could Not Check (${errors.length})\n`);
    for (const e of errors) lines.push(`- ${e}`);
  }

  if (updates.length === 0 && errors.length === 0) {
    return "All installed skills are up to date.";
  }

  return lines.join("\n");
}
