import { describe, it, expect, afterEach } from "vitest";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { hashDirectory, isDirectory } from "../content-hasher.js";

let tempDirs: string[] = [];

function makeTempDir(): string {
  const dir = mkdtempSync(join(tmpdir(), "ap-test-"));
  tempDirs.push(dir);
  return dir;
}

afterEach(() => {
  for (const dir of tempDirs) {
    rmSync(dir, { recursive: true, force: true });
  }
  tempDirs = [];
});

describe("hashDirectory", () => {
  it("returns a string starting with 'sha256:'", () => {
    const dir = makeTempDir();
    writeFileSync(join(dir, "file.txt"), "hello");

    const hash = hashDirectory(dir);

    expect(hash).toMatch(/^sha256:[a-f0-9]{64}$/);
  });

  it("returns a deterministic hash for the same files", () => {
    const dir = makeTempDir();
    writeFileSync(join(dir, "a.txt"), "content-a");
    writeFileSync(join(dir, "b.txt"), "content-b");

    const hash1 = hashDirectory(dir);
    const hash2 = hashDirectory(dir);

    expect(hash1).toBe(hash2);
  });

  it("produces different hashes for different file contents", () => {
    const dir1 = makeTempDir();
    const dir2 = makeTempDir();
    writeFileSync(join(dir1, "file.txt"), "version one");
    writeFileSync(join(dir2, "file.txt"), "version two");

    expect(hashDirectory(dir1)).not.toBe(hashDirectory(dir2));
  });

  it("produces different hashes when the filename changes", () => {
    const dir1 = makeTempDir();
    const dir2 = makeTempDir();
    writeFileSync(join(dir1, "alpha.txt"), "same content");
    writeFileSync(join(dir2, "beta.txt"), "same content");

    expect(hashDirectory(dir1)).not.toBe(hashDirectory(dir2));
  });

  it("excludes .DS_Store files from the hash", () => {
    const dir1 = makeTempDir();
    const dir2 = makeTempDir();
    writeFileSync(join(dir1, "skill.md"), "# Skill");
    writeFileSync(join(dir2, "skill.md"), "# Skill");
    writeFileSync(join(dir2, ".DS_Store"), "macOS artifact");

    expect(hashDirectory(dir1)).toBe(hashDirectory(dir2));
  });

  it("excludes Thumbs.db files from the hash", () => {
    const dir1 = makeTempDir();
    const dir2 = makeTempDir();
    writeFileSync(join(dir1, "skill.md"), "# Skill");
    writeFileSync(join(dir2, "skill.md"), "# Skill");
    writeFileSync(join(dir2, "Thumbs.db"), "windows artifact");

    expect(hashDirectory(dir1)).toBe(hashDirectory(dir2));
  });

  it("excludes __pycache__ directories and their contents", () => {
    const dir1 = makeTempDir();
    const dir2 = makeTempDir();
    writeFileSync(join(dir1, "script.py"), "print('hi')");
    writeFileSync(join(dir2, "script.py"), "print('hi')");
    const cacheDir = join(dir2, "__pycache__");
    mkdirSync(cacheDir);
    writeFileSync(join(cacheDir, "script.cpython-311.pyc"), "bytecode");

    expect(hashDirectory(dir1)).toBe(hashDirectory(dir2));
  });

  it("excludes .pyc files from the hash", () => {
    const dir1 = makeTempDir();
    const dir2 = makeTempDir();
    writeFileSync(join(dir1, "main.py"), "x = 1");
    writeFileSync(join(dir2, "main.py"), "x = 1");
    writeFileSync(join(dir2, "main.pyc"), "compiled bytecode");

    expect(hashDirectory(dir1)).toBe(hashDirectory(dir2));
  });

  it("excludes .pyo files from the hash", () => {
    const dir1 = makeTempDir();
    const dir2 = makeTempDir();
    writeFileSync(join(dir1, "main.py"), "x = 1");
    writeFileSync(join(dir2, "main.py"), "x = 1");
    writeFileSync(join(dir2, "main.pyo"), "optimized bytecode");

    expect(hashDirectory(dir1)).toBe(hashDirectory(dir2));
  });

  it("returns a consistent hash for an empty directory", () => {
    const dir1 = makeTempDir();
    const dir2 = makeTempDir();

    expect(hashDirectory(dir1)).toBe(hashDirectory(dir2));
  });

  it("handles nested subdirectories", () => {
    const dir = makeTempDir();
    const sub = join(dir, "subdir", "nested");
    mkdirSync(sub, { recursive: true });
    writeFileSync(join(dir, "top.txt"), "top level");
    writeFileSync(join(sub, "deep.txt"), "deep level");

    const hash = hashDirectory(dir);

    expect(hash).toMatch(/^sha256:[a-f0-9]{64}$/);
  });

  it("nested file path changes produce different hashes", () => {
    const dir1 = makeTempDir();
    const dir2 = makeTempDir();
    const sub1 = join(dir1, "a");
    const sub2 = join(dir2, "b");
    mkdirSync(sub1);
    mkdirSync(sub2);
    writeFileSync(join(sub1, "file.txt"), "same content");
    writeFileSync(join(sub2, "file.txt"), "same content");

    expect(hashDirectory(dir1)).not.toBe(hashDirectory(dir2));
  });
});

describe("isDirectory", () => {
  it("returns true for an existing directory", () => {
    const dir = makeTempDir();

    expect(isDirectory(dir)).toBe(true);
  });

  it("returns false for a file path", () => {
    const dir = makeTempDir();
    const file = join(dir, "file.txt");
    writeFileSync(file, "data");

    expect(isDirectory(file)).toBe(false);
  });

  it("returns false for a non-existent path", () => {
    expect(isDirectory("/tmp/ap-test-does-not-exist-xyz-987654")).toBe(false);
  });
});
