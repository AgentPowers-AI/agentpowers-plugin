import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { homedir } from "node:os";

const AUTH_FILE = join(homedir(), ".agentpowers", "auth.json");

export function loadAuthToken(): string | null {
  if (!existsSync(AUTH_FILE)) return null;
  try {
    const data = JSON.parse(readFileSync(AUTH_FILE, "utf-8")) as Record<
      string,
      unknown
    >;
    return typeof data.token === "string" ? data.token : null;
  } catch {
    return null;
  }
}
