"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import type { Conversation, Merchant, Order, Product } from "@/lib/types";
import { ConversationQueue } from "./ConversationQueue";
import { ChatStream } from "./ChatStream";
import { OrderCopilot } from "./OrderCopilot";
import { ShippingLabelModal } from "@/components/labels/ShippingLabelModal";

type Tab = "queue" | "chat" | "order";

/** Which order represents a conversation: its open draft, else its newest order. */
function preferOrder(current: Order | undefined, incoming: Order): Order {
  if (!current || current.id === incoming.id) return incoming;
  if (current.order_status === "draft" && incoming.order_status !== "draft") return current;
  if (incoming.order_status === "draft") return incoming;
  return incoming.created_at > current.created_at ? incoming : current;
}

function indexOrders(orders: Order[]): Record<string, Order> {
  const map: Record<string, Order> = {};
  for (const o of orders) if (o.conversation_id) map[o.conversation_id] = preferOrder(map[o.conversation_id], o);
  return map;
}

export function Workspace(props: {
  merchant: Merchant;
  initialProducts: Product[];
  initialConversations: Conversation[];
  initialOrders: Order[];
}) {
  const { merchant } = props;
  const [conversations, setConversations] = useState(props.initialConversations);
  const [ordersByConv, setOrdersByConv] = useState(() => indexOrders(props.initialOrders));
  const [products, setProducts] = useState(props.initialProducts);
  const [selectedId, setSelectedId] = useState<string | null>(props.initialConversations[0]?.id ?? null);
  const [tab, setTab] = useState<Tab>("queue");
  const [labelOrders, setLabelOrders] = useState<Order[] | null>(null);
  const [live, setLive] = useState(false);

  const upsertOrder = useCallback((o: Order) => {
    if (!o.conversation_id) return;
    setOrdersByConv((m) => ({ ...m, [o.conversation_id!]: preferOrder(m[o.conversation_id!], o) }));
  }, []);

  const refreshProducts = useCallback(async () => {
    const { data } = await createClient().from("products").select("*").eq("is_active", true).order("name");
    if (data) setProducts(data as Product[]);
  }, []);

  // Realtime: new chats, status changes, AI drafts and courier scans appear without refresh.
  useEffect(() => {
    const supabase = createClient();
    const filter = `merchant_id=eq.${merchant.id}`;
    const channel = supabase
      .channel(`desk-${merchant.id}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "conversations", filter }, (payload) => {
        const row = payload.new as Conversation;
        if (!row?.id) return;
        setConversations((list) =>
          [row, ...list.filter((c) => c.id !== row.id)].sort((a, b) => b.last_message_at.localeCompare(a.last_message_at)),
        );
      })
      .on("postgres_changes", { event: "*", schema: "public", table: "orders", filter }, (payload) => {
        const row = payload.new as Order;
        if (row?.id) upsertOrder(row);
      })
      .subscribe((status) => setLive(status === "SUBSCRIBED"));
    return () => {
      supabase.removeChannel(channel);
    };
  }, [merchant.id, upsertOrder]);

  const selected = useMemo(() => conversations.find((c) => c.id === selectedId) ?? null, [conversations, selectedId]);
  const selectedOrder = selectedId ? ordersByConv[selectedId] ?? null : null;

  function select(id: string) {
    setSelectedId(id);
    setTab("chat");
  }

  const tabs: Array<{ id: Tab; label: string }> = [
    { id: "queue", label: "المحادثات" },
    { id: "chat", label: "الدردشة" },
    { id: "order", label: "الطلب" },
  ];

  return (
    <div className="flex h-full flex-col">
      {/* mobile tab bar */}
      <div role="tablist" className="grid grid-cols-3 border-b border-line bg-panel lg:hidden">
        {tabs.map((t) => (
          <button
            key={t.id}
            role="tab"
            aria-selected={tab === t.id}
            onClick={() => setTab(t.id)}
            className={`py-2.5 text-sm font-medium ${tab === t.id ? "border-b-2 border-ink text-ink" : "text-muted"}`}
          >
            {t.label}
          </button>
        ))}
      </div>

      <div className="grid min-h-0 flex-1 lg:grid-cols-[320px_minmax(0,1fr)_400px]">
        <section className={`${tab === "queue" ? "flex" : "hidden"} min-h-0 flex-col border-line bg-panel lg:flex lg:border-l`}>
          <ConversationQueue
            conversations={conversations}
            ordersByConv={ordersByConv}
            selectedId={selectedId}
            onSelect={select}
            live={live}
          />
        </section>

        <section className={`${tab === "chat" ? "flex" : "hidden"} min-h-0 flex-col lg:flex`}>
          {selected ? (
            <ChatStream
              key={selected.id}
              conversation={selected}
              order={selectedOrder}
            />
          ) : (
            <EmptyState />
          )}
        </section>

        <section className={`${tab === "order" ? "flex" : "hidden"} min-h-0 flex-col overflow-y-auto border-line bg-mist lg:flex lg:border-r`}>
          {selected ? (
            <OrderCopilot
              key={selected.id}
              conversation={selected}
              order={selectedOrder}
              products={products}
              rates={merchant.delivery_rates_json}
              onOrder={upsertOrder}
              onConfirmed={refreshProducts}
              onPrint={(o) => setLabelOrders([o])}
            />
          ) : null}
        </section>
      </div>

      {labelOrders && (
        <ShippingLabelModal orders={labelOrders} merchantName={merchant.business_name} onClose={() => setLabelOrders(null)} />
      )}
    </div>
  );
}

function EmptyState() {
  return (
    <div className="grid h-full place-items-center p-8 text-center text-ink-soft">
      <div>
        <p className="font-display text-xl font-semibold text-ink">ما فيش محادثات بعد</p>
        <p className="mt-2 max-w-xs text-sm">اربط صفحة فيسبوك من الإعدادات، وأول رسالة توصلك تظهر هنا مع طلب جاهز.</p>
      </div>
    </div>
  );
}
