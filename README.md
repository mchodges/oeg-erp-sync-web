# oeg-erp-sync-web

Next.js web app (Vercel) for syncing OEG ERP time report hours into the
Airtable DPP Projects → Hours table. Upload the XLSX, review the dry-run
preview in your browser, click **Confirm Sync**.

---

## Local development

```bash
npm install
cp .env.example .env.local   # add your Airtable personal access token
npm run dev                  # http://localhost:3000
```

**Airtable token:** create one at <https://airtable.com/create/tokens>.
Required scopes on the **DPP Projects** base:
- `data.records:read`
- `data.records:write`

---

## Deploy to Vercel

### Option A — GitHub integration (recommended)

1. Push this folder to a GitHub repo.
2. Go to <https://vercel.com/new>, import the repo.
3. Framework: **Next.js** (auto-detected).
4. Add environment variable: `AIRTABLE_API_KEY = pat...`
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

## Project structure

```
app/
  page.tsx              — UI (upload → preview → confirm → done)
  api/
    plan/route.ts       — parse + compute plan, no writes
    sync/route.ts       — execute Airtable creates/updates
lib/
  erpCodes.ts           — TITLE_MAP, codeMatches(), aggregateHours()
  parseReport.ts        — SheetJS XLSX parsing
  airtable.ts           — Airtable REST API wrappers
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
