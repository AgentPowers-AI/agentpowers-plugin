/**
 * Adversarial tests for content-hasher — symlink safety.
 *
 * Verifies that hashDirectory does not follow symlinks, preventing:
 * - Infinite recursion from symlink cycles
 * - Hash inconsistency from symlinked files
 */

import { describe, it, expect, afterEach } from "vitest";
import { mkdirSync, symlinkSync, writeFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { randomUUID } from "node:crypto";
import { hashDirectory } from "../content-hasher.js";

describe("content-hasher symlink safety", () => {
  const dirs: string[] = [];

  afterEach(() => {
    for (const d of dirs) {
      try {
        rmSync(d, { recursive: true, force: true });
      } catch {
        // best-effort cleanup
      }
    }
    dirs.length = 0;
  });

  it("does not follow symlink cycles (completes without stack overflow)", () => {
    const base = join(tmpdir(), `test-cycle-${randomUUID()}`);
    dirs.push(base);
    mkdirSync(join(base, "subdir"), { recursive: true });
    writeFileSync(join(base, "file.txt"), "hello");
    // Create a cycle: subdir/loop -> base
    symlinkSync(base, join(base, "subdir", "loop"));

    const hash = hashDirectory(base);
    expect(hash).toMatch(/^sha256:[a-f0-9]{64}$/);
  });

  it("ignores symlinked files (hash excludes them)", () => {
    const base = join(tmpdir(), `test-symfile-${randomUUID()}`);
    dirs.push(base);
    mkdirSync(base, { recursive: true });
    writeFileSync(join(base, "real.txt"), "content");
    symlinkSync(join(base, "real.txt"), join(base, "link.txt"));

    // Hash with symlink present
    const hashWithLink = hashDirectory(base);

    // Remove symlink, hash again
    rmSync(join(base, "link.txt"));
    const hashWithout = hashDirectory(base);

    // Hashes should be identical since symlinks are skipped
    expect(hashWithLink).toBe(hashWithout);
  });

  it("ignores symlinked directories", () => {
    const base = join(tmpdir(), `test-symdir-${randomUUID()}`);
    const external = join(tmpdir(), `test-external-${randomUUID()}`);
    dirs.push(base, external);

    mkdirSync(base, { recursive: true });
    mkdirSync(external, { recursive: true });
    writeFileSync(join(base, "file.txt"), "base content");
    writeFileSync(join(external, "external.txt"), "external content");

    // Symlink external dir into base
    symlinkSync(external, join(base, "linked-dir"));

    const hashWithLink = hashDirectory(base);

    rmSync(join(base, "linked-dir"));
    const hashWithout = hashDirectory(base);

    expect(hashWithLink).toBe(hashWithout);
  });
});
