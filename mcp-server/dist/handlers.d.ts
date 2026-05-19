/** MCP tool handler functions — business logic for each tool. */
import type { InstalledSkillInfo } from "./types.js";
export declare function handleSearchMarketplace(args: Record<string, unknown>): Promise<string>;
export declare function handleGetSkillDetails(args: Record<string, unknown>): Promise<string>;
export declare function handleInstallSkill(args: Record<string, unknown>): Promise<string>;
export declare function handleCheckPurchaseStatus(args: Record<string, unknown>): Promise<string>;
/** Scan ~/.claude/{skills,agents}/ directories and cross-reference pins.json. */
export declare function getInstalledSkills(): InstalledSkillInfo[];
export declare function handleCheckInstalled(): Promise<string>;
export declare function handleUninstallSkill(args: Record<string, unknown>): Promise<string>;
export declare function handleCheckForUpdates(): Promise<string>;
