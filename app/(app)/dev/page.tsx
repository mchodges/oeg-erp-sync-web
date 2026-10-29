import type { Metadata } from "next";
import { fetchDevTasks } from "@/lib/devTasks";
import { TaskBoard } from "./TaskBoard";
import { DECISIONS, HOW_IT_WORKS, PLACES } from "./content";

export const metadata: Metadata = {
  title: "Developer notes | OEG Sync Tools",
  robots: { index: false, follow: false },
};

// The backlog changes in Airtable between visits, so never serve a cached copy.
export const dynamic = "force-dynamic";

function Section({ title, hint, children }: { title: string; hint?: string; children: React.ReactNode }) {
  return (
    <section className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
      <h2 className="text-base font-semibold text-gray-900">{title}</h2>
      {hint && <p className="mt-0.5 text-xs text-gray-500">{hint}</p>}
      <div className="mt-4">{children}</div>
    </section>
  );
}

export default async function DevPage() {
  const { tasks, error } = await fetchDevTasks();

  return (
    <main className="min-h-screen bg-gray-50">
      <div className="mx-auto max-w-5xl space-y-6 px-6 py-8">
        <div>
          <h1 className="text-xl font-semibold text-gray-900">Developer notes</h1>
          <p className="mt-1 text-sm text-gray-500">
            Not linked from the menu. The backlog is read live from the Tasks table in the README Airtable base; the rest
            is written reference.
          </p>
        </div>

        <Section title="Backlog" hint="Live from Airtable. Edit tasks there; this view is read-only.">
          {error ? (
            <p className="rounded-md bg-amber-50 px-3 py-2 text-sm text-amber-800">{error}</p>
          ) : (
            <TaskBoard tasks={tasks} />
          )}
        </Section>

        <Section title="Settled decisions" hint="What was decided and why, so it is not re-argued from scratch.">
          <dl className="space-y-4">
            {DECISIONS.map((d) => (
              <div key={d.title}>
                <dt className="text-sm font-medium text-gray-900">{d.title}</dt>
                <dd className="mt-0.5 text-sm text-gray-600">{d.body}</dd>
              </div>
            ))}
          </dl>
        </Section>

        <Section title="How the bid pricing tool works" hint="Data flow from bid tab to price.">
          <ol className="space-y-3">
            {HOW_IT_WORKS.map((s) => (
              <li key={s.title}>
                <div className="text-sm font-medium text-gray-900">{s.title}</div>
                <p className="mt-0.5 text-sm text-gray-600">{s.body}</p>
              </li>
            ))}
          </ol>
        </Section>

        <Section title="Where things live">
          <dl className="divide-y divide-gray-100">
            {PLACES.map((p) => (
              <div key={p.name} className="grid gap-1 py-2.5 sm:grid-cols-[14rem_1fr]">
                <dt className="text-sm font-medium text-gray-900">{p.name}</dt>
                <dd className="break-words text-sm text-gray-600">{p.detail}</dd>
              </div>
            ))}
          </dl>
        </Section>
      </div>
    </main>
  );
}
