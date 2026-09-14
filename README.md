# oeg-erp-sync-web

Next.js web app (Vercel) hosting three internal tools:
- **Hours Sync** (`/`) — syncs OEG ERP time report hours into the Airtable
  DPP Projects → Hours table.
- **Budget Sync** (`/budget`) — syncs Project Contract Status budgets into
  the Airtable DPP Projects → Budgets table.
- **Bid Pricing** (`/pricing`) — extracts historical bid-tab pricing,
  standardizes line items against a Master Catalog (AI-assisted via Claude),
  and computes Weighted Average/Median/Low/High pricing per item. See
  [§ Bid Pricing Estimator](#bid-pricing-estimator) below.

Each tool follows the same upload → dry-run preview → **Confirm** pattern.

---

## Local development

```bash
npm install
cp .env.example .env.local   # fill in the values below
npm run dev                  # http://localhost:3000
```

**Airtable token:** create one at <https://airtable.com/create/tokens>.
Required scopes on the **DPP Projects** base (Hours/Budget Sync) and the
**Bid Pricing** base (Bid Pricing Estimator):
- `data.records:read`
- `data.records:write`

---

## Deploy to Vercel

### Option A — GitHub integration (recommended)

1. Push this folder to a GitHub repo.
2. Go to <https://vercel.com/new>, import the repo.
3. Framework: **Next.js** (auto-detected).
4. Add the environment variables from `.env.example` (Airtable, and — if
   using Bid Pricing — Anthropic + Supabase + the Bid Pricing base/table ids).
5. Click **Deploy**.

Every push to `main` re-deploys automatically.

### Option B — Vercel CLI

```bash
npm i -g vercel
vercel             # follow prompts
vercel env add AIRTABLE_API_KEY   # paste your token when prompted
vercel --prod
```

---

## How it works

### Step 1 — Upload
Drop the `.xlsx` report on the page. The file is sent to `/api/plan`.

### Step 2 — Plan (read-only)
The server:
1. Parses the "Time and Expenses Summarized" sheet with SheetJS.
2. Fetches all tracked projects (`Tracking = true`) from Airtable.
3. Batch-fetches all linked Hours records to check `EntryDate`.
4. Computes an action plan — `CREATE`, `UPDATE`, `SKIP-TODAY`, `SKIP-NOERP`,
   or `NOMATCH` — for every tracked project.
5. Returns the plan JSON to the browser. **Nothing is written yet.**

### Step 3 — Preview & confirm
The browser renders the plan as a table. You review it, then click
**Confirm Sync** to call `/api/sync`, which executes the writes.

---

## Bid Pricing Estimator

Ported from a Google Colab notebook ("OEG Unit Price Update"). Two modes on
one page (`/pricing`):

**Ingest** — upload bid-tab `.xlsx` files (multiple at once). Each file's
line-item × contractor prices are parsed and added to a permanent history
table in **Supabase** (`bid_history`) — only new files need uploading, ever;
already-ingested rows are skipped by a dedup key. Descriptions that don't
resolve against the Master Catalog / verified Living Matches get scanned and
batch-matched by **Claude** (`lib/aiMatch.ts`), then reviewed in-app
(approve/reject/correct) before being saved as verified mappings.

**Estimate** — computes Count/Weighted Avg/Median/Low/High per Master
Catalog item from the full bid history (10% outlier trim when ≥5 samples,
same as the original notebook), writes the results back onto the Airtable
Master Catalog records, and offers a CSV download.

**Data storage split** (see `.env.example` for the env vars):
- Small, human-edited reference data — **Airtable**, in a separate "Bid
  Pricing" base: `Master_Catalog` and `Living_Matches` tables. Must be
  created and seeded manually (see below) before this tool will work.
- High-volume, ever-growing bid history — **Supabase** (`bid_history` table,
  avoids Airtable's ~50k record ceiling). Run this DDL in the Supabase SQL
  editor once:
  ```sql
  create table bid_history (
    id bigint generated always as identity primary key,
    source_file text not null,
    project_name text,
    bid_date text,
    contractor text not null,
    original_description text not null,
    qty numeric not null,
    unit text,
    price numeric not null,
    ingested_at timestamptz not null default now(),
    constraint bid_history_dedup_key
      unique (source_file, contractor, original_description, qty, price)
  );
  create index bid_history_source_file_idx on bid_history (source_file);
  create index bid_history_original_description_idx on bid_history (original_description);
  alter table bid_history enable row level security;
  ```

**Airtable base setup** — create a base (e.g. "Bid Pricing") with:
- `Master_Catalog`: `Master_Item_Name` (primary), `Standard_Unit`, `Count`,
  `Weighted_Avg`, `Median`, `Low`, `High`, `Last_Estimated_Date`. Seed this
  with your real catalog items — an empty catalog means everything resolves
  to `"REVIEW"`.
- `Living_Matches`: `Raw_Description` (primary), `Raw_Unit`,
  `AI_Guessed_Master_Item` (single line text — an immutable audit trail of
  Claude's raw guess, kept as text since it may not always match a real
  catalog item), `Master_Item` (**Link to another record → Master_Catalog**,
  single record — the operational field the app actually reads; a link
  keeps matching robust to catalog renames, unlike a text copy of the name),
  `Confidence` (single select: High/Medium/Low), `Status` (single select:
  Pending/Verified/Ignored).

---

## Project structure

```
app/
  page.tsx              — Hours Sync UI (upload → preview → confirm → done)
  budget/page.tsx        — Budget Sync UI
  pricing/               — Bid Pricing Estimator UI (Ingest / Estimate tabs)
  api/
    plan/, sync/                — Hours Sync routes
    budget-plan/, budget-sync/  — Budget Sync routes
    pricing/                    — Bid Pricing routes (harvest, ai-match,
                                   living-matches review, estimate, ...)
lib/
  erpCodes.ts           — TITLE_MAP, codeMatches(), aggregateHours()
  parseReport.ts        — SheetJS XLSX parsing (Hours Sync)
  parseBudget.ts         — SheetJS XLSX parsing (Budget Sync)
  parseBidTab.ts          — SheetJS XLSX parsing (Bid Pricing bid tabs)
  pricingMath.ts           — Weighted Avg/Median/Low/High computation
  aiMatch.ts                — Claude batch line-item matching
  airtable.ts            — Airtable REST API wrappers (shared)
  airtablePricing.ts       — Bid Pricing base/table ids + dictionary map
  supabase.ts               — Supabase client + bid_history helpers
types/
  index.ts              — shared TypeScript types
```

---

## Adding a new position title

1. Open `lib/erpCodes.ts`.
2. Add an entry to `TITLE_MAP` (key = lowercase ERP title, value = Airtable field name):
   ```ts
   "new erp title": "Airtable Field Name",
   ```
3. If the Airtable field doesn't exist yet, add it to the Hours table first,
   then add the name to `ALL_POSITIONS` in the same file.
4. Push to GitHub — Vercel redeploys automatically.

---

## Airtable structure

| | ID |
|---|---|
| Base | `app5bWT0n7TPWHWWy` |
| Projects table | `tblWeL8UyZm5pRf6h` |
| Hours table | `tbl1vOP20ZQUg6nG6` |

**Do not write to** formula/rollup fields: `Total Hours`, `IfCurrent`,
`LatestEntryDate`, `CAD Hours`, `Design Hours`, `PM Hours`, `PE Hours`,
`DM Hours`, `Project Name`.
