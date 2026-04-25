/** Tests for error handling — network errors, status codes, global catch behavior. */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { APIError, NetworkError, formatAPIError } from "../api-client.js";

// These tests verify the error classes and formatter.
// API client network tests are in api-client.test.ts.

describe("APIError", () => {
  it("has name, message, and statusCode", () => {
    const err = new APIError("Not found", 404);
    expect(err.name).toBe("APIError");
    expect(err.message).toBe("Not found");
    expect(err.statusCode).toBe(404);
    expect(err).toBeInstanceOf(Error);
  });

  it("preserves optional code", () => {
    const err = new APIError("Conflict", 409, "ALREADY_CLAIMED");
    expect(err.code).toBe("ALREADY_CLAIMED");
  });

  it("code is undefined when not provided", () => {
    const err = new APIError("Error", 500);
    expect(err.code).toBeUndefined();
  });
});

describe("NetworkError", () => {
  it("has name and message", () => {
    const err = new NetworkError("Connection refused");
    expect(err.name).toBe("NetworkError");
    expect(err.message).toBe("Connection refused");
    expect(err).toBeInstanceOf(Error);
  });
});

describe("formatAPIError edge cases", () => {
  it("returns message for 409 with custom message", () => {
    const err = new APIError("Skill already unpublished", 409);
    expect(formatAPIError(err)).toBe("Skill already unpublished");
  });

  it("returns fallback for 409 with empty message", () => {
    const err = new APIError("", 409);
    expect(formatAPIError(err)).toBe("Conflict — this action has already been taken.");
  });

  it("returns generic message for 500", () => {
    const err = new APIError("Internal Server Error", 500);
    expect(formatAPIError(err)).toBe("Internal Server Error");
  });

  it("returns fallback for 500 with empty message", () => {
    const err = new APIError("", 500);
    expect(formatAPIError(err)).toBe("API error (500)");
  });

  it("includes detail in 422 message", () => {
    const err = new APIError("Price must be >= $3.00", 422);
    expect(formatAPIError(err)).toContain("Price must be >= $3.00");
    expect(formatAPIError(err)).toContain("Invalid request:");
  });
});

describe("error type discrimination", () => {
  it("APIError is not NetworkError", () => {
    const err = new APIError("test", 400);
    expect(err).not.toBeInstanceOf(NetworkError);
  });

  it("NetworkError is not APIError", () => {
    const err = new NetworkError("test");
    expect(err).not.toBeInstanceOf(APIError);
  });

  it("both are Error instances", () => {
    expect(new APIError("a", 400)).toBeInstanceOf(Error);
    expect(new NetworkError("b")).toBeInstanceOf(Error);
  });
});
