/** CLI command execution helpers for running `ap` CLI and opening browsers. */

import { spawn } from "node:child_process";

// ---------------------------------------------------------------------------
// Command execution
// ---------------------------------------------------------------------------

export interface CommandResult {
  code: number;
  signal: string | null;
  stdout: string;
  stderr: string;
  timedOut: boolean;
  error: string | null;
}

function appendLimited(current: string, addition: string, limit = 400_000): string {
  const next = current + addition;
  if (next.length <= limit) return next;
  return next.slice(next.length - limit);
}

export function stripAnsi(raw: string): string {
  return String(raw || "").replace(/\x1b\[[0-9;]*m/g, "");
}

export function formatCommandResult(result: CommandResult): string {
  const out = stripAnsi(result.stdout || "").trim();
  const err = stripAnsi(result.stderr || "").trim();
  const chunks: string[] = [];
  if (out) chunks.push(out);
  if (err) chunks.push(err);
  if (!chunks.length) return "(no output)";
  return chunks.join("\n");
}

export async function runCommand(
  command: string,
  args: string[] = [],
  options: { timeoutMs?: number; cwd?: string; env?: Record<string, string> } = {},
): Promise<CommandResult> {
  const timeoutMs = options.timeoutMs ?? 120_000;
  const cwd = options.cwd ?? process.cwd();
  const env = { ...process.env, ...(options.env ?? {}) };

  return new Promise((resolve) => {
    let stdout = "";
    let stderr = "";
    let timedOut = false;

    const child = spawn(command, args, {
      cwd,
      env,
      stdio: ["ignore", "pipe", "pipe"],
    });

    const timer = setTimeout(() => {
      timedOut = true;
      child.kill("SIGTERM");
      setTimeout(() => child.kill("SIGKILL"), 1500);
    }, timeoutMs);

    child.on("error", (err) => {
      clearTimeout(timer);
      resolve({
        code: -1,
        signal: null,
        stdout,
        stderr,
        timedOut: false,
        error: String(err),
      });
    });

    child.stdout.on("data", (chunk: Buffer) => {
      stdout = appendLimited(stdout, chunk.toString("utf8"));
    });

    child.stderr.on("data", (chunk: Buffer) => {
      stderr = appendLimited(stderr, chunk.toString("utf8"));
    });

    child.on("close", (code, signal) => {
      clearTimeout(timer);
      resolve({
        code: code ?? -1,
        signal: signal || null,
        stdout,
        stderr,
        timedOut,
        error: null,
      });
    });
  });
}

export async function runAp(
  args: string[],
  options: { timeoutMs?: number; cwd?: string; env?: Record<string, string> } = {},
): Promise<CommandResult> {
  return runCommand("ap", args, {
    timeoutMs: options.timeoutMs ?? 180_000,
    cwd: options.cwd ?? process.cwd(),
    env: {
      NO_COLOR: "1",
      TERM: "dumb",
      ...(options.env ?? {}),
    },
  });
}

export async function ensureApAvailable(): Promise<void> {
  const result = await runAp(["--help"], { timeoutMs: 10_000 });
  if (result.code !== 0) {
    throw new Error(
      `AgentPowers CLI not available. Install with: pip install agentpowers\n${formatCommandResult(result)}`,
    );
  }
}

export async function openInBrowser(
  url: string,
): Promise<{ ok: boolean; command: string; output: string }> {
  let command: string;
  let args: string[];

  if (process.platform === "darwin") {
    command = "open";
    args = [url];
  } else if (process.platform === "win32") {
    command = "cmd";
    args = ["/c", "start", "", url];
  } else {
    command = "xdg-open";
    args = [url];
  }

  const result = await runCommand(command, args, { timeoutMs: 10_000 });
  return {
    ok: result.code === 0,
    command: `${command} ${args.join(" ")}`,
    output: formatCommandResult(result),
  };
}
