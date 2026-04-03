/** Plugin state persistence for checkout tracking.
 * Stores state at ~/.agentpowers/plugin-state.json
 */

import { readFileSync, writeFileSync, mkdirSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { homedir } from "node:os";
import type { PluginState, CheckoutRecord } from "./types.js";

const STATE_FILE = join(homedir(), ".agentpowers", "plugin-state.json");

function readJsonFile<T>(filePath: string, fallback: T): T {
  try {
    if (!existsSync(filePath)) return fallback;
    const raw = readFileSync(filePath, "utf-8");
    const parsed = JSON.parse(raw);
    return (parsed && typeof parsed === "object") ? parsed as T : fallback;
  } catch {
    return fallback;
  }
}

function writeJsonFile(filePath: string, value: unknown): void {
  const parent = dirname(filePath);
  if (!existsSync(parent)) mkdirSync(parent, { recursive: true });
  writeFileSync(filePath, JSON.stringify(value, null, 2));
}

export function loadPluginState(): PluginState {
  const state = readJsonFile<PluginState>(STATE_FILE, { checkouts: {} });
  if (!state.checkouts || typeof state.checkouts !== "object") {
    state.checkouts = {};
  }
  return state;
}

export function savePluginState(state: PluginState): void {
  writeJsonFile(STATE_FILE, state);
}

export function rememberCheckout(record: Partial<CheckoutRecord> & { purchase_id: string }): void {
  if (!record.purchase_id) return;
  const state = loadPluginState();
  state.checkouts[record.purchase_id] = {
    ...state.checkouts[record.purchase_id],
    ...record,
    updated_at: new Date().toISOString(),
  } as CheckoutRecord;
  savePluginState(state);
}

export function getCheckoutRecord(purchaseId: string): CheckoutRecord | null {
  const state = loadPluginState();
  return state.checkouts[purchaseId] ?? null;
}
