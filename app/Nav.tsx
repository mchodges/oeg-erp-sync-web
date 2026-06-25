"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

export function Nav() {
  const path = usePathname();

  const link = (href: string, label: string) => {
    const active = path === href;
    return (
      <Link
        href={href}
        className={`px-4 py-2.5 text-sm font-medium border-b-2 transition-colors ${
          active
            ? "border-white text-white"
            : "border-transparent text-indigo-300 hover:text-white hover:border-indigo-400"
        }`}
      >
        {label}
      </Link>
    );
  };

  return (
    <nav className="bg-indigo-800 px-4 flex gap-1">
      {link("/", "Hours Sync")}
      {link("/budget", "Budget Sync")}
    </nav>
  );
}
