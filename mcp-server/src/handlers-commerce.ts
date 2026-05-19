/** Commerce MCP tool handlers — categories, reviews, checkout, profile, purchases. */

import { apiGet, APIError } from "./api-client.js";
import { loadAuthToken } from "./auth.js";
import { formatPrice } from "./formatters.js";

const FRONTEND_BASE_URL = (
  process.env.AGENTPOWERS_FRONTEND_URL || "https://agentpowers.ai"
).replace(/\/$/, "");
import type {
  ReviewListResponse,
  UnifiedDetail,
  UserProfile,
  PurchaseListResponse,
} from "./types.js";

/**
 * Category shape returned by the API — matches server's Pydantic
 * CategoryItem in agentpowers-api/src/models/responses.py.
 *
 * Defined locally (rather than imported from @agentpowers/core) because
 * the published @agentpowers/core@0.1.x incorrectly typed these as
 * {slug, skill_count}. The server has always returned {category, name,
 * count, ...}. Core will be fixed in a separate PR.
 */
interface CategoryItemFromApi {
  category: string;
  name: string | null;
  description: string | null;
  icon: string | null;
  sample_keywords: string;
  count: number;
}

interface CategoriesResponseFromApi {
  categories: CategoryItemFromApi[];
  total_count: number;
}

export async function handleGetCategories(): Promise<string> {
  const data = await apiGet<CategoriesResponseFromApi>("/v1/categories");
  const categories = data.categories;

  if (!categories || categories.length === 0) {
    return "No categories found.";
  }

  const lines = [`# Marketplace Categories (${categories.length})\n`];

  for (const cat of categories) {
    const icon = cat.icon ? `${cat.icon} ` : "";
    // `cat.name` can be null if the category_index row has a null name —
    // fall back to the category slug so we never render "null".
    const label = cat.name ?? cat.category;
    lines.push(`## ${icon}${label} (\`${cat.category}\`)`);
    if (cat.description) {
      lines.push(cat.description);
    }
    lines.push(`- **Skills:** ${cat.count}`);
    lines.push("");
  }

  return lines.join("\n");
}

export async function handleGetSkillReviews(
  args: Record<string, unknown>,
): Promise<string> {
  const slug = args.slug != null ? String(args.slug) : "";
  if (!slug) {
    return "Missing required argument: slug";
  }

  const data = await apiGet<ReviewListResponse>(
    `/v1/skills/${encodeURIComponent(slug)}/reviews`,
  );
  const reviews = data.reviews;

  if (!reviews || reviews.length === 0) {
    return `No reviews found for "${slug}".`;
  }

  const avgLine = data.average_rating != null
    ? ` | Average: ${data.average_rating.toFixed(1)}/5`
    : "";
  const lines = [`# Reviews for \`${slug}\` (${data.total}${avgLine})\n`];

  for (const review of reviews) {
    const stars = "\u2605".repeat(review.rating) + "\u2606".repeat(5 - review.rating);
    lines.push(`### ${stars} by ${review.author}`);
    if (review.text) {
      lines.push(review.text);
    }
    lines.push(`_${review.created_at}_`);
    lines.push("");
  }

  return lines.join("\n");
}

export async function handleStartCheckout(
  args: Record<string, unknown>,
): Promise<string> {
  const slug = args.slug != null ? String(args.slug) : "";
  if (!slug) {
    return "Missing required argument: slug";
  }

  // Fetch skill details to check price
  const detail = await apiGet<UnifiedDetail>(
    `/v1/detail/${encodeURIComponent(slug)}`,
  );

  if (detail.price_cents === 0) {
    return `"${detail.title}" is free! Use the \`install_skill\` tool to install it directly.`;
  }

  const checkoutUrl = `${FRONTEND_BASE_URL}/skills/${encodeURIComponent(slug)}?action=buy`;

  const lines = [
    `# Purchase "${detail.title}"`,
    "",
    `- **Price:** ${formatPrice(detail.price_cents)}`,
    "",
    `**Checkout URL:** ${checkoutUrl}`,
    "",
    "Open this URL in your browser to complete the purchase via Stripe.",
    "After payment, use `install_skill` to download and install it.",
  ];

  return lines.join("\n");
}

export async function handleGetAccountProfile(): Promise<string> {
  const auth = loadAuthToken();
  if (!auth) {
    return "Not authenticated. Run `npx @agentpowers/cli login` first.";
  }

  const profile = await apiGet<UserProfile>(
    "/v1/users/profile",
    undefined,
    auth,
  );

  const lines = [
    "# Your AgentPowers Profile",
    "",
    `- **Name:** ${profile.display_name ?? "--"}`,
    `- **Slug:** ${profile.display_name_slug ?? "--"}`,
    `- **Email:** ${profile.email ?? "--"}`,
    `- **GitHub:** ${profile.github_username ?? "--"}`,
  ];

  if (profile.bio) {
    lines.push(`- **Bio:** ${profile.bio}`);
  }

  if (profile.created_at) {
    lines.push(`- **Member since:** ${profile.created_at}`);
  }

  return lines.join("\n");
}

export async function handleListPurchases(
  args: Record<string, unknown>,
): Promise<string> {
  const auth = loadAuthToken();
  if (!auth) {
    return "Not authenticated. Run `npx @agentpowers/cli login` first.";
  }

  const limit = args.max_results ? Number(args.max_results) : 20;

  const data = await apiGet<PurchaseListResponse>(
    "/v1/purchases",
    { limit },
    auth,
  );
  const purchases = data.purchases;

  if (!purchases || purchases.length === 0) {
    return "No purchases found.";
  }

  const lines = [`# Your Purchases (${data.total})\n`];

  for (const p of purchases) {
    const price = formatPrice(p.amount_cents);
    const statusLabel = p.status === "completed" ? "Active" : p.status;
    lines.push(`## ${p.title} (\`${p.slug}\`)`);
    lines.push(`- **Price:** ${price}`);
    lines.push(`- **Status:** ${statusLabel}`);
    lines.push(`- **Purchased:** ${p.purchased_at}`);
    if (p.license_code) {
      lines.push(`- **License:** ${p.license_code}`);
    }
    lines.push("");
  }

  return lines.join("\n");
}
