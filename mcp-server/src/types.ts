/** Type definitions for API responses — shared across MCP server modules. */

export interface NativeSearchItem {
  slug: string;
  title: string;
  description: string;
  category: string;
  type: string;
  price_cents: number;
  currency: string;
  version: string;
  security_status: string;
  download_count: number;
  author: { display_name: string | null; github_username: string | null } | null;
}

export interface ExternalSearchItem {
  slug: string;
  title: string;
  description: string;
  author: string;
  source: string;
  source_url: string;
  source_installs: number | null;
  source_rating: number | null;
  price_cents: number;
  version: string | null;
  ap_security_status: string | null;
  ap_security_score: number | null;
  ap_scanned_at: string | null;
}

export interface SearchSection<T> {
  items: T[];
  total: number;
}

export interface SectionedSearchResponse {
  agentpowers: SearchSection<NativeSearchItem>;
  [source: string]: SearchSection<NativeSearchItem | ExternalSearchItem>;
}

/** Matches UnifiedDetailResponse from the API. */
export interface UnifiedDetail {
  source: string;
  slug: string;
  title: string;
  description: string;
  long_description: string | null;
  category: string | null;
  type: string | null;
  price_cents: number;
  currency: string | null;
  version: string | null;
  security_status: string | null;
  security_score: number | null;
  trust_level: string | null;
  download_count: number | null;
  platforms: string[] | null;
  published_at: string | null;
  created_at: string | null;
  updated_at: string | null;
  archived_at: string | null;
  // Author info
  author_display_name: string | null;
  author_slug: string | null;
  author_github: string | null;
  author_avatar_url: string | null;
  // External source fields
  source_url: string | null;
  source_downloads: number | null;
  source_stars: number | null;
  source_comments: number | null;
  source_versions_count: number | null;
  source_installs: number | null;
  // Reviews
  rating_average: number | null;
  rating_count: number;
  // Scan cache (for external)
  ap_security_status: string | null;
  ap_security_score: number | null;
  ap_scan_hash: string | null;
  ap_scanned_at: string | null;
}

export interface DownloadResponse {
  url: string;
  slug: string;
}

export interface PurchaseStatus {
  purchase_id: string;
  status: string;
  skill_slug: string;
  license_code?: string;
}

/** Pin entry stored in ~/.agentpowers/pins.json */
export interface PinEntry {
  source: string;
  version: string | null;
  content_hash: string;
  installed_at: string;
  scanned_at: string;
  security_status: string;
  type?: "skill" | "agent";
}

export interface PinsFile {
  [slug: string]: PinEntry;
}

/** Installed skill info returned by check_installed tool. */
export interface InstalledSkillInfo {
  slug: string;
  source: string;
  version: string | null;
  security_status: string;
  install_type: "skill" | "agent";
  is_edited: boolean;
}
