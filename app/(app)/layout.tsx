import { Nav } from "./Nav";

export default function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <>
      <header className="bg-indigo-700 px-6 py-3 shadow">
        <h1 className="text-lg font-semibold text-white tracking-tight">
          OEG Sync Tools
        </h1>
        <p className="text-indigo-300 text-xs mt-0.5">ERP syncs, bid pricing and process workflows</p>
      </header>
      <Nav />
      {children}
    </>
  );
}
