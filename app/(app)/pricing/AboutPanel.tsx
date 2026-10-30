import {
  HALF_LIFE_MONTHS,
  SOLID_MIN_BIDS,
  SOLID_MIN_PROJECTS,
  SOLID_WINDOW_MONTHS,
  STATS_WINDOWS_MONTHS,
} from "@/lib/recommendedPrice";
import { Card } from "./ui";

/** Share of a bid's influence left after it is `months` old. */
function weightAfter(months: number): string {
  return `${Math.round(0.5 ** (months / HALF_LIFE_MONTHS) * 100)}%`;
}

const AGES = [0, 3, 6, 12, 24];

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <Card className="px-6 py-5">
      <h2 className="text-base font-semibold text-gray-900">{title}</h2>
      <div className="mt-2 space-y-2 text-sm text-gray-600 leading-relaxed">{children}</div>
    </Card>
  );
}

export function AboutPanel() {
  return (
    <div className="space-y-4">
      <Section title="What this tool does">
        <p>
          It turns past bid tabs into a current unit price for every item in the Master Catalog. Bid tabs go in on{" "}
          <b>Ingest</b>, the AI proposes which catalog item each line belongs to and a person confirms it,{" "}
          <b>Estimate</b> works out the prices, and <b>Trends</b> shows how an item&apos;s bids moved over time. The
          prices are saved to the Master Catalog in Airtable. The AI only matches wording to catalog items; it never
          makes up a price.
        </p>
      </Section>

      <Section title="How the recommended price works">
        <ol className="list-decimal pl-5 space-y-1.5">
          <li>
            <b>Clean the bids.</b> Lines with no quantity, a unit that does not match the catalog, or repeated copies
            are skipped. Split bids (excavate plus haul, inlet Stage 1 plus Stage 2) are added into one all-in price.
            Stray prices are thrown out, and token bids such as $0.01 or $1 on a $1,500 item always are. The Estimate
            screen lists every bid it threw out.
          </li>
          <li>
            <b>Recent bids count more.</b> Every bid still counts, but it loses half its influence for each{" "}
            {HALF_LIFE_MONTHS} months it is old:
            <div className="mt-1.5 flex flex-wrap gap-2">
              {AGES.map((m) => (
                <span key={m} className="rounded-md bg-gray-50 border border-gray-200 px-2.5 py-1 text-xs text-gray-700">
                  {m === 0 ? "new" : `${m} months old`}: <b>{weightAfter(m)}</b>
                </span>
              ))}
            </div>
            <span className="block mt-1.5">
              For an item bid steadily, about 55% of the influence comes from the last 6 months and about 80% from the
              last 12. A year of history is not ignored, but the recent bids set the price.
            </span>
          </li>
          <li>
            <b>The recommended price is the middle price</b> (a weighted median), not the average, so one wild bid cannot
            drag it.
          </li>
          <li>
            <b>Middle half</b> is the range that half of the bids fell inside (25th to 75th percentile, same weighting).
            It is the normal spread to expect on a new job, not an error bar: even the best method misses by about 8% on
            a typical item because every project is different.
          </li>
        </ol>
      </Section>

      <Section title="Confidence">
        <ul className="list-disc pl-5 space-y-1">
          <li>
            <b>Solid:</b> {SOLID_MIN_BIDS}+ bids from {SOLID_MIN_PROJECTS}+ projects in the last {SOLID_WINDOW_MONTHS}{" "}
            months. Use the price as is.
          </li>
          <li>
            <b>Thin:</b> some bids, but fewer than that. A reasonable starting point; check it against the middle half
            and the basis text.
          </li>
          <li>
            <b>None:</b> no usable bids. Type your own price into <b>Manual_Override</b> in Airtable.
          </li>
        </ul>
      </Section>

      <Section title="The other columns (count, average, median, low, high)">
        <p>
          These use only the item&apos;s <b>recent window</b>: the last {STATS_WINDOWS_MONTHS[0]} months if that has
          enough bids to be Solid, otherwise the last {STATS_WINDOWS_MONTHS[1]} months, otherwise all history. The small
          label under Count shows which window each item used. They agree with the recommended price within about 1% on
          a typical item.
        </p>
      </Section>

      <Section title="Where the numbers go">
        <ul className="list-disc pl-5 space-y-1">
          <li>
            <b>Write to Airtable</b> (Estimate tab) updates every Master Catalog item: Recommended_Price, the middle
            half, Confidence, and the basis text. <b>Price_Used</b> is your Manual_Override if you typed one, otherwise
            the recommended price. Manual_Override is never overwritten.
          </li>
          <li>
            Items ticked <b>Core</b> in the catalog also get one <b>Price_History</b> row per month. Running Write
            again updates those rows; it never duplicates them.
          </li>
          <li>
            In Airtable, the <b>Current Prices</b> page lists everything by category and <b>Price Trends</b> charts a
            core item month by month.
          </li>
        </ul>
      </Section>

      <Section title="Routine and limits">
        <ul className="list-disc pl-5 space-y-1">
          <li>
            <b>Each month:</b> ingest the new bid tabs, review the AI matches, then run Estimate. <b>Each quarter:</b>{" "}
            run Write to Airtable and take the PCE prices from Price_Used.
          </li>
          <li>These are bid prices, not final construction costs, and they only cover items that were actually bid.</li>
          <li>
            Items that cover a range of sizes (for example a 48&quot;–72&quot; manhole) can drift because the mix of
            sizes changed, not because prices did.
          </li>
        </ul>
      </Section>
    </div>
  );
}
