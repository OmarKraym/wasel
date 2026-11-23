"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { ImageIcon, Send, Sparkles, X } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { api } from "@/lib/ui/api";
import type { Conversation, Message, Order } from "@/lib/types";

function templates(order: Order | null) {
  const place = [order?.city, order?.address_details].filter(Boolean).join(" - ");
  return [
    {
      label: "تأكيد العنوان",
      text: place
        ? `مرحبا بيك 🌷 نأكدو معاك العنوان: ${place}. صحيح؟`
        : "مرحبا بيك 🌷 عطينا المدينة والعنوان بالتفصيل (الحي وأقرب معلم) باش نوصلولك.",
    },
    {
      label: "تفاصيل الدفع الإلكتروني",
      text: "تقدر تدفع عن طريق موبي كاش أو سداد أو يسر باي أو تداول. بعد التحويل ابعثلنا صورة الإيصال هنا باش نأكدو طلبك.",
    },
    { label: "طلب رقم الهاتف", text: "عطينا رقم هاتفك باش المندوب يتواصل معاك وقت التوصيل 📞" },
    {
      label: "تم التأكيد",
      text: order?.tracking_code
        ? `تم تأكيد طلبك ✅ رقم الطلب ${order.tracking_code}. المندوب بيتواصل معاك قبل التوصيل.`
        : "تم تأكيد طلبك ✅ المندوب بيتواصل معاك قبل التوصيل.",
    },
  ];
}

