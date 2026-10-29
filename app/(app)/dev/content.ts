/** Written reference for the /dev page. Update here when a decision changes; the task list itself is live from Airtable. */

export const HOW_IT_WORKS: { title: string; body: string }[] = [
  {
    title: "1. Ingest",
    body: "Bid-tab spreadsheets are read by lib/parseBidTab.ts (lettered sub-items such as A. 24-inch PIPE pick up their numbered heading row), de-duplicated on contractor + description + quantity + price, and stored in the Supabase table bid_history. Rows already stored are never rewritten.",
  },
  {
    title: "2. AI match",
    body: "Descriptions with no known match go to Claude (Haiku). It sees the catalog (name and unit, plus each item's Match_Notes), similar human-verified examples, and the rulebook text from the Matching_Rules table in Airtable. Guesses land in Living_Matches as Pending, or NO MATCH.",
  },
  {
    title: "3. Review",
    body: "Pending matches are verified, changed or ignored in the Ingest tab. Only human-verified matches teach the AI on later runs.",
  },
  {
    title: "4. Estimate",
    body: "lib/pricingMath.ts: resolve each bid to a catalog item, skip lines with no quantity or a unit that disagrees with the catalog, de-duplicate project + contractor + item + price, add up split bids (Combines_Into), throw out price outliers, then trim the top and bottom 10% and compute weighted average, median, low and high.",
  },
  {
    title: "5. Write to Airtable",
    body: "The Estimate tab's Write button updates the price columns on Master_Catalog. Preview first; it overwrites the previous numbers.",
  },
  {
    title: "6. Trends",
    body: "Reads bid_history by bid date and charts price movement per catalog item (lib/trends.ts, lib/priceTrend.ts).",
  },
];

export const DECISIONS: { title: string; body: string }[] = [
  {
    title: "Look-alike catalog items stay separate",
    body: "Sanitary service leads (6-inch PVC; split by long/short side and stack) vs water service leads (small flexible tubing; split by side and single/double). Fire Hydrant (hydrant only) vs Fire Hydrant Assembly (hydrant + lead + gate valve). Extra Depth manhole, storm vs sanitary. Wet Connection vs Plug and Clamp (water) vs Remove Existing 8\" Plug and Connect (sanitary). Confusion is handled with Match_Notes and Matching_Rules text in Airtable, not by merging items.",
  },
  {
    title: "Empty catalog items stay",
    body: "About 63 items have no bids. They are used to cost out project estimates (token or estimated prices go in by hand), so they are kept.",
  },
  {
    title: "Split bids are added into one all-in price",
    body: "Items with Combines_Into set are parts of an all-in item (basin excavation pieces; inlet Stage 1 + Stage 2 for types BB, C, C-2, C1, D1, E and H2; Type A has only Stage 1 so it is not linked). When one contractor bids every part on a project, their part prices are added into one sample for the all-in item. Matching is unchanged; the parts remain their own catalog items.",
  },
  {
    title: "Outlier screen",
    body: "On items with enough bids, a bid is thrown out when its price is far from the item's typical price. Low strays are mostly placeholders ($0.01, $1) so low prices are screened closely; high prices get more room because real expensive jobs exist. A whole expensive project (for example Harris Co. PCT 2 drainage) is not treated specially: accepted as how the data is. Settings are the constants at the top of lib/pricingMath.ts; thrown-out bids are listed and downloadable in the Estimate tab.",
  },
  {
    title: "Old files are left alone",
    body: "Changes to the importer apply to new imports. Files already ingested are not re-imported (that would add new rows beside the old ones).",
  },
  {
    title: "Engineer and owner",
    body: "Owner is not tracked. Engineer (the ARCH/ENG row in bid tabs) is wanted eventually. Plan: a small per-file project table keyed by source file, filled at ingest going forward, with a backfill that adds no new bid rows. Needs one Supabase SQL step from Mark. Not built.",
  },
  {
    title: "Revisit regularly",
    body: "A monthly or quarterly QA/QC check is a task in the backlog above: price movement per quarter, items with few or no bids, the outlier list, audit samples of auto-approved lines, and the parked questions (service-lead families, inlet combining, plug and clamp overlap, empty items, engineer capture, outlier settings).",
  },
];

export const PLACES: { name: string; detail: string }[] = [
  { name: "Airtable: Bid Pricing base", detail: "app82rCrgFJE4rhmc. Master_Catalog tblDnlYLkMpfX1mvy, Living_Matches tblmKKwQdncnKdhlE, Matching_Rules tblj0iUlOtRYMuGVV." },
  { name: "Airtable: DPP Projects base", detail: "app5bWT0n7TPWHWWy. Projects, Hours and Budgets tables used by Hours Sync and Budget Sync." },
  { name: "Airtable: README base", detail: "appPNmgsRA4jddQkl. Tasks table tblHKVKXgVU7NmY7K (the list above); project record recj16IDVEdMTBsXd." },
  { name: "Supabase", detail: "Table bid_history: one row per bid line (contractor, description, quantity, unit, price, project, bid date, source file)." },
  { name: "Where the code lives", detail: "UI in app/(app)/pricing, API routes in app/api/pricing, math in lib/pricingMath.ts and lib/combineBids.ts, importer in lib/parseBidTab.ts, AI matcher in lib/aiMatch.ts." },
  { name: "Environment variables (names only)", detail: "AIRTABLE_API_KEY, ANTHROPIC_API_KEY, SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, PRICING_BASE_ID, MASTER_CATALOG_TABLE_ID, LIVING_MATCHES_TABLE_ID, APP_PASSWORD, APP_USERNAME. Optional: README_BASE_ID, README_TASKS_TABLE_ID, README_PROJECT_RECORD_ID, MATCHING_RULES_TABLE_ID." },
  { name: "Password", detail: "/pricing, /api/pricing and /dev are behind HTTP Basic Auth (middleware.ts) when APP_PASSWORD is set. Hours Sync, Budget Sync and /workflows are not." },
];
