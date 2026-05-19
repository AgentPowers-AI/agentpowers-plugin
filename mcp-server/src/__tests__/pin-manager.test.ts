import { describe, it, expect, beforeEach } from "vitest";
import { writeFileSync, mkdirSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { tmpdir } from "node:os";
import { randomUUID } from "node:crypto";
import {
  loadPins,
  savePin,
  removePin,
  verifyPin,
  DEFAULT_PINS_PATH,
} from "../pin-manager.js";
import type { PinsFile } from "../types.js";

/** Returns a unique temp path for each test — no cross-test interference. */
function tempPath(): string {
  return join(tmpdir(), `test-pins-${randomUUID()}.json`);
}

/** Write a PinsFile to disk, creating parent dirs as needed. */
function writePins(path: string, data: PinsFile): void {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, JSON.stringify(data, null, 2));
}

// ---------------------------------------------------------------------------
// DEFAULT_PINS_PATH
// ---------------------------------------------------------------------------

describe("DEFAULT_PINS_PATH", () => {
  it("ends with .agentpowers/pins.json", () => {
    expect(DEFAULT_PINS_PATH).toMatch(/\.agentpowers[/\\]pins\.json$/);
  });
});

// ---------------------------------------------------------------------------
// loadPins
// ---------------------------------------------------------------------------

describe("loadPins", () => {
  it("returns {} for a missing file", () => {
    const path = tempPath();
    expect(loadPins(path)).toEqual({});
  });

  it("loads a valid pins JSON file", () => {
    const path = tempPath();
    const pins: PinsFile = {
      "my-skill": {
        source: "agentpowers",
        version: "1.0.0",
        content_hash: "sha256:abc123",
        installed_at: "2026-01-01T00:00:00.000Z",
        scanned_at: "2026-01-01T00:00:00.000Z",
        security_status: "pass",
      },
    };
    writePins(path, pins);
    expect(loadPins(path)).toEqual(pins);
  });

  it("returns {} for a corrupt (non-JSON) file", () => {
    const path = tempPath();
    mkdirSync(dirname(path), { recursive: true });
    writeFileSync(path, "not valid json {{{{");
    expect(loadPins(path)).toEqual({});
  });
});

// ---------------------------------------------------------------------------
// savePin
// ---------------------------------------------------------------------------

describe("savePin", () => {
  it("creates the parent directory if it does not exist", () => {
    const path = join(tmpdir(), randomUUID(), "nested", "pins.json");
    savePin("skill-a", "agentpowers", "1.0.0", "sha256:aaa", "pass", "skill", path);
    expect(existsSync(path)).toBe(true);
  });

  it("creates a new pin entry with correct fields", () => {
    const path = tempPath();
    const before = Date.now();
    savePin("skill-a", "agentpowers", "1.2.3", "sha256:aaa", "pass", "skill", path);
    const after = Date.now();

    const pins = loadPins(path);
    const entry = pins["skill-a"];
    expect(entry).toBeDefined();
    expect(entry.source).toBe("agentpowers");
    expect(entry.version).toBe("1.2.3");
    expect(entry.content_hash).toBe("sha256:aaa");
    expect(entry.security_status).toBe("pass");

    const installedMs = new Date(entry.installed_at).getTime();
    const scannedMs = new Date(entry.scanned_at).getTime();
    expect(installedMs).toBeGreaterThanOrEqual(before);
    expect(installedMs).toBeLessThanOrEqual(after);
    expect(scannedMs).toBeGreaterThanOrEqual(before);
    expect(scannedMs).toBeLessThanOrEqual(after);
  });

  it("stores installed_at and scanned_at as ISO strings", () => {
    const path = tempPath();
    savePin("skill-b", "clawhub", null, "sha256:bbb", "warn", "skill", path);
    const pins = loadPins(path);
    const entry = pins["skill-b"];
    expect(entry.installed_at).toMatch(
      /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/,
    );
    expect(entry.scanned_at).toMatch(
      /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/,
    );
  });

  it("accepts null version", () => {
    const path = tempPath();
    savePin("skill-null-ver", "clawhub", null, "sha256:ccc", "pass", "skill", path);
    const pins = loadPins(path);
    expect(pins["skill-null-ver"].version).toBeNull();
  });

  it("overwrites an existing pin for the same slug", () => {
    const path = tempPath();
    savePin("skill-a", "agentpowers", "1.0.0", "sha256:old", "pass", "skill", path);
    savePin("skill-a", "agentpowers", "2.0.0", "sha256:new", "warn", "skill", path);

    const pins = loadPins(path);
    expect(pins["skill-a"].version).toBe("2.0.0");
    expect(pins["skill-a"].content_hash).toBe("sha256:new");
    expect(pins["skill-a"].security_status).toBe("warn");
    expect(Object.keys(pins)).toHaveLength(1);
  });

  it("adds a second pin without losing the first", () => {
    const path = tempPath();
    savePin("skill-a", "agentpowers", "1.0.0", "sha256:aaa", "pass", "skill", path);
    savePin("skill-b", "clawhub", "0.9.0", "sha256:bbb", "warn", "skill", path);

    const pins = loadPins(path);
    expect(Object.keys(pins)).toHaveLength(2);
    expect(pins["skill-a"].content_hash).toBe("sha256:aaa");
    expect(pins["skill-b"].content_hash).toBe("sha256:bbb");
  });
});

// ---------------------------------------------------------------------------
// removePin
// ---------------------------------------------------------------------------

describe("removePin", () => {
  it("returns false for a slug that is not in the file", () => {
    const path = tempPath();
    writePins(path, {});
    expect(removePin("nonexistent", path)).toBe(false);
  });

  it("returns false gracefully when the file does not exist", () => {
    const path = tempPath();
    expect(removePin("anything", path)).toBe(false);
  });

  it("returns true and removes the slug from the file", () => {
    const path = tempPath();
    savePin("skill-a", "agentpowers", "1.0.0", "sha256:aaa", "pass", "skill", path);

    const result = removePin("skill-a", path);
    expect(result).toBe(true);

    const pins = loadPins(path);
    expect("skill-a" in pins).toBe(false);
  });

  it("leaves other pins intact after removal", () => {
    const path = tempPath();
    savePin("skill-a", "agentpowers", "1.0.0", "sha256:aaa", "pass", "skill", path);
    savePin("skill-b", "agentpowers", "1.0.0", "sha256:bbb", "pass", "skill", path);

    removePin("skill-a", path);

    const pins = loadPins(path);
    expect("skill-a" in pins).toBe(false);
    expect(pins["skill-b"].content_hash).toBe("sha256:bbb");
  });
});

// ---------------------------------------------------------------------------
// verifyPin
// ---------------------------------------------------------------------------

describe("verifyPin", () => {
  it("returns null for a slug not present in the file", () => {
    const path = tempPath();
    writePins(path, {});
    expect(verifyPin("missing-slug", "sha256:xyz", path)).toBeNull();
  });

  it("returns null when the pins file does not exist", () => {
    const path = tempPath();
    expect(verifyPin("any-slug", "sha256:xyz", path)).toBeNull();
  });

  it("returns true when the content hash matches", () => {
    const path = tempPath();
    savePin("skill-a", "agentpowers", "1.0.0", "sha256:abc", "pass", "skill", path);
    expect(verifyPin("skill-a", "sha256:abc", path)).toBe(true);
  });

  it("returns false when the content hash does not match", () => {
    const path = tempPath();
    savePin("skill-a", "agentpowers", "1.0.0", "sha256:abc", "pass", "skill", path);
    expect(verifyPin("skill-a", "sha256:different", path)).toBe(false);
  });
});
