/** Commerce MCP tool handlers — categories, reviews, checkout, profile, purchases. */
export declare function handleGetCategories(): Promise<string>;
export declare function handleGetSkillReviews(args: Record<string, unknown>): Promise<string>;
export declare function handleStartCheckout(args: Record<string, unknown>): Promise<string>;
export declare function handleGetAccountProfile(): Promise<string>;
export declare function handleListPurchases(args: Record<string, unknown>): Promise<string>;
