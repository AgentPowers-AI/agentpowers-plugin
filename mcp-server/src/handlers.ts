/** MCP tool handler functions -- business logic for each tool. */

import { readdirSync, rmSync, lstatSync, realpathSync, existsSync, statSync, cpSync, mkdirSync } from "node:fs";
import { join, resolve, dirname } from "node:path";
import { homedir, hostname } from "node:os";
import { apiGet, apiPost, apiRoot, fetchUrl, APIError, API_BASE, recordInstallation } from "./api-client.js";
import { loadAuthToken } from "./auth.js";
import { hashDirectory, isDirectory } from "./content-hasher.js";
import { downloadAndExtract, getInstallDir, validateSlug } from "./installer.js";
import { loadPins, removePin } from "./pin-manager.js";
import { formatPrice, formatSearchResults, formatSkillDetail, formatSecurityOutcome } from "./formatters.js";
import { ensureApAvailable, runAp, formatCommandResult, openInBrowser } from "./cli-runner.js";
import { rememberCheckout } from "./plugin-state.js";
import {
  INSTALL_TARGETS,
  INSTALL_TARGET_SET,
  CLI_PRIMARY_SUPPORTED_TOOLS,
  PLATFORMS,
  SITE_ORIGIN,
  OPENAPI_URL,
  resolveTargetTool,
  toolConfigDirName,
} from "./platforms.js";
import type {
  SectionedSearchResponse,
  UnifiedDetail,
  DownloadResponse,
  PurchaseStatus,
  InstalledSkillInfo,
  CategoriesResponse,
  SellerProfile,
  ReviewsResponse,
  SecurityResults,
  HealthResponse,
  SkillsListResponse,
  SellersListResponse,
  AuthMeResponse,
  AccountProfile,
  PurchasesResponse,
  Purchase,
  CheckoutResponse,
  DownloadPurchasedResponse,
} from "./types.js";

// ---------------------------------------------------------------------------
// Utility helpers
// ---------------------------------------------------------------------------

function toBool(value: unknown, defaultValue = false): boolean {
  if (typeof value === "boolean") return value;
  if (typeof value === "string") {
    const v = value.trim().toLowerCase();
    if (["1", "true", "yes", "y", "on"].includes(v)) return true;
    if (["0", "false", "no", "n", "off"].includes(v)) return false;
  }
  if (typeof value === "number") return value !== 0;
  return defaultValue;
}

