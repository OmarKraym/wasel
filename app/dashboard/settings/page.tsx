import { createClient } from "@/lib/supabase/server";
import { SettingsForm } from "@/components/settings/SettingsForm";
import type { Merchant, Product } from "@/lib/types";

export const dynamic = "force-dynamic";

export default async function SettingsPage() {
  const supabase = await createClient();
  const { data: auth } = await supabase.auth.getUser();
  const [{ data: merchant }, { data: products }] = await Promise.all([
    supabase
      .from("merchants")
      .select("id, business_name, phone, courier_pin_set, meta_page_id, meta_ig_account_id, delivery_rates_json")
      .eq("id", auth.user!.id)
      .single<Merchant>(),
    supabase.from("products").select("*").order("created_at", { ascending: false }).returns<Product[]>(),
  ]);
  return <SettingsForm merchant={merchant!} initialProducts={products ?? []} appUrl={process.env.NEXT_PUBLIC_APP_URL ?? ""} />;
}
