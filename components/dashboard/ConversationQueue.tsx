"use client";

import { useMemo, useState } from "react";
import { Search } from "lucide-react";
import type { Conversation, Order } from "@/lib/types";
import { badgeFor, type Badge } from "@/lib/ui/status";

const TONE: Record<Badge["tone"], string> = {
  green: "bg-ok-bg text-ok",
  yellow: "bg-warn-bg text-warn",
  red: "bg-risk-bg text-risk",
  neutral: "bg-carbon-soft text-carbon",
  done: "bg-mist text-muted",
};
const DOT: Record<Badge["tone"], string> = {
  green: "bg-ok",
  yellow: "bg-saffron",
  red: "bg-risk",
  neutral: "bg-carbon",
  done: "bg-line",
};

type Filter = "all" | "ready" | "attention";

function timeAgo(iso: string): string {
  const mins = Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 60000));
  if (mins < 1) return "توا";
  if (mins < 60) return `${mins} د`;
  const h = Math.round(mins / 60);
  if (h < 24) return `${h} س`;
  return `${Math.round(h / 24)} يوم`;
}

export function ConversationQueue(props: {
  conversations: Conversation[];
  ordersByConv: Record<string, Order>;
  selectedId: string | null;
  onSelect: (id: string) => void;
  live: boolean;
}) {
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<Filter>("all");

  const rows = useMemo(() => {
    const q = query.trim();
    return props.conversations
      .map((c) => ({ c, order: props.ordersByConv[c.id], badge: badgeFor(props.ordersByConv[c.id]) }))
      .filter(({ c, order, badge }) => {
        if (filter === "ready" && badge.tone !== "green") return false;
        if (filter === "attention" && badge.tone !== "yellow" && badge.tone !== "red") return false;
        if (!q) return true;
        return [c.customer_display_name, order?.customer_name, order?.phone_primary, order?.city]
          .filter(Boolean)
          .some((v) => v!.includes(q));
      });
  }, [props.conversations, props.ordersByConv, query, filter]);

  const counts = useMemo(() => {
    let ready = 0;
    let attention = 0;
    for (const c of props.conversations) {
      const t = badgeFor(props.ordersByConv[c.id]).tone;
      if (t === "green") ready++;
      if (t === "yellow" || t === "red") attention++;
    }
    return { ready, attention };
  }, [props.conversations, props.ordersByConv]);

  return (
    <>
      <div className="space-y-3 border-b border-line p-3">
        <div className="flex items-center justify-between">
          <h2 className="font-display text-lg font-semibold">المحادثات</h2>
          <span className="flex items-center gap-1.5 text-xs text-muted" aria-live="polite">
            <span className={`size-2 rounded-full ${props.live ? "bg-ok" : "bg-line"}`} />
            {props.live ? "مباشر" : "غير متصل"}
          </span>
        </div>
        <label className="relative block">
          <span className="sr-only">بحث</span>
          <Search className="pointer-events-none absolute inset-y-0 start-2.5 my-auto size-4 text-muted" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="اسم، رقم، مدينة"
            className="w-full rounded-md border border-line bg-mist py-2 ps-8 pe-3 text-sm focus:border-carbon focus:bg-white focus:outline-none"
          />
        </label>
        <div className="flex gap-1 text-xs" role="group" aria-label="تصفية">
          {([
            ["all", "الكل", null],
            ["ready", "جاهز", counts.ready],
            ["attention", "يحتاج متابعة", counts.attention],
          ] as const).map(([id, label, n]) => (
            <button
              key={id}
              aria-pressed={filter === id}
              onClick={() => setFilter(id)}
              className={`flex items-center gap-1.5 rounded-full px-3 py-1 ${filter === id ? "bg-ink text-white" : "bg-mist text-ink-soft hover:bg-line"}`}
            >
              {label}
              {n !== null && <span className="ltr-nums opacity-70">{n}</span>}
            </button>
          ))}
        </div>
      </div>

      <ul className="min-h-0 flex-1 overflow-y-auto">
        {rows.length === 0 && <li className="p-6 text-center text-sm text-muted">ما فيش نتائج.</li>}
        {rows.map(({ c, order, badge }) => {
          const active = c.id === props.selectedId;
          return (
            <li key={c.id}>
              <button
                onClick={() => props.onSelect(c.id)}
                aria-current={active ? "true" : undefined}
                className={`flex w-full items-start gap-3 border-b border-line/60 px-3 py-3 text-start ${active ? "bg-carbon-soft" : "hover:bg-mist"}`}
              >
                <span className={`mt-1.5 size-2.5 shrink-0 rounded-full ${DOT[badge.tone]}`} aria-hidden />
                <span className="min-w-0 flex-1">
                  <span className="flex items-baseline justify-between gap-2">
                    <span className="truncate font-medium">{order?.customer_name || c.customer_display_name || "زبون جديد"}</span>
                    <span className="shrink-0 text-xs text-muted">{timeAgo(c.last_message_at)}</span>
                  </span>
                  <span className="mt-1 flex items-center gap-2 text-xs">
                    <span className={`rounded px-1.5 py-0.5 font-medium ${TONE[badge.tone]}`}>{badge.label}</span>
                    <span className="text-muted">{c.platform === "instagram" ? "إنستغرام" : "ماسنجر"}</span>
                    {order?.city && <span className="truncate text-muted">· {order.city}</span>}
                  </span>
                </span>
              </button>
            </li>
          );
        })}
      </ul>
    </>
  );
}