export function ChatStream({ conversation, order }: { conversation: Conversation; order: Order | null }) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [loading, setLoading] = useState(true);
  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [signed, setSigned] = useState<Record<string, string>>({});
  const [preview, setPreview] = useState<string | null>(null);
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const supabase = createClient();
    let cancelled = false;
    supabase
      .from("messages")
      .select("*")
      .eq("conversation_id", conversation.id)
      .order("created_at", { ascending: true })
      .limit(300)
      .then(({ data }) => {
        if (!cancelled) {
          setMessages((data ?? []) as Message[]);
          setLoading(false);
        }
      });
    const channel = supabase
      .channel(`chat-${conversation.id}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "messages", filter: `conversation_id=eq.${conversation.id}` },
        (payload) => {
          const row = payload.new as Message;
          if (!row?.id) return;
          setMessages((list) => {
            const others = list.filter((m) => m.id !== row.id);
            return [...others, row].sort((a, b) => a.created_at.localeCompare(b.created_at));
          });
        },
      )
      .subscribe();
    return () => {
      cancelled = true;
      supabase.removeChannel(channel);
    };
  }, [conversation.id]);

  // Signed URLs for receipts stored in the private bucket
  useEffect(() => {
    const paths = messages.map((m) => m.attachment_path).filter((p): p is string => !!p && !signed[p]);
    if (!paths.length) return;
    createClient()
      .storage.from("receipts")
      .createSignedUrls(paths, 3600)
      .then(({ data }) => {
        if (!data) return;
        setSigned((s) => {
          const next = { ...s };
          for (const d of data) if (d.path && d.signedUrl) next[d.path] = d.signedUrl;
          return next;
        });
      });
  }, [messages, signed]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ block: "end" });
  }, [messages.length]);

  const suggestion = order?.order_status === "draft" ? order.suggested_reply : null;
  const quick = useMemo(() => templates(order), [order]);

  async function send() {
    const text = draft.trim();
    if (!text) return;
    setSending(true);
    setError(null);
    try {
      await api("/api/messages/send", { conversation_id: conversation.id, text });
      setDraft("");
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setSending(false);
    }
  }

  return (
    <div className="flex h-full min-h-0 flex-col">
      <header className="flex items-center justify-between border-b border-line bg-panel px-4 py-3">
        <div>
          <h2 className="font-display text-lg font-semibold">{conversation.customer_display_name || "زبون"}</h2>
          <p className="text-xs text-muted">{conversation.platform === "instagram" ? "إنستغرام" : "ماسنجر"}</p>
        </div>
      </header>

      <div className="min-h-0 flex-1 space-y-2 overflow-y-auto px-4 py-4" aria-live="polite">
        {loading && <p className="text-center text-sm text-muted">جاري التحميل…</p>}
        {messages.map((m) => {
          const img = m.attachment_path ? signed[m.attachment_path] : m.attachment_url;
          if (m.sender_type === "system") {
            return (
              <p key={m.id} className="mx-auto max-w-md rounded-md bg-warn-bg px-3 py-1.5 text-center text-xs text-warn">
                {m.content}
              </p>
            );
          }
          const mine = m.sender_type === "merchant";
          return (
            <div key={m.id} className={`flex ${mine ? "justify-end" : "justify-start"}`}>
              <div
                className={`max-w-[78%] rounded-lg px-3 py-2 text-[15px] leading-relaxed ${
                  mine ? "rounded-bl-sm bg-ink text-white" : "rounded-br-sm border border-line bg-panel"
                }`}
              >
                {img && (
                  <button onClick={() => setPreview(img)} className="mb-1 block overflow-hidden rounded" aria-label="عرض الصورة">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={img} alt="صورة مرفقة (إيصال؟)" className="max-h-56 w-auto object-cover" />
                  </button>
                )}
                {!img && (m.attachment_path || m.attachment_url) && (
                  <span className="mb-1 flex items-center gap-1 text-xs opacity-70">
                    <ImageIcon className="size-3.5" /> مرفق
                  </span>
                )}
                {m.content && <p className="whitespace-pre-wrap break-words">{m.content}</p>}
                <time className={`mt-1 block text-[11px] ${mine ? "text-white/60" : "text-muted"}`}>
                  {new Date(m.created_at).toLocaleTimeString("ar-LY", { hour: "2-digit", minute: "2-digit" })}
                </time>
              </div>
            </div>
          );
        })}
        <div ref={bottomRef} />
      </div>

      <footer className="border-t border-line bg-panel p-3">
        {suggestion && (
          <button
            onClick={() => setDraft(suggestion)}
            className="mb-2 flex w-full items-start gap-2 rounded-md border border-carbon/30 bg-carbon-soft px-3 py-2 text-start text-sm text-carbon"
          >
            <Sparkles className="mt-0.5 size-4 shrink-0" />
            <span>
              <span className="font-medium">رد مقترح: </span>
              {suggestion}
            </span>
          </button>
        )}
        <div className="mb-2 flex gap-1.5 overflow-x-auto pb-1">
          {quick.map((t) => (
            <button
              key={t.label}
              onClick={() => setDraft(t.text)}
              className="shrink-0 rounded-full border border-line px-3 py-1 text-xs text-ink-soft hover:border-ink hover:text-ink"
            >
              {t.label}
            </button>
          ))}
        </div>
        {error && <p role="alert" className="mb-2 text-sm text-risk">{error}</p>}
        <form
          onSubmit={(e) => {
            e.preventDefault();
            void send();
          }}
          className="flex items-end gap-2"
        >
          <label className="flex-1">
            <span className="sr-only">رسالة</span>
            <textarea
              rows={2}
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  void send();
                }
              }}
              placeholder="اكتب ردك…"
              className="w-full resize-none rounded-md border border-line px-3 py-2 focus:border-carbon focus:outline-none"
            />
          </label>
          <button
            disabled={sending || !draft.trim()}
            className="flex h-10 items-center gap-1.5 rounded-md bg-ink px-4 text-sm font-medium text-white disabled:opacity-40"
          >
            <Send className="size-4 -scale-x-100" /> إرسال
          </button>
        </form>
      </footer>

      {preview && (
        <div role="dialog" aria-modal="true" aria-label="معاينة الإيصال" className="fixed inset-0 z-50 grid place-items-center bg-ink/80 p-6" onClick={() => setPreview(null)}>
          <button className="absolute end-4 top-4 rounded-full bg-white/10 p-2 text-white" aria-label="إغلاق">
            <X className="size-5" />
          </button>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={preview} alt="الإيصال" className="max-h-full max-w-full rounded" />
        </div>
      )}
    </div>
  );
}
