/** Formatting helpers for MCP tool output. */
import type { SectionedSearchResponse, UnifiedDetail } from "./types.js";
export declare function formatPrice(priceCents: number): string;
export declare function formatSecurityOutcome(outcome: string): string;
export declare function formatTrustLevel(level: string): string;
export declare function formatSearchResults(data: SectionedSearchResponse): string;
export declare function formatSkillDetail(detail: UnifiedDetail): string;