function toNumber(value: unknown, defaultValue: number): number {
  const n = Number(value);
  return Number.isFinite(n) ? n : defaultValue;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function asArray<T>(value: unknown): T[] {
  return Array.isArray(value) ? value : [];
}

// ---------------------------------------------------------------------------
// Auth helpers
// ---------------------------------------------------------------------------

async function ensureAuthenticated(): Promise<void> {
  const token = loadAuthToken();
  if (!token) {
    throw new Error("Not authenticated. Run login_account (or `ap login`) first.");
  }
  try {
    await apiGet<AuthMeResponse>("/v1/auth/me", undefined, token);
  } catch (error) {
    throw new Error(
      `Authentication failed. Run login_account again. (${error instanceof Error ? error.message : String(error)})`,
    );
  }
}

// ---------------------------------------------------------------------------
// Install helpers (multi-platform support ported from extension)
// ---------------------------------------------------------------------------

function getGlobalToolRoot(tool: string): string {
  return join(homedir(), toolConfigDirName(tool));
}

function getToolInstallEntries(tool: string, slug: string): { kind: string; install_path: string }[] {
  const root = getGlobalToolRoot(tool);
  const entries: { kind: string; install_path: string }[] = [];

  for (const kind of ["skills", "agents"]) {
    const installPath = join(root, kind, slug);
    try {
      if (existsSync(installPath) && statSync(installPath).isDirectory()) {
        entries.push({ kind, install_path: installPath });
      }
    } catch {
      // Ignore unreadable paths
    }
  }
  return entries;
}

function isUnknownToolInstallError(output: string): boolean {
  const normalized = String(output || "").toLowerCase();
  return normalized.includes("unknown tool") || normalized.includes("invalid value for '--for'");
}

function isTransientInstallError(output: string): boolean {
  const normalized = String(output || "").toLowerCase();
  return (
    normalized.includes("timed out") ||
    normalized.includes("timeout") ||
    normalized.includes("connection reset") ||
    normalized.includes("temporarily unavailable")
  );
}

async function installViaMirrorFallback(
  slug: string,
  licenseCode: string | null,
  targetTool: string,
  options: Record<string, unknown> = {},
): Promise<string> {
  const source = String(options.source || "").trim();
  const globalInstall = toBool(options.global, false);
  const timeoutMs = Math.max(30_000, toNumber(options.timeout_ms, 300_000));
  const bridgeTool = "claude-code";

  const beforeEntries = getToolInstallEntries(bridgeTool, slug);
  const bridgeArgs = ["install", slug, "--for", bridgeTool];
  if (licenseCode) bridgeArgs.push("--code", licenseCode);
  if (source) bridgeArgs.push("--source", source);
  if (globalInstall) bridgeArgs.push("--global");

  const retryAttempts = Math.max(1, Math.min(3, toNumber(options.fallback_retry_attempts, 2)));
  let bridgeResult = null;
  let bridgeOutput = "";
  let attempt = 0;

  while (attempt < retryAttempts) {
    attempt += 1;
    bridgeResult = await runAp(bridgeArgs, { timeoutMs });
    bridgeOutput = formatCommandResult(bridgeResult);

    if (bridgeResult.code === 0) break;
    if (attempt >= retryAttempts || !isTransientInstallError(bridgeOutput)) {
      throw new Error(`Install fallback failed while installing for '${bridgeTool}'.\n\n${bridgeOutput}`);
    }
    await sleep(1500);
  }

  const afterEntries = getToolInstallEntries(bridgeTool, slug);
  if (!afterEntries.length) {
    throw new Error(`Install fallback could not locate ${slug} under ${getGlobalToolRoot(bridgeTool)} after install.`);
  }

  const beforeSet = new Set(beforeEntries.map((e) => e.install_path));
  const freshEntries = afterEntries.filter((e) => !beforeSet.has(e.install_path));
  const entriesToCopy = freshEntries.length ? freshEntries : afterEntries;

  const targetRoot = getGlobalToolRoot(targetTool);
  const mirroredPaths: string[] = [];
  for (const entry of entriesToCopy) {
    const targetPath = join(targetRoot, entry.kind, slug);
    if (existsSync(targetPath)) rmSync(targetPath, { recursive: true, force: true });
    mkdirSync(dirname(targetPath), { recursive: true });
    cpSync(entry.install_path, targetPath, { recursive: true });
    mirroredPaths.push(targetPath);
  }

  for (const entry of freshEntries) {
    if (!existsSync(entry.install_path)) continue;
    rmSync(entry.install_path, { recursive: true, force: true });
  }

  return [
    `Compatibility install fallback used for target_tool='${targetTool}'.`,
    `Mirrored ${slug} from '${bridgeTool}' into '${targetTool}' paths:`,
    ...mirroredPaths.map((p) => `- ${p}`),
  ].join("\n");
}

function buildInstallCommand(
  skillSlug: string,
  licenseCode: string | null,
  options: Record<string, unknown> = {},
): string {
  const targetTool = resolveTargetTool(
    String(options.target_tool || options.for_tool || "claude-code"),
    "claude-code",
    false,
  );
  const source = String(options.source || "").trim();
  const globalInstall = toBool(options.global, false);

  const parts = ["ap", "install", skillSlug];
  if (licenseCode) parts.push("--code", licenseCode);
  parts.push("--for", targetTool);
  if (source) parts.push("--source", source);
  if (globalInstall) parts.push("--global");
  return parts.join(" ");
}

async function runInstallWithLicense(
  slug: string,
  licenseCode: string | null,
  options: Record<string, unknown> = {},
): Promise<string> {
  await ensureApAvailable();

  const targetTool = resolveTargetTool(
    String(options.target_tool || options.for_tool || process.env.AGENTPOWERS_DEFAULT_TOOL || "claude-code"),
    "claude-code",
    false,
  );
  const source = String(options.source || "").trim();
  const globalInstall = toBool(options.global, false);

  const args = ["install", slug, "--for", targetTool];
  if (licenseCode) args.push("--code", licenseCode);
  if (source) args.push("--source", source);
  if (globalInstall) args.push("--global");

  const result = await runAp(args, {
    timeoutMs: Math.max(30_000, toNumber(options.timeout_ms, 300_000)),
  });
  const output = formatCommandResult(result);

  if (result.code !== 0) {
    if (!CLI_PRIMARY_SUPPORTED_TOOLS.has(targetTool) && isUnknownToolInstallError(output)) {
      return await installViaMirrorFallback(slug, licenseCode, targetTool, options);
    }
    throw new Error(`Install failed.\n\n${output}`);
  }
  return output;
}

// ---------------------------------------------------------------------------
// Installed entries (multi-platform)
// ---------------------------------------------------------------------------

function getInstallRoots(): { tool: string; scope: string; root: string }[] {
  const roots = INSTALL_TARGETS.map((tool) => ({
    tool,
    scope: "global",
    root: join(homedir(), toolConfigDirName(tool)),
  }));

  const projectClaude = join(process.cwd(), ".claude");
  if (existsSync(projectClaude)) {
    roots.push({ tool: "claude-code", scope: "project", root: projectClaude });
  }
  return roots;
}

interface InstalledEntry {
  slug: string;
  type: string;
  tool: string;
  scope: string;
  install_path: string;
  source: string;
  version: string | null;
  security_status: string | null;
  installed_at: string | null;
  edited: boolean | null;
}

function collectInstalledEntries(options: { includeHashCheck?: boolean } = {}): InstalledEntry[] {
  const includeHashCheck = options.includeHashCheck ?? true;
  const pins = loadPins();
  const roots = getInstallRoots();
  const entries: InstalledEntry[] = [];

  for (const root of roots) {
    for (const kind of ["skills", "agents"]) {
      const dirPath = join(root.root, kind);
      if (!existsSync(dirPath) || !isDirectory(dirPath)) continue;

      let slugs: string[];
      try {
        slugs = readdirSync(dirPath, { withFileTypes: true })
          .filter((e) => e.isDirectory())
          .map((e) => e.name)
          .sort();
      } catch { continue; }

      for (const slug of slugs) {
        const installPath = join(dirPath, slug);
        const pin = pins[slug] ?? null;
        let edited: boolean | null = null;

        if (includeHashCheck && pin && typeof pin.content_hash === "string") {
          try {
            const currentHash = hashDirectory(installPath);
            edited = currentHash !== pin.content_hash;
          } catch { edited = null; }
        }

        entries.push({
          slug,
          type: kind === "agents" ? "agent" : "skill",
          tool: root.tool,
          scope: root.scope,
          install_path: installPath,
          source: pin?.source ?? "local",
          version: pin?.version ?? null,
          security_status: pin?.security_status ?? null,
          installed_at: pin?.installed_at ?? null,
          edited,
        });
      }
    }
  }
  return entries;
}

function formatInstalledEntries(entries: InstalledEntry[]): string {
  if (!entries.length) return "No installed skills or agents found across configured tool roots.";

  const lines: string[] = [`Installed items: ${entries.length}`, ""];
  for (const item of entries) {
    const version = item.version || "-";
    const security = item.security_status || "-";
    const edited = item.edited === null ? "unknown" : item.edited ? "yes" : "no";
    lines.push(
      `- ${item.slug} (${item.type}) | tool=${item.tool} (${item.scope}) | source=${item.source} | version=${version} | security=${security} | edited=${edited}`,
    );
    lines.push(`  path: ${item.install_path}`);
  }
  return lines.join("\n");
}

function compareSemver(installed: string, latest: string): number | null {
  const parse = (v: string) => String(v || "").split(".").map(Number);
  const a = parse(installed);
  const b = parse(latest);
  if (a.some((x) => Number.isNaN(x)) || b.some((x) => Number.isNaN(x))) return null;
  const len = Math.max(a.length, b.length);
  for (let i = 0; i < len; i++) {
    const ai = a[i] || 0;
    const bi = b[i] || 0;
    if (ai < bi) return -1;
    if (ai > bi) return 1;
  }
  return 0;
}

// ---------------------------------------------------------------------------
// Purchase polling
// ---------------------------------------------------------------------------

async function pollPurchaseStatus(args: Record<string, unknown>): Promise<PurchaseStatus & { purchased_at?: string }> {
  const purchaseId = String(args.purchase_id || "").trim();
  const sessionId = String(args.session_id || "").trim();

  if (!purchaseId && !sessionId) {
    throw new Error("Provide purchase_id or session_id.");
  }

  if (!sessionId) {
    await ensureAuthenticated();
  }

  const waitForCompletion = toBool(args.wait_for_completion, false);
  const timeoutSec = Math.max(10, Math.min(1800, toNumber(args.timeout_sec, 300)));
  const pollSec = Math.max(2, Math.min(30, toNumber(args.poll_interval_sec, 5)));
  const started = Date.now();
  const auth = loadAuthToken();

  async function readStatus() {
    if (sessionId) {
      return apiGet<PurchaseStatus & { purchased_at?: string }>(
        `/v1/purchases/confirm`,
        { session_id: sessionId },
      );
    }
    return apiGet<PurchaseStatus & { purchased_at?: string }>(
      `/v1/purchases/${purchaseId}/status`,
      undefined,
      auth,
    );
  }

  let status = await readStatus();

  while (waitForCompletion && String(status.status || "").toLowerCase() === "pending") {
    if ((Date.now() - started) / 1000 >= timeoutSec) break;
    await sleep(pollSec * 1000);
    status = await readStatus();
  }

  if (status.purchase_id) {
    rememberCheckout({
      purchase_id: status.purchase_id,
      slug: status.skill_slug,
      status: status.status,
      license_code: status.license_code ?? null,
      purchased_at: status.purchased_at ?? null,
    });
  }

  return status;
}

// ---------------------------------------------------------------------------
// Checkout creation
// ---------------------------------------------------------------------------

async function createCheckout(slug: string, options: Record<string, unknown> = {}): Promise<CheckoutResponse> {
  await ensureAuthenticated();
  const auth = loadAuthToken()!;

  const successUrl = String(options.success_url || `${SITE_ORIGIN}/purchase/success`).trim();
  const cancelUrl = String(options.cancel_url || `${SITE_ORIGIN}/skills/${slug}`).trim();

  const checkout = await apiPost<CheckoutResponse>(
    "/v1/checkout",
    { skill_slug: slug, success_url: successUrl, cancel_url: cancelUrl },
    auth,
  );

  rememberCheckout({
    purchase_id: checkout.purchase_id,
    slug,
    checkout_url: checkout.checkout_url,
    status: checkout.status || "pending",
    created_at: new Date().toISOString(),
  });

  return checkout;
}

// ===========================================================================
// EXISTING HANDLERS (preserved)
// ===========================================================================

export async function handleSearchMarketplace(
  args: Record<string, unknown>,
): Promise<string> {
  const params: Record<string, string | number | undefined> = {};
  if (args.query) params.q = String(args.query);
  if (args.category) params.category = String(args.category);
  if (args.type) params.type = String(args.type);
  if (args.max_results) params.limit = Number(args.max_results);

  const data = await apiGet<SectionedSearchResponse>("/v1/search", params);
  return formatSearchResults(data);
}

export async function handleGetSkillDetails(
  args: Record<string, unknown>,
): Promise<string> {
  const slug = String(args.slug);
  if (!validateSlug(slug)) {
    return `Invalid slug "${slug}" -- slugs must be lowercase alphanumeric with hyphens only.`;
  }
  const params: Record<string, string | undefined> = {};
  if (args.source) params.source = String(args.source);

  const detail = await apiGet<UnifiedDetail>(`/v1/detail/${slug}`, params);
  return formatSkillDetail(detail);
}

export async function handleInstallSkill(
  args: Record<string, unknown>,
): Promise<string> {
  const slug = String(args.slug || "").trim();
  if (!slug) return "Missing required argument: slug";
  if (!validateSlug(slug)) {
    return `Invalid slug "${slug}" -- slugs must be lowercase alphanumeric with hyphens only.`;
  }

  const source = String(args.source || "").trim();
  const explicitCode = String(args.license_code || "").trim();

  // If explicit license code provided, install directly via CLI
  if (explicitCode) {
    const output = await runInstallWithLicense(slug, explicitCode, args);
    return `Installed ${slug} with provided license code.\n\n${output}`;
  }

  const qs = source ? `?source=${encodeURIComponent(source)}` : "";
  const detail = await apiGet<UnifiedDetail>(`/v1/detail/${encodeURIComponent(slug)}${qs}`);
  const priceCents = Number(detail.price_cents || 0);

  // Free skill: install via CLI
  if (priceCents <= 0) {
    const output = await runInstallWithLicense(slug, null, args);
    return `Installed free skill ${slug}.\n\n${output}`;
  }

  // Paid skill: check for existing purchase
  await ensureAuthenticated();
  const auth = loadAuthToken()!;

  const purchasesRaw = await apiGet<PurchasesResponse>("/v1/purchases", undefined, auth);
  const existing = asArray<Purchase>(purchasesRaw.items)
    .filter((item) => item.skill_slug === slug && String(item.status || "").toLowerCase() === "completed" && item.license_code)
    .sort((a, b) => String(b.purchased_at || "").localeCompare(String(a.purchased_at || "")));

  if (existing[0]?.license_code) {
    const output = await runInstallWithLicense(slug, existing[0].license_code, args);
    return `Skill ${slug} is already purchased. Installed using saved license.\n\n${output}`;
  }

  // No existing purchase: create checkout
  const checkout = await createCheckout(slug, args);
  const autoOpen = toBool(args.auto_open_browser, true);
  const waitForCompletion = toBool(args.wait_for_completion, true);

  const lines = [
    `Created checkout for paid skill ${slug}.`,
    `purchase_id: ${checkout.purchase_id}`,
    `checkout_url: ${checkout.checkout_url}`,
  ];

  if (autoOpen && checkout.checkout_url) {
    const openResult = await openInBrowser(checkout.checkout_url);
    lines.push(openResult.ok
      ? `Opened browser with: ${openResult.command}`
      : `Could not auto-open browser. Open manually: ${checkout.checkout_url}`);
  }

  if (!waitForCompletion) {
    lines.push("Payment not polled. Run check_purchase_status with the purchase_id after checkout.");
    return lines.join("\n");
  }

  const status = await pollPurchaseStatus({
    purchase_id: checkout.purchase_id,
    wait_for_completion: true,
    timeout_sec: args.timeout_sec,
    poll_interval_sec: args.poll_interval_sec,
  });

  lines.push(`Final status: ${status.status || "unknown"}`);

  if (String(status.status || "").toLowerCase() === "completed" && status.license_code) {
    try {
      const installOutput = await runInstallWithLicense(slug, status.license_code, args);
      lines.push("Install completed:", installOutput);
    } catch (error) {
      lines.push(`Install failed after checkout: ${error instanceof Error ? error.message : String(error)}`);
    }
  } else {
    lines.push("Checkout not completed yet. Re-run check_purchase_status later.");
  }

  return lines.join("\n");
}

export async function handleCheckPurchaseStatus(
  args: Record<string, unknown>,
): Promise<string> {
  const status = await pollPurchaseStatus(args);
  const autoInstall = toBool(args.auto_install, false);
  const sessionId = String(args.session_id || "").trim();

  const lines = [
    `purchase_id: ${status.purchase_id || "-"}`,
    `skill_slug: ${status.skill_slug || "-"}`,
    `status: ${status.status || "unknown"}`,
    `license_code: ${status.license_code || "-"}`,
    `purchased_at: ${status.purchased_at || "-"}`,
  ];

  if (status.skill_slug && status.license_code) {
    lines.push(`install_command: ${buildInstallCommand(status.skill_slug, status.license_code, args)}`);
  }

  const includeDownloadUrl = toBool(args.include_download_url, false);
  if (includeDownloadUrl && sessionId && String(status.status || "").toLowerCase() === "completed") {
    try {
      const download = await apiGet<DownloadPurchasedResponse>(
        `/v1/purchases/download`,
        { session_id: sessionId },
      );
      const downloadUrl = download.url || download.download_url;
      lines.push(downloadUrl ? `download_url: ${downloadUrl}` : "download_url: unavailable");
    } catch (error) {
      lines.push(`download_url: unavailable (${error instanceof Error ? error.message : String(error)})`);
    }
  }

  if (autoInstall && String(status.status || "").toLowerCase() === "completed") {
    if (!status.skill_slug || !status.license_code) {
      lines.push("Auto-install skipped: missing skill_slug or license_code.");
    } else {
      try {
        const installOutput = await runInstallWithLicense(status.skill_slug, status.license_code, args);
        lines.push("", "Auto-install completed:", installOutput);
      } catch (error) {
        lines.push("", `Auto-install failed: ${error instanceof Error ? error.message : String(error)}`);
      }
    }
  }

  return lines.join("\n");
}

/** Scan installed entries across all tool roots. */
export function getInstalledSkills(): InstalledSkillInfo[] {
  const pins = loadPins();
  const claudeDir = join(homedir(), ".claude");
  const results: InstalledSkillInfo[] = [];
  const seen = new Set<string>();

  for (const installType of ["skill", "agent"] as const) {
    const base = installType === "skill" ? "skills" : "agents";
    const dir = join(claudeDir, base);
    if (!isDirectory(dir)) continue;

    let entries: string[];
    try { entries = readdirSync(dir); } catch { continue; }

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

export async function handleCheckInstalled(
  args: Record<string, unknown> = {},
): Promise<string> {
  const targetTool = resolveTargetTool(
    String(args.target_tool || args.for_tool || "all"),
    "all",
    true,
  );
  const entries = collectInstalledEntries({ includeHashCheck: true });
  const filtered = targetTool === "all" ? entries : entries.filter((e) => e.tool === targetTool);
  return formatInstalledEntries(filtered);
}

export async function handleUninstallSkill(
  args: Record<string, unknown>,
): Promise<string> {
  const slug = String(args.slug || "").trim();
  if (!slug) return "Missing required argument: slug";
  if (!validateSlug(slug)) {
    return `Invalid slug "${slug}" -- slugs must be lowercase alphanumeric with hyphens only.`;
  }

  const targetTool = resolveTargetTool(
    String(args.target_tool || args.for_tool || "claude-code"),
    "claude-code",
    true,
  );
  const removed: string[] = [];

  const selectedTools = targetTool === "all" ? [...INSTALL_TARGETS] : [targetTool];
  const toolRoots = selectedTools.map((tool) => join(homedir(), toolConfigDirName(tool)));

  if (selectedTools.includes("claude-code")) {
    const projectClaude = join(process.cwd(), ".claude");
    if (existsSync(projectClaude)) toolRoots.push(projectClaude);
  }

  for (const root of toolRoots) {
    for (const kind of ["skills", "agents"]) {
      const dirPath = join(root, kind, slug);
      if (existsSync(dirPath)) {
        rmSync(dirPath, { recursive: true, force: true });
        removed.push(dirPath);
      }
    }
  }

  const pinRemoved = removePin(slug);

  if (!removed.length && !pinRemoved) {
    return `No installation found for ${slug} in target_tool=${targetTool}.`;
  }

  const lines = [`Uninstalled ${slug}.`];
  if (removed.length) {
    lines.push("Removed paths:");
    for (const p of removed) lines.push(`- ${p}`);
  }
  lines.push(`Pin removed: ${pinRemoved ? "yes" : "no"}`);
  return lines.join("\n");
}

export async function handleCheckForUpdates(
  args: Record<string, unknown> = {},
): Promise<string> {
  const targetTool = resolveTargetTool(
    String(args.target_tool || args.for_tool || "all"),
    "all",
    true,
  );
  const entries = collectInstalledEntries({ includeHashCheck: true });
  const filtered = targetTool === "all" ? entries : entries.filter((e) => e.tool === targetTool);

  if (!filtered.length) return "No installed skills/agents found to check for updates.";

  const bySlug = new Map<string, InstalledEntry>();
  for (const entry of filtered) {
    if (!bySlug.has(entry.slug)) bySlug.set(entry.slug, entry);
  }

  const outdated: { slug: string; source: string; installed: string; latest: string; edited: boolean | null }[] = [];
  const upToDate: { slug: string; source: string; installed: string; edited: boolean | null }[] = [];
  const unknown: { slug: string; reason: string; source: string }[] = [];

  for (const entry of bySlug.values()) {
    const source = String(entry.source || "local").toLowerCase();
    const installedVersion = entry.version;

    if (!installedVersion || source === "local") {
      unknown.push({ slug: entry.slug, reason: "No pinned marketplace version/source", source });
      continue;
    }

    try {
      const qs = source !== "agentpowers" ? `?source=${encodeURIComponent(source)}` : "";
      const detail = await apiGet<UnifiedDetail>(`/v1/detail/${encodeURIComponent(entry.slug)}${qs}`);
      const latestVersion = detail.version || null;

      if (!latestVersion) {
        unknown.push({ slug: entry.slug, reason: "Latest version unavailable", source });
        continue;
      }

      const cmp = compareSemver(installedVersion, latestVersion);
      if (cmp === null) {
        unknown.push({ slug: entry.slug, reason: `Cannot compare versions (${installedVersion} vs ${latestVersion})`, source });
      } else if (cmp < 0) {
        outdated.push({ slug: entry.slug, source, installed: installedVersion, latest: latestVersion, edited: entry.edited });
      } else {
        upToDate.push({ slug: entry.slug, source, installed: installedVersion, edited: entry.edited });
      }
    } catch (error) {
      unknown.push({ slug: entry.slug, reason: error instanceof Error ? error.message : String(error), source });
    }
  }

  const lines = [
    `Update check results (${targetTool}):`,
    `- Outdated: ${outdated.length}`,
    `- Up to date: ${upToDate.length}`,
    `- Unknown: ${unknown.length}`,
    "",
  ];

  if (outdated.length) {
    lines.push("## Outdated");
    for (const item of outdated) {
      const edited = item.edited === null ? "unknown" : item.edited ? "yes" : "no";
      lines.push(`- ${item.slug} (${item.source}) installed=${item.installed} latest=${item.latest} edited=${edited}`);
      lines.push(`  Suggested: ap update ${item.slug}`);
    }
    lines.push("");
  }

  if (upToDate.length) {
    lines.push("## Up to date");
    for (const item of upToDate) {
      const edited = item.edited === null ? "unknown" : item.edited ? "yes" : "no";
      lines.push(`- ${item.slug} (${item.source}) version=${item.installed} edited=${edited}`);
    }
    lines.push("");
  }

  if (unknown.length) {
    lines.push("## Unknown");
    for (const item of unknown) lines.push(`- ${item.slug} (${item.source}): ${item.reason}`);
  }

  return lines.join("\n");
}

// ===========================================================================
// NEW HANDLERS (ported from extension)
// ===========================================================================

// ---------- Discovery ----------

export async function handleGetCategories(): Promise<string> {
  const data = await apiGet<CategoriesResponse>("/v1/categories");
  const categories = asArray<CategoriesResponse["categories"][number]>(data.categories);
  if (!categories.length) return "No categories found.";

  const lines = [`${data.total_count ?? "Unknown"} skills across ${categories.length} categories:`, ""];
  for (const cat of categories) {
    const slug = cat.category || "-";
    const name = cat.name || slug;
    const count = cat.count ?? 0;
    const keywords = cat.sample_keywords || "-";
    lines.push(`- **${name}** (${slug}) -- ${count} skills`);
    lines.push(`  keywords: ${keywords}`);
  }
  return lines.join("\n");
}

export async function handleGetSellerProfile(args: Record<string, unknown>): Promise<string> {
  const sellerSlug = String(args.seller_slug || "").trim();
  if (!sellerSlug) return "Missing required argument: seller_slug";

  const seller = await apiGet<SellerProfile>(`/v1/sellers/${encodeURIComponent(sellerSlug)}`);
  const skills = asArray<SellerProfile["skills"][number]>(seller.skills);

  const lines = [
    `# ${seller.display_name || sellerSlug}`,
    seller.bio ? `\n${seller.bio}` : "",
    "",
    `**Verified:** ${seller.verified ? "yes" : "no"}`,
    `**Total skills:** ${seller.total_skills ?? 0}`,
    `**Total downloads:** ${seller.total_downloads ?? 0}`,
    `**Joined:** ${seller.joined_at || "Unknown"}`,
  ];

  if (seller.website_url) lines.push(`**Website:** ${seller.website_url}`);
  if (seller.github_url) lines.push(`**GitHub:** ${seller.github_url}`);
  if (seller.linkedin_url) lines.push(`**LinkedIn:** ${seller.linkedin_url}`);
  if (seller.twitter_url) lines.push(`**Twitter:** ${seller.twitter_url}`);

  if (skills.length) {
    lines.push("", "## Published skills");
    for (const skill of skills) {
      lines.push(`- **${skill.title || skill.slug}** (${skill.slug}) -- ${formatPrice(skill.price_cents)} | downloads=${skill.download_count ?? 0}`);
    }
  }

  lines.push("", `**Profile:** ${SITE_ORIGIN}/sellers/${sellerSlug}`);
  return lines.join("\n");
}

export async function handleGetSkillReviews(args: Record<string, unknown>): Promise<string> {
  const skillSlug = String(args.skill_slug || "").trim();
  if (!skillSlug) return "Missing required argument: skill_slug";

  const limit = Math.max(1, Math.min(50, toNumber(args.limit, 10)));
  const data = await apiGet<ReviewsResponse>(`/v1/skills/${encodeURIComponent(skillSlug)}/reviews`, { limit });
  const items = asArray<ReviewsResponse["items"][number]>(data.items);
  if (!items.length) return `No reviews yet for ${skillSlug}.`;

  const avg = items.reduce((acc, r) => acc + (Number(r.rating) || 0), 0) / items.length;
  const lines = [`Reviews for ${skillSlug} (${data.total ?? items.length}, avg ${avg.toFixed(1)}/5):`, ""];

  for (const review of items) {
    const rating = Number(review.rating) || 0;
    const stars = `${"*".repeat(Math.max(0, Math.min(5, rating)))}${"-".repeat(Math.max(0, 5 - rating))}`;
    lines.push(`- **${review.author_display_name || "Unknown"}** -- ${stars} (${rating}/5)`);
    lines.push(`  ${review.text || ""}`);
  }
  return lines.join("\n");
}

export async function handleGetSecurityResults(args: Record<string, unknown>): Promise<string> {
  const skillSlug = String(args.skill_slug || "").trim();
  if (!skillSlug) return "Missing required argument: skill_slug";

  const data = await apiGet<SecurityResults>(`/v1/security/results/${encodeURIComponent(skillSlug)}`);
  const findings = asArray<SecurityResults["findings"][number]>(data.findings);

  const lines = [
    `# Security results for ${data.slug || skillSlug}`,
    "",
    `**Status:** ${data.status || "unknown"}`,
    `**Score:** ${data.score ?? "n/a"}`,
    `**Trust level:** ${data.trust_level || "n/a"}`,
    "",
  ];

  if (!findings.length) {
    lines.push("No findings reported.");
  } else {
    lines.push("## Findings");
    for (const finding of findings) {
      if (typeof finding === "string") {
        lines.push(`- ${finding}`);
      } else if (finding && typeof finding === "object") {
        lines.push(`- ${finding.message || finding.detail || finding.title || JSON.stringify(finding)}`);
      } else {
        lines.push(`- ${String(finding)}`);
      }
    }
  }
  return lines.join("\n");
}

export async function handleGetMarketplaceSnapshot(): Promise<string> {
  const [health, skills, categories, sellers] = await Promise.all([
    apiRoot<HealthResponse>("/health"),
    apiGet<SkillsListResponse>("/v1/skills", { limit: 1 }),
    apiGet<CategoriesResponse>("/v1/categories"),
    apiGet<SellersListResponse>("/v1/sellers", { limit: 1 }),
  ]);

  let authState = "not logged in";
  const token = loadAuthToken();
  if (token) {
    try {
      const me = await apiGet<AuthMeResponse>("/v1/auth/me", undefined, token);
      authState = `logged in as ${me.email || me.name || "unknown"}`;
    } catch {
      authState = "token present but invalid/expired";
    }
  }

  const lines = [
    "AgentPowers marketplace snapshot",
    "",
    `- API base: ${API_BASE}`,
    `- Health: ${health.status || "unknown"} (version ${health.version || "-"})`,
    `- Skills total: ${skills.total ?? "unknown"}`,
    `- Categories: ${asArray(categories.categories).length}`,
    `- Sellers total: ${sellers.total ?? "unknown"}`,
    `- Account: ${authState}`,
  ];
  return lines.join("\n");
}

export function handleGetPlatforms(): string {
  const lines = PLATFORMS.map(
    (p) => `- **${p.name}** (${p.slug})\n  ${p.tagline}\n  ${SITE_ORIGIN}/tools/${p.slug}`,
  );
  return `AgentPowers supports ${PLATFORMS.length} AI platforms:\n\n${lines.join("\n\n")}`;
}

export async function handleGetOpenApiSummary(): Promise<string> {
  const spec = await fetchUrl<Record<string, unknown>>(OPENAPI_URL);
  const paths = spec && typeof spec.paths === "object" ? Object.keys(spec.paths as object) : [];
  const servers = spec && Array.isArray(spec.servers)
    ? (spec.servers as { url?: string }[]).map((s) => s.url).filter(Boolean)
    : [];
  const info = (spec.info || {}) as Record<string, unknown>;

  const lines = [
    "# AgentPowers OpenAPI summary",
    "",
    `- OpenAPI: ${spec.openapi || "-"}`,
    `- Title: ${info.title || "-"}`,
    `- Version: ${info.version || "-"}`,
    `- Servers: ${servers.length ? servers.join(", ") : "-"}`,
    `- Path count: ${paths.length}`,
    "",
    "## Sample paths",
    ...paths.slice(0, 12).map((p) => `- ${p}`),
    "",
    `Spec URL: ${OPENAPI_URL}`,
  ];
  return lines.join("\n");
}

// ---------- Account ----------

export async function handleLoginAccount(args: Record<string, unknown>): Promise<string> {
  await ensureApAvailable();
  const timeoutSec = Math.max(30, Math.min(900, toNumber(args.timeout_sec, 240)));

  const result = await runAp(["login"], { timeoutMs: timeoutSec * 1000 });
  const output = formatCommandResult(result);

  if (result.code !== 0) {
    throw new Error(`Login failed.\n\n${output}`);
  }

  let meLine = "";
  try {
    const token = loadAuthToken();
    if (token) {
      const me = await apiGet<AuthMeResponse>("/v1/auth/me", undefined, token);
      meLine = `\n\nAuthenticated as: ${me.email || me.name || "unknown"}`;
    }
  } catch {
    meLine = "\n\nLogin command completed, but account verification failed. Try whoami_account.";
  }

  return `Login completed.\n\n${output}${meLine}`;
}

export async function handleLogoutAccount(): Promise<string> {
  await ensureApAvailable();
  const result = await runAp(["logout"], { timeoutMs: 30_000 });
  const output = formatCommandResult(result);

  if (result.code !== 0) {
    throw new Error(`Logout failed.\n\n${output}`);
  }
  return `Logged out successfully.\n\n${output}`;
}

export async function handleWhoamiAccount(): Promise<string> {
  await ensureApAvailable();
  const cli = await runAp(["whoami"], { timeoutMs: 30_000 });
  const cliOutput = formatCommandResult(cli);

  let apiOutput = "Not authenticated via API token.";
  const token = loadAuthToken();
  if (token) {
    try {
      const me = await apiGet<AuthMeResponse>("/v1/auth/me", undefined, token);
      apiOutput = JSON.stringify(me, null, 2);
    } catch (error) {
      apiOutput = `Auth check failed: ${error instanceof Error ? error.message : String(error)}`;
    }
  }

  const lines = ["CLI whoami output:", cliOutput, "", "API /v1/auth/me output:", apiOutput];
  if (cli.code !== 0) {
    throw new Error(lines.join("\n"));
  }
  return lines.join("\n");
}

export async function handleGetAccountProfile(): Promise<string> {
  await ensureAuthenticated();
  const auth = loadAuthToken()!;
  const profile = await apiGet<AccountProfile>("/v1/users/profile", undefined, auth);

  const lines = [
    "# Account profile",
    "",
    `- Email: ${profile.email || "-"}`,
    `- Display name: ${profile.display_name || "-"}`,
    `- Seller slug: ${profile.display_name_slug || "-"}`,
    `- GitHub: ${profile.github_username || "-"}`,
    `- Joined: ${profile.joined_at || "-"}`,
    `- Account status: ${profile.account_status || "-"}`,
    `- Deletion scheduled at: ${profile.deletion_scheduled_at || "-"}`,
    "",
    "## Bio",
    profile.bio || "-",
  ];
  return lines.join("\n");
}

// ---------- Purchases ----------

function formatPurchases(purchases: Purchase[]): string {
  if (!purchases.length) return "No purchases found.";

  const lines = [`Purchases: ${purchases.length}`, ""];
  for (const p of purchases) {
    const amount = typeof p.amount_cents === "number" ? formatPrice(p.amount_cents) : "Unknown";
    lines.push(`- **${p.skill_title || p.skill_slug}** (${p.skill_slug})`);
    lines.push(`  status=${p.status} | amount=${amount} | purchased_at=${p.purchased_at || "-"}`);
    lines.push(`  purchase_id=${p.purchase_id}`);
    if (p.license_code) lines.push(`  license_code=${p.license_code}`);
    if (p.license_code) lines.push(`  install_cmd=ap install ${p.skill_slug} --code ${p.license_code} --for claude-code`);
  }
  return lines.join("\n");
}

export async function handleListPurchases(args: Record<string, unknown>): Promise<string> {
  await ensureAuthenticated();
  const auth = loadAuthToken()!;
  const statusFilter = String(args.status || "").trim().toLowerCase();
  const limit = Math.max(1, Math.min(200, toNumber(args.limit, 100)));

  const raw = await apiGet<PurchasesResponse>("/v1/purchases", undefined, auth);
  let items = asArray<Purchase>(raw.items);

  if (statusFilter) {
    items = items.filter((item) => String(item.status || "").toLowerCase() === statusFilter);
  }

  items.sort((a, b) => String(b.purchased_at || "").localeCompare(String(a.purchased_at || "")));
  items = items.slice(0, limit);

  return formatPurchases(items);
}

export async function handleStartCheckout(args: Record<string, unknown>): Promise<string> {
  const slug = String(args.slug || "").trim();
  if (!slug) return "Missing required argument: slug";

  const checkout = await createCheckout(slug, args);
  const autoOpen = toBool(args.auto_open_browser, true);

  let browserLine = "";
  if (autoOpen && checkout.checkout_url) {
    const openResult = await openInBrowser(checkout.checkout_url);
    browserLine = openResult.ok
      ? `Opened browser with: ${openResult.command}`
      : `Could not auto-open browser. Open manually: ${checkout.checkout_url}`;
  }

  const lines = [
    "Checkout created.",
    `purchase_id: ${checkout.purchase_id}`,
    `status: ${checkout.status || "pending"}`,
    `checkout_url: ${checkout.checkout_url}`,
  ];
  if (browserLine) lines.push(browserLine);
  lines.push("Next: run check_purchase_status with this purchase_id.");
  return lines.join("\n");
}

export async function handleConfirmPurchaseSession(args: Record<string, unknown>): Promise<string> {
  const sessionId = String(args.session_id || "").trim();
  if (!sessionId) return "Missing required argument: session_id";

  const status = await pollPurchaseStatus({
    session_id: sessionId,
    wait_for_completion: args.wait_for_completion,
    timeout_sec: args.timeout_sec,
    poll_interval_sec: args.poll_interval_sec,
  });

  const lines = [
    "Checkout session status:",
    `purchase_id: ${status.purchase_id || "-"}`,
    `skill_slug: ${status.skill_slug || "-"}`,
    `status: ${status.status || "unknown"}`,
    `license_code: ${status.license_code || "-"}`,
    `purchased_at: ${status.purchased_at || "-"}`,
  ];

  if (status.skill_slug && status.license_code) {
    lines.push(`install_command: ${buildInstallCommand(status.skill_slug, status.license_code, args)}`);
  }

  const includeDownloadUrl = toBool(args.include_download_url, true);
  if (includeDownloadUrl && String(status.status || "").toLowerCase() === "completed") {
    try {
      const download = await apiGet<DownloadPurchasedResponse>(
        `/v1/purchases/download`,
        { session_id: sessionId },
      );
      const downloadUrl = download.url || download.download_url;
      lines.push(downloadUrl ? `download_url: ${downloadUrl}` : "download_url: unavailable");
    } catch (error) {
      lines.push(`download_url: unavailable (${error instanceof Error ? error.message : String(error)})`);
    }
  }

  if (toBool(args.auto_install, false) && String(status.status || "").toLowerCase() === "completed") {
    if (!status.skill_slug || !status.license_code) {
      lines.push("Auto-install skipped: missing skill_slug or license_code.");
    } else {
      try {
        const installOutput = await runInstallWithLicense(status.skill_slug, status.license_code, args);
        lines.push("", "Auto-install completed:", installOutput);
      } catch (error) {
        lines.push("", `Auto-install failed: ${error instanceof Error ? error.message : String(error)}`);
      }
    }
  }

  return lines.join("\n");
}

export async function handleDownloadPurchasedSkill(args: Record<string, unknown>): Promise<string> {
  const sessionId = String(args.session_id || "").trim();
  if (!sessionId) return "Missing required argument: session_id";

  const download = await apiGet<DownloadPurchasedResponse>(
    `/v1/purchases/download`,
    { session_id: sessionId },
  );
  const downloadUrl = download.url || download.download_url;

  if (!downloadUrl) return "Purchase download endpoint returned no URL.";

  const lines = [
    "Purchased files download ready.",
    `skill_slug: ${download.slug || "-"}`,
    `download_url: ${downloadUrl}`,
  ];

  if (toBool(args.auto_open_browser, true)) {
    const openResult = await openInBrowser(downloadUrl);
    lines.push(openResult.ok
      ? `Opened browser with: ${openResult.command}`
      : `Could not auto-open browser. Open manually: ${downloadUrl}`);
  }

  return lines.join("\n");
}

export async function handleInstallPurchasedSkill(args: Record<string, unknown>): Promise<string> {
  const purchaseId = String(args.purchase_id || "").trim();
  const sessionId = String(args.session_id || "").trim();
  const skillSlug = String(args.skill_slug || "").trim();
  let licenseCode = String(args.license_code || "").trim() || null;
  let resolvedSlug: string | null = skillSlug || null;

  if (sessionId) {
    const status = await apiGet<PurchaseStatus & { purchased_at?: string }>(
      `/v1/purchases/confirm`,
      { session_id: sessionId },
    );
    if (String(status.status || "").toLowerCase() !== "completed") {
      return `Checkout session ${sessionId} is ${status.status || "unknown"}. Complete payment first.`;
    }
    resolvedSlug = status.skill_slug || resolvedSlug;
    licenseCode = status.license_code || licenseCode;
  }

  if (purchaseId) {
    await ensureAuthenticated();
    const auth = loadAuthToken()!;
    const status = await apiGet<PurchaseStatus & { purchased_at?: string }>(
      `/v1/purchases/${encodeURIComponent(purchaseId)}/status`,
      undefined,
      auth,
    );
    if (String(status.status || "").toLowerCase() !== "completed") {
      return `Purchase ${purchaseId} is ${status.status || "unknown"}. Complete payment first.`;
    }
    resolvedSlug = status.skill_slug || resolvedSlug;
    licenseCode = status.license_code || licenseCode;
  }

  if (!resolvedSlug) return "Provide session_id, purchase_id, or skill_slug.";

  if (!licenseCode) {
    await ensureAuthenticated();
    const auth = loadAuthToken()!;
    const purchasesRaw = await apiGet<PurchasesResponse>("/v1/purchases", undefined, auth);
    const purchases = asArray<Purchase>(purchasesRaw.items)
      .filter((item) => item.skill_slug === resolvedSlug && String(item.status).toLowerCase() === "completed")
      .sort((a, b) => String(b.purchased_at || "").localeCompare(String(a.purchased_at || "")));

    if (purchases[0]?.license_code) {
      licenseCode = purchases[0].license_code;
    }
  }

  if (!licenseCode) {
    return `No license code found for ${resolvedSlug}. If needed, regenerate from website/dashboard then retry.`;
  }

  const output = await runInstallWithLicense(resolvedSlug, licenseCode, args);
  return `Installed ${resolvedSlug} using your purchase license.\n\n${output}`;
}

// ---------- Plugin self-update check ----------

const NPM_PACKAGE_NAME = "@agentpowers/mcp-server";

export async function handleCheckPluginVersion(currentVersion: string): Promise<string> {
  let latest: string | null = null;
  try {
    const data = await fetchUrl<Record<string, unknown>>(`https://registry.npmjs.org/${NPM_PACKAGE_NAME}`);
    const distTags = data["dist-tags"] as Record<string, string> | undefined;
    latest = distTags?.latest ?? null;
  } catch {
    return `AgentPowers plugin v${currentVersion} -- unable to check for updates (registry unreachable).`;
  }

  if (!latest) {
    return `AgentPowers plugin v${currentVersion} -- unable to check for updates (package not published).`;
  }

  const cmp = compareSemver(currentVersion, latest);
  const lines = ["AgentPowers Plugin Version Check", "", `Installed: v${currentVersion}`, `Latest:    v${latest}`, ""];

  if (cmp !== null && cmp < 0) {
    lines.push(`Update available! v${currentVersion} -> v${latest}`);
    lines.push("", "To update:", `  npm install -g ${NPM_PACKAGE_NAME}@latest`);
  } else if (cmp === 0) {
    lines.push("You are running the latest version.");
  } else {
    lines.push("You are running a newer version than the published release.");
  }

  return lines.join("\n");
}
