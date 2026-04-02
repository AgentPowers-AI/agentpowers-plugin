/** SHA-256 content hashing — matches CLI's content_hasher.py for cross-tool compatibility. */

import { createHash } from "node:crypto";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";

/** OS-generated files to exclude from hashing (matches CLI). */
const EXCLUDED_NAMES = new Set([".DS_Store", "Thumbs.db", "__pycache__"]);
const EXCLUDED_SUFFIXES = new Set([".pyc", ".pyo"]);

function shouldSkip(relativePath: string): boolean {
  const parts = relativePath.split("/");
  for (const part of parts) {
    if (EXCLUDED_NAMES.has(part)) return true;
  }
  const lastPart = parts[parts.length - 1];
  for (const suffix of EXCLUDED_SUFFIXES) {
    if (lastPart.endsWith(suffix)) return true;
  }
  return false;
}

/** Recursively collect all file paths under a directory, sorted. */
function collectFiles(dirPath: string, basePath: string): string[] {
  const results: string[] = [];
  const entries = readdirSync(dirPath, { withFileTypes: true });
  for (const entry of entries) {
    const fullPath = join(dirPath, entry.name);
    const relPath = relative(basePath, fullPath);
    if (entry.isDirectory()) {
      if (!EXCLUDED_NAMES.has(entry.name)) {
        results.push(...collectFiles(fullPath, basePath));
      }
    } else if (entry.isFile() && !shouldSkip(relPath)) {
      results.push(relPath);
    }
  }
  return results;
}

/**
 * Compute a SHA-256 hash of all file contents in a directory.
 * Files sorted by relative path for deterministic results.
 * Excludes OS artifacts (.DS_Store, __pycache__, .pyc, Thumbs.db).
 *
 * Returns "sha256:<hex>" matching CLI format.
 */
export function hashDirectory(dirPath: string): string {
  const files = collectFiles(dirPath, dirPath).sort();
  const hasher = createHash("sha256");
  for (const relPath of files) {
    hasher.update(relPath, "utf-8");
    hasher.update(readFileSync(join(dirPath, relPath)));
  }
  return `sha256:${hasher.digest("hex")}`;
}

/**
 * Check if a path exists and is a directory.
 */
export function isDirectory(path: string): boolean {
  try {
    return statSync(path).isDirectory();
  } catch {
    return false;
  }
}
