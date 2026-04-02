/** Version pin manager — tracks installed skill hashes.
 * Matches CLI's pin_manager.py format for cross-tool compatibility.
 * Stores pins at ~/.agentpowers/pins.json
 */

import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { homedir } from "node:os";
import type { PinEntry, PinsFile } from "./types.js";

export const DEFAULT_PINS_PATH = join(homedir(), ".agentpowers", "pins.json");

/** Load all version pins from disk. Returns empty object if file missing. */
export function loadPins(pinsPath: string = DEFAULT_PINS_PATH): PinsFile {
  try {
    const data = readFileSync(pinsPath, "utf-8");
    return JSON.parse(data) as PinsFile;
  } catch {
    return {};
  }
}

/** Save a version pin for an installed skill. Creates parent dir if needed. */
export function savePin(
  slug: string,
  source: string,
  version: string | null,
  contentHash: string,
  securityStatus: string,
  type: "skill" | "agent" = "skill",
  pinsPath: string = DEFAULT_PINS_PATH,
): void {
  mkdirSync(dirname(pinsPath), { recursive: true });
  const pins = loadPins(pinsPath);
  const now = new Date().toISOString();
  pins[slug] = {
    source,
    version,
    content_hash: contentHash,
    installed_at: now,
    scanned_at: now,
    security_status: securityStatus,
    type,
  };
  writeFileSync(pinsPath, JSON.stringify(pins, null, 2));
}

/** Remove a pin entry for a slug. No-op if not found. */
export function removePin(
  slug: string,
  pinsPath: string = DEFAULT_PINS_PATH,
): boolean {
  const pins = loadPins(pinsPath);
  if (!(slug in pins)) return false;
  delete pins[slug];
  mkdirSync(dirname(pinsPath), { recursive: true });
  writeFileSync(pinsPath, JSON.stringify(pins, null, 2));
  return true;
}

/** Verify a skill's content hash against its stored pin.
 * Returns true (match), false (mismatch), or null (no pin).
 */
export function verifyPin(
  slug: string,
  contentHash: string,
  pinsPath: string = DEFAULT_PINS_PATH,
): boolean | null {
  const pins = loadPins(pinsPath);
  if (!(slug in pins)) return null;
  return pins[slug].content_hash === contentHash;
}
