/** Skill installer — download, extract, hash, pin. */

import { mkdirSync, rmSync, writeFileSync, unlinkSync, lstatSync } from "node:fs";
import { join, resolve, normalize, isAbsolute, relative, sep } from "node:path";
import { homedir, tmpdir } from "node:os";
import { execFileSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { hashDirectory } from "./content-hasher.js";
import { savePin } from "./pin-manager.js";

export type PackageType = "skill" | "agent";

/** Strict slug pattern: lowercase alphanumeric, may contain hyphens, must not start with hyphen. */
const VALID_SLUG_RE = /^[a-z0-9][a-z0-9-]*$/;

/** Validate a slug to prevent path traversal and shell injection. */
export function validateSlug(slug: string): boolean {
  return VALID_SLUG_RE.test(slug);
}

/**
 * Map of supported target tools to their config directory names.
 * Matches the CLI's SUPPORTED_TOOLS dictionary.
 */
const TOOL_CONFIG_DIRS: Record<string, string> = {
  "claude-code": ".claude",
  "claude-desktop": ".claude",
  "codex": ".codex",
  "gemini": ".gemini",
  "kiro": ".kiro",
};

export function getInstallDir(
  slug: string,
  type: PackageType,
  targetTool: string = "claude-code",
): string {
  const configDir = TOOL_CONFIG_DIRS[targetTool] ?? `.${targetTool}`;
  const base = type === "skill" ? "skills" : "agents";
  return join(homedir(), configDir, base, slug);
}

export interface InstallResult {
  installDir: string;
  contentHash: string;
}

/**
 * Validate that all archive member paths stay within the install directory.
 *
 * Rejects:
 * - Entries with absolute paths
 * - Entries containing '..' components or backslash traversal
 * - Entries that resolve outside the target directory
 *
 * @throws Error if any member fails validation
 */
export function validateArchiveMembers(
  members: string[],
  installDir: string,
): void {
  const resolvedInstallDir = resolve(installDir);

  for (const member of members) {
    // Normalize backslashes to forward slashes
    const normalized = member.replace(/\\/g, "/");

    // Reject absolute paths
    if (isAbsolute(normalized) || isAbsolute(member)) {
      throw new Error(
        `Blocked path traversal: absolute path in archive member '${member}'`
      );
    }

    // Reject any '..' component
    const parts = normalized.split("/");
    if (parts.includes("..")) {
      throw new Error(
        `Blocked path traversal: '..' in archive member '${member}'`
      );
    }

    // Final check: resolved path must be within installDir.
    // Use relative() instead of startsWith() to prevent prefix attacks
    // (e.g., "/skills/a-malicious" starts with "/skills/a").
    const target = resolve(installDir, normalize(normalized));
    const rel = relative(resolvedInstallDir, target);
    if (rel.startsWith("..") || rel.startsWith(sep)) {
      throw new Error(
        `Blocked path traversal: '${member}' resolves outside destination directory`
      );
    }
  }
}

/**
 * List archive members and validate them, then extract safely.
 *
 * Uses execFileSync (no shell interpolation) and validates all paths
 * before extraction to prevent ZIP Slip / path traversal attacks.
 */
function safeExtract(
  tempFile: string,
  installDir: string,
  isTarball: boolean,
): void {
  // Step 1: List archive contents and validate
  let memberList: string;
  if (isTarball) {
    memberList = execFileSync("tar", ["-tzf", tempFile], {
      encoding: "utf-8",
    });
  } else {
    // zipinfo -1 lists one filename per line
    memberList = execFileSync("zipinfo", ["-1", tempFile], {
      encoding: "utf-8",
    });
  }

  const members = memberList
    .split("\n")
    .map((m) => m.trim())
    .filter((m) => m.length > 0);

  validateArchiveMembers(members, installDir);

  // Step 2: Extract (using execFileSync to avoid shell injection)
  if (isTarball) {
    execFileSync("tar", ["-xzf", tempFile, "-C", installDir], {
      stdio: "pipe",
    });
  } else {
    execFileSync("unzip", ["-o", tempFile, "-d", installDir], {
      stdio: "pipe",
    });
  }
}

/**
 * Download a package, extract it, compute content hash, and save pin.
 *
 * - Cleans existing directory before extraction (no stale files)
 * - Validates all archive member paths stay within installDir (ZIP Slip prevention)
 * - Uses execFileSync instead of execSync (shell injection prevention)
 * - Computes SHA-256 content hash matching CLI format
 * - Saves pin to ~/.agentpowers/pins.json
 */
export async function downloadAndExtract(
  url: string,
  slug: string,
  type: PackageType,
  source: string = "agentpowers",
  version: string | null = null,
  securityStatus: string = "pass",
  targetTool: string = "claude-code",
): Promise<string> {
  if (!validateSlug(slug)) {
    throw new Error(`Invalid slug: "${slug}" — slugs must be lowercase alphanumeric with hyphens only.`);
  }

  const installDir = getInstallDir(slug, type, targetTool);
  const isTarball = url.includes(".tar.gz") || url.includes(".tgz");
  const ext = isTarball ? ".tar.gz" : ".zip";
  const tempFile = join(tmpdir(), `ap-${randomUUID()}${ext}`);

  try {
    // Enforce HTTPS for download URLs to prevent MITM attacks
    try {
      const parsed = new URL(url);
      if (parsed.protocol !== "https:") {
        throw new Error(`Download URL must use HTTPS, got "${parsed.protocol}"`);
      }
    } catch (e) {
      if (e instanceof TypeError) {
        throw new Error(`Invalid download URL: "${url}"`);
      }
      throw e;
    }

    const response = await fetch(url);
    if (!response.ok) {
      throw new Error(`Download failed: ${response.status} ${response.statusText}`);
    }

    const buffer = Buffer.from(await response.arrayBuffer());
    writeFileSync(tempFile, buffer);

    // Clean existing directory for fresh install
    rmSync(installDir, { recursive: true, force: true });
    mkdirSync(installDir, { recursive: true });

    // Validate and extract (ZIP Slip + shell injection protection)
    safeExtract(tempFile, installDir, isTarball);

    // Compute content hash and save pin (cross-compatible with CLI)
    const contentHash = hashDirectory(installDir);
    savePin(slug, source, version, contentHash, securityStatus, type);

    return installDir;
  } finally {
    try {
      unlinkSync(tempFile);
    } catch {
      // temp file cleanup is best-effort
    }
  }
}
