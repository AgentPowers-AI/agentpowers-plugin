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

// ---------- Categories ----------

export interface CategoryItem {
  category: string;
  name: string;
  count: number;
  sample_keywords: string | null;
}

export interface CategoriesResponse {
  categories: CategoryItem[];
  total_count: number;
}

// ---------- Seller ----------

export interface SellerSkill {
  slug: string;
  title: string;
  price_cents: number;
  download_count: number;
}

export interface SellerProfile {
  display_name: string;
  bio: string | null;
  verified: boolean;
  total_skills: number;
  total_downloads: number;
  joined_at: string | null;
  website_url: string | null;
  github_url: string | null;
  linkedin_url: string | null;
  twitter_url: string | null;
  skills: SellerSkill[];
}

// ---------- Reviews ----------

export interface ReviewItem {
  author_display_name: string | null;
  rating: number;
  text: string | null;
}

export interface ReviewsResponse {
  items: ReviewItem[];
  total: number;
}

// ---------- Security ----------

export interface SecurityFinding {
  message?: string;
  detail?: string;
  title?: string;
}

export interface SecurityResults {
  slug: string;
  status: string;
  score: number | null;
  trust_level: string | null;
  findings: (SecurityFinding | string)[];
}

// ---------- Marketplace Health ----------

export interface HealthResponse {
  status: string;
  version: string;
}

export interface SkillsListResponse {
  items: NativeSearchItem[];
  total: number;
}

export interface SellersListResponse {
  total: number;
}

// ---------- Account ----------

export interface AuthMeResponse {
  email?: string;
  name?: string;
}

export interface AccountProfile {
  email: string | null;
  display_name: string | null;
  display_name_slug: string | null;
  github_username: string | null;
  joined_at: string | null;
  account_status: string | null;
  deletion_scheduled_at: string | null;
  bio: string | null;
}

// ---------- Purchases ----------

export interface Purchase {
  purchase_id: string;
  skill_slug: string;
  skill_title: string | null;
  status: string;
  amount_cents: number | null;
  license_code: string | null;
  purchased_at: string | null;
}

export interface PurchasesResponse {
  items: Purchase[];
}

// ---------- Checkout ----------

export interface CheckoutResponse {
  purchase_id: string;
  checkout_url: string;
  status: string;
}

export interface DownloadPurchasedResponse {
  url?: string;
  download_url?: string;
  slug: string;
}

// ---------- Checkout State ----------

export interface CheckoutRecord {
  purchase_id: string;
  slug: string;
  checkout_url: string;
  status: string;
  license_code?: string | null;
  purchased_at?: string | null;
  success_url?: string;
  cancel_url?: string;
  created_at?: string;
  updated_at?: string;
}

export interface PluginState {
  checkouts: Record<string, CheckoutRecord>;
}

// ---------- Platform ----------

export interface PlatformInfo {
  slug: string;
  name: string;
  tagline: string;
}
