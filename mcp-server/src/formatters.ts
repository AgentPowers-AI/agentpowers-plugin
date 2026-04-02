/** Formatting helpers for MCP tool output. */

import type {
  NativeSearchItem,
  ExternalSearchItem,
  SearchSection,
  SectionedSearchResponse,
  UnifiedDetail,
} from "./types.js";

export function formatPrice(priceCents: number): string {
  if (priceCents === 0) return "Free";
  return `$${(priceCents / 100).toFixed(2)}`;
}

export function formatSecurityOutcome(outcome: string): string {
  switch (outcome.toUpperCase()) {
    case "PASS":
      return "Passed security review";
    case "WARN":
      return "Passed with warnings";
    case "BLOCK":
      return "Blocked - security issues found";
    default:
      return outcome;
  }
}

export function formatTrustLevel(level: string): string {
  switch (level.toLowerCase()) {
    case "verified":
      return "Verified publisher";
    case "community":
      return "Community contributor";
    case "official":
      return "Official AgentPowers";
    default:
      return level;
  }
}

function formatNativeItem(item: NativeSearchItem): string[] {
  const lines: string[] = [];
  lines.push(`## ${item.title} (\`${item.slug}\`)`);
  lines.push(`- **Type:** ${item.type}`);
  lines.push(`- **Category:** ${item.category}`);
  lines.push(`- **Version:** ${item.version}`);
  lines.push(`- **Price:** ${formatPrice(item.price_cents)}`);
  lines.push(`- **Security:** ${formatSecurityOutcome(item.security_status)}`);
  if (item.author) {
    const authorName = item.author.display_name || item.author.github_username || "Unknown";
    lines.push(`- **Author:** ${authorName}`);
  }
  lines.push(`- **Downloads:** ${item.download_count}`);
  lines.push(`- ${item.description}`);
  lines.push("");
  return lines;
}

function formatExternalItem(item: ExternalSearchItem): string[] {
  const lines: string[] = [];
  lines.push(`## ${item.title} (\`${item.slug}\`)`);
  lines.push(`- **Author:** ${item.author}`);
  lines.push(`- **Price:** ${formatPrice(item.price_cents)}`);
  if (item.ap_security_status) {
    lines.push(`- **AgentPowers Scan:** ${formatSecurityOutcome(item.ap_security_status)}`);
  } else {
    lines.push(`- **AgentPowers Scan:** Not yet scanned`);
  }
  if (item.source_installs != null) {
    lines.push(`- **Installs:** ${item.source_installs}`);
  }
  if (item.version) {
    lines.push(`- **Version:** ${item.version}`);
  }
  lines.push(`- **Source URL:** ${item.source_url}`);
  lines.push(`- ${item.description}`);
  lines.push("");
  return lines;
}

export function formatSearchResults(data: SectionedSearchResponse): string {
  const native = data.agentpowers;
  const externalSources = Object.keys(data).filter((k) => k !== "agentpowers");

  const totalResults =
    native.total +
    externalSources.reduce(
      (sum, key) => sum + (data[key] as SearchSection<ExternalSearchItem>).total,
      0,
    );

  if (totalResults === 0) {
    return "No results found.";
  }

  const lines: string[] = [];

  // Native AgentPowers results
  if (native.items.length > 0) {
    lines.push(`# AgentPowers Marketplace (${native.total} result${native.total === 1 ? "" : "s"})\n`);
    for (const item of native.items) {
      lines.push(...formatNativeItem(item));
    }
  }

  // External source results
  for (const source of externalSources) {
    const section = data[source] as SearchSection<ExternalSearchItem>;
    if (section.items.length > 0) {
      const label = source.charAt(0).toUpperCase() + source.slice(1);
      lines.push(`# ${label} (${section.total} result${section.total === 1 ? "" : "s"})\n`);
      for (const item of section.items) {
        lines.push(...formatExternalItem(item));
      }
    }
  }

  return lines.join("\n");
}

export function formatSkillDetail(detail: UnifiedDetail): string {
  const lines = [
    `# ${detail.title} (\`${detail.slug}\`)`,
    "",
    detail.description,
    "",
    `- **Source:** ${detail.source}`,
    `- **Type:** ${detail.type ?? "--"}`,
    `- **Version:** ${detail.version ?? "--"}`,
    `- **Price:** ${formatPrice(detail.price_cents)}`,
  ];

  // Security: native uses security_status, external uses ap_security_status
  const secStatus = detail.security_status ?? detail.ap_security_status;
  lines.push(`- **Security:** ${secStatus ? formatSecurityOutcome(secStatus) : "--"}`);

  if (detail.trust_level) {
    lines.push(`- **Trust:** ${formatTrustLevel(detail.trust_level)}`);
  }

  // Author: prefer display_name, fall back to github
  const authorName = detail.author_display_name || detail.author_github || null;
  lines.push(`- **Author:** ${authorName ?? "--"}`);

  // Rating
  if (detail.rating_average != null) {
    lines.push(`- **Rating:** ${detail.rating_average}/5 (${detail.rating_count} review${detail.rating_count === 1 ? "" : "s"})`);
  }

  // Downloads: prefer download_count, fall back to source_downloads/source_installs
  const downloads = detail.download_count ?? detail.source_downloads ?? detail.source_installs;
  lines.push(`- **Downloads:** ${downloads ?? "--"}`);

  if (detail.platforms && detail.platforms.length > 0) {
    lines.push(`- **Platforms:** ${detail.platforms.join(", ")}`);
  }

  if (detail.category) {
    lines.push(`- **Category:** ${detail.category}`);
  }

  if (detail.source_url) {
    lines.push(`- **Source URL:** ${detail.source_url}`);
  }

  if (detail.updated_at) {
    lines.push(`- **Updated:** ${detail.updated_at}`);
  }

  if (detail.long_description) {
    lines.push("", "---", "", detail.long_description);
  }

  return lines.join("\n");
}
