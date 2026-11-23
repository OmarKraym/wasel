import { createClient } from "@/lib/supabase/server";
import { Workspace } from "@/components/dashboard/Workspace";
import type { Conversation, Merchant, Order, Product } from "@/lib/types";

export const dynamic = "force-dynamic";

export default async function DashboardPage() {
  const supabase = await createClient();
  const { data: auth } = await supabase.auth.getUser();
  const merchantId = auth.user!.id;

  const [merchant, products, conversations, orders] = await Promise.all([
    supabase
      .from("merchants")
      .select("id, business_name, phone, courier_pin_set, meta_page_id, meta_ig_account_id, delivery_rates_json")
      .eq("id", merchantId)
      .single<Merchant>(),
    supabase.from("products").select("*").eq("is_active", true).order("name").returns<Product[]>(),
    supabase.from("conversations").select("*").order("last_message_at", { ascending: false }).limit(150).returns<Conversation[]>(),
    supabase.from("orders").select("*").order("created_at", { ascending: false }).limit(400).returns<Order[]>(),
  ]);

  return (
    <Workspace
      merchant={merchant.data!}
      initialProducts={products.data ?? []}
      initialConversations={conversations.data ?? []}
      initialOrders={orders.data ?? []}
    />
  );
}
