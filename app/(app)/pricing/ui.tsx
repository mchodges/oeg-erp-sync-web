export function Spinner() {
  return (
    <svg className="animate-spin h-6 w-6 text-indigo-600" fill="none" viewBox="0 0 24 24">
      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
    </svg>
  );
}

export function Card({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return (
    <div className={`bg-white rounded-xl border border-gray-200 shadow-sm ${className}`}>
      {children}
    </div>
  );
}

export function ConfidenceBadge({ confidence }: { confidence: "High" | "Medium" | "Low" }) {
  const cls =
    confidence === "High"
      ? "bg-green-100 text-green-800"
      : confidence === "Medium"
      ? "bg-amber-100 text-amber-700"
      : "bg-gray-100 text-gray-500";
  return (
    <span className={`inline-flex items-center rounded px-2 py-0.5 text-xs font-medium ${cls}`}>
      {confidence}
    </span>
  );
}

export function ErrorCard({ error, onRetry }: { error: string; onRetry: () => void }) {
  return (
    <Card className="px-8 py-8 border-red-200">
      <div className="flex items-center gap-3 mb-5">
        <div className="w-9 h-9 rounded-full bg-red-100 flex items-center justify-center text-red-600 text-lg font-bold">
          !
        </div>
        <h2 className="text-lg font-semibold text-gray-900">Something went wrong</h2>
      </div>
      <pre className="text-sm text-red-700 bg-red-50 rounded-lg p-4 mb-6 whitespace-pre-wrap break-all font-mono">
        {error}
      </pre>
      <button
        onClick={onRetry}
        className="px-5 py-2.5 bg-gray-800 text-white text-sm font-semibold rounded-lg
          hover:bg-gray-700 focus:outline-none focus:ring-2 focus:ring-gray-500
          focus:ring-offset-2 transition-colors"
      >
        Try Again
      </button>
    </Card>
  );
}
