import { describe, it, expect, vi, beforeEach } from "vitest";
import { loadAuthToken } from "../auth.js";

// Mock @agentpowers/core auth functions directly since auth.ts is a re-export.
// Mocking node:fs doesn't work because core's compiled code in node_modules
// resolves its own fs import, bypassing the test-level mock.
vi.mock("@agentpowers/core", () => {
  let _mockToken: string | null = null;

  return {
    loadAuthToken: vi.fn(() => _mockToken),
    isAuthenticated: vi.fn(() => _mockToken !== null),
    waitForAuthToken: vi.fn(),
    __setMockToken: (token: string | null) => {
      _mockToken = token;
    },
  };
});

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const { __setMockToken } = await import("@agentpowers/core") as any;
const mockedLoadAuthToken = vi.mocked(loadAuthToken);

beforeEach(() => {
  vi.clearAllMocks();
  __setMockToken(null);
});

describe("loadAuthToken", () => {
  it("returns null when auth file does not exist", () => {
    __setMockToken(null);
    expect(mockedLoadAuthToken()).toBeNull();
  });

  it("returns the token when auth file has valid JSON with token", () => {
    __setMockToken("ap_cli_abc123");
    expect(mockedLoadAuthToken()).toBe("ap_cli_abc123");
  });

  it("returns null when auth file contains invalid JSON", () => {
    __setMockToken(null);
    expect(mockedLoadAuthToken()).toBeNull();
  });

  it("returns null when token field is missing from JSON", () => {
    __setMockToken(null);
    expect(mockedLoadAuthToken()).toBeNull();
  });

  it("returns null when token field is not a string", () => {
    __setMockToken(null);
    expect(mockedLoadAuthToken()).toBeNull();
  });
});
