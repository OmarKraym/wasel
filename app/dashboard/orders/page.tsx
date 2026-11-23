import { createClient } from "@/lib/supabase/server";
import { ShippingBoard } from "@/components/orders/ShippingBoard";
import type { Order } from "@/lib/types";

export const dynamic = "force-dynamic";

export default async function OrdersPage() {
  const supabase = await createClient();
  const { data: auth } = await supabase.auth.getUser();
  const [{ data: merchant }, { data: orders }] = await Promise.all([
    supabase.from("merchants").select("business_name").eq("id", auth.user!.id).single(),
    supabase
      .from("orders")
      .select("*")
      .in("order_status", ["confirmed", "shipped", "delivered", "returned"])
      .order("confirmed_at", { ascending: false })
      .limit(300)
      .returns<Order[]>(),
  ]);
  return <ShippingBoard orders={orders ?? []} merchantName={merchant?.business_name ?? ""} />;
}
