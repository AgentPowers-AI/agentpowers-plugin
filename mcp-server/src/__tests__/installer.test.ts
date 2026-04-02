import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { mkdirSync, rmSync, writeFileSync, unlinkSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { randomUUID } from "node:crypto";

// Mock child_process BEFORE importing installer
vi.mock("node:child_process", () => ({
  execFileSync: vi.fn(),
}));
vi.mock("../content-hasher.js", () => ({
  hashDirectory: vi.fn().mockReturnValue("abc123"),
}));
vi.mock("../pin-manager.js", () => ({
  savePin: vi.fn(),
}));

// Mock fetch globally
const mockFetch = vi.fn();
vi.stubGlobal("fetch", mockFetch);

import { execFileSync } from "node:child_process";
import { downloadAndExtract, getInstallDir, validateSlug, validateArchiveMembers } from "../installer.js";

// ---------------------------------------------------------------------------
// validateSlug
// ---------------------------------------------------------------------------

describe("validateSlug", () => {
  it("accepts valid lowercase slugs", () => {
    expect(validateSlug("my-skill")).toBe(true);
    expect(validateSlug("skill123")).toBe(true);
    expect(validateSlug("a")).toBe(true);
    expect(validateSlug("git-helper-v2")).toBe(true);
  });

  it("rejects slugs with semicolons (command chaining)", () => {
    expect(validateSlug("foo;rm -rf /")).toBe(false);
  });

  it("rejects slugs with $( (command substitution)", () => {
    expect(validateSlug("foo$(whoami)")).toBe(false);
  });

  it("rejects slugs with backticks (command substitution)", () => {
    expect(validateSlug("foo`whoami`")).toBe(false);
  });

  it("rejects slugs with pipe (command piping)", () => {
    expect(validateSlug("foo|cat /etc/passwd")).toBe(false);
  });

  it("rejects slugs with ampersand (background execution)", () => {
    expect(validateSlug("foo&rm -rf /")).toBe(false);
  });

  it("rejects slugs with spaces", () => {
    expect(validateSlug("foo bar")).toBe(false);
  });

  it("rejects slugs with double quotes", () => {
    expect(validateSlug('foo"bar')).toBe(false);
  });

  it("rejects slugs with single quotes", () => {
    expect(validateSlug("foo'bar")).toBe(false);
  });

  it("rejects slugs starting with a hyphen", () => {
    expect(validateSlug("-my-skill")).toBe(false);
  });

  it("rejects empty slugs", () => {
    expect(validateSlug("")).toBe(false);
  });

  it("rejects slugs with uppercase letters", () => {
    expect(validateSlug("MySkill")).toBe(false);
  });

  it("rejects slugs with path traversal", () => {
    expect(validateSlug("../etc/passwd")).toBe(false);
    expect(validateSlug("foo/bar")).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// getInstallDir — target tool directory mapping
// ---------------------------------------------------------------------------

describe("getInstallDir", () => {
  const home = require("node:os").homedir();

  it.each([
    ["claude-code", ".claude"],
    ["claude-desktop", ".claude"],
    ["codex", ".codex"],
    ["gemini", ".gemini"],
    ["kiro", ".kiro"],
  ])("returns correct directory for %s", (tool, configDir) => {
    const result = getInstallDir("my-skill", "skill", tool);
    expect(result).toBe(join(home, configDir, "skills", "my-skill"));
  });

  it.each([
    ["claude-code", ".claude"],
    ["codex", ".codex"],
  ])("returns agents subdirectory for agent type with %s", (tool, configDir) => {
    const result = getInstallDir("my-agent", "agent", tool);
    expect(result).toBe(join(home, configDir, "agents", "my-agent"));
  });

  it("falls back to .<tool> for unknown tool", () => {
    const result = getInstallDir("my-skill", "skill", "foo");
    expect(result).toBe(join(home, ".foo", "skills", "my-skill"));
  });

  it("defaults to claude-code when no tool specified", () => {
    const result = getInstallDir("my-skill", "skill");
    expect(result).toBe(join(home, ".claude", "skills", "my-skill"));
  });
});

// ---------------------------------------------------------------------------
// downloadAndExtract — uses execFileSync (no shell)
// ---------------------------------------------------------------------------

describe("downloadAndExtract", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Return empty string for archive listing calls (tar -tzf / zipinfo -1)
    // so that safeExtract's memberList.split("\n") doesn't crash on undefined.
    vi.mocked(execFileSync).mockReturnValue("" as never);
    mockFetch.mockResolvedValue({
      ok: true,
      arrayBuffer: () => Promise.resolve(new ArrayBuffer(0)),
    });
  });

  it("uses execFileSync with array args for tar extraction (no shell)", async () => {
    await downloadAndExtract(
      "https://example.com/pkg.tar.gz",
      "my-skill",
      "skill",
    );

    expect(vi.mocked(execFileSync)).toHaveBeenCalledWith(
      "tar",
      expect.arrayContaining(["-xzf"]),
      expect.objectContaining({ stdio: "pipe" }),
    );

    // Verify it's called with array args (not a single shell string)
    const call = vi.mocked(execFileSync).mock.calls[0];
    expect(Array.isArray(call[1])).toBe(true);
  });

  it("uses execFileSync with array args for unzip extraction (no shell)", async () => {
    await downloadAndExtract(
      "https://example.com/pkg.zip",
      "my-skill",
      "skill",
    );

    expect(vi.mocked(execFileSync)).toHaveBeenCalledWith(
      "unzip",
      expect.arrayContaining(["-o"]),
      expect.objectContaining({ stdio: "pipe" }),
    );

    const call = vi.mocked(execFileSync).mock.calls[0];
    expect(Array.isArray(call[1])).toBe(true);
  });

  it("rejects slugs with shell metacharacters before reaching extraction", async () => {
    await expect(
      downloadAndExtract(
        "https://example.com/pkg.tar.gz",
        'foo";rm -rf /',
        "skill",
      ),
    ).rejects.toThrow(/invalid.*slug/i);

    // execFileSync should never be called
    expect(vi.mocked(execFileSync)).not.toHaveBeenCalled();
  });

  it("rejects slugs with command substitution", async () => {
    await expect(
      downloadAndExtract(
        "https://example.com/pkg.tar.gz",
        "foo$(whoami)",
        "skill",
      ),
    ).rejects.toThrow(/invalid.*slug/i);

    expect(vi.mocked(execFileSync)).not.toHaveBeenCalled();
  });

  it("rejects slugs with backtick injection", async () => {
    await expect(
      downloadAndExtract(
        "https://example.com/pkg.tar.gz",
        "foo`id`",
        "skill",
      ),
    ).rejects.toThrow(/invalid.*slug/i);

    expect(vi.mocked(execFileSync)).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// validateArchiveMembers — ZIP Slip / path traversal prevention
// ---------------------------------------------------------------------------

describe("validateArchiveMembers", () => {
  let testDir: string;

  beforeEach(() => {
    testDir = join(tmpdir(), `ap-test-${randomUUID()}`);
    mkdirSync(testDir, { recursive: true });
  });

  afterEach(() => {
    rmSync(testDir, { recursive: true, force: true });
  });

  it("rejects entries with ../ path traversal", () => {
    const members = ["../../tmp/zipslip_test", "legit.txt"];
    expect(() => validateArchiveMembers(members, testDir)).toThrow(
      /path traversal/i
    );
  });

  it("rejects entries with absolute paths", () => {
    const members = ["/tmp/zipslip_abs_test", "legit.txt"];
    expect(() => validateArchiveMembers(members, testDir)).toThrow(
      /path traversal/i
    );
  });

  it("rejects entries with backslash traversal", () => {
    const members = ["..\\..\\tmp\\zipslip_win", "legit.txt"];
    expect(() => validateArchiveMembers(members, testDir)).toThrow(
      /path traversal/i
    );
  });

  it("rejects entries that resolve outside install dir", () => {
    const members = ["foo/../../../etc/passwd"];
    expect(() => validateArchiveMembers(members, testDir)).toThrow(
      /path traversal/i
    );
  });

  it("allows legitimate paths", () => {
    const members = ["CLAUDE.md", "src/main.py", "src/utils/helper.py"];
    expect(() => validateArchiveMembers(members, testDir)).not.toThrow();
  });
});
