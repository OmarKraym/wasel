"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const LINKS = [
  { href: "/dashboard", label: "المحادثات" },
  { href: "/dashboard/orders", label: "الشحن" },
  { href: "/dashboard/settings", label: "الإعدادات" },
];

export function DashboardNav() {
  const pathname = usePathname();
  return (
    <nav className="flex gap-1 text-sm">
      {LINKS.map((l) => {
        const active = pathname === l.href;
        return (
          <Link
            key={l.href}
            href={l.href}
            aria-current={active ? "page" : undefined}
            className={`rounded px-3 py-1.5 ${active ? "bg-white/15 text-white" : "text-white/70 hover:text-white"}`}
          >
            {l.label}
          </Link>
        );
      })}
    </nav>
  );
}
