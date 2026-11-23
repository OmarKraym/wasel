import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { SignOutButton } from "@/components/dashboard/SignOutButton";
import { DashboardNav } from "@/components/dashboard/DashboardNav";

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createClient();
  const { data } = await supabase.auth.getUser();
  if (!data.user) redirect("/login");

  const { data: merchant } = await supabase.from("merchants").select("business_name").eq("id", data.user.id).single();

  return (
    <div className="flex h-dvh flex-col">
      <header className="flex h-12 shrink-0 items-center gap-6 bg-ink px-4 text-white">
        <Link href="/dashboard" className="font-display text-lg font-extrabold">وصلة</Link>
        <DashboardNav />
        <span className="ms-auto hidden truncate text-sm text-white/70 sm:block">{merchant?.business_name || "متجري"}</span>
        <SignOutButton />
      </header>
      <div className="min-h-0 flex-1">{children}</div>
    </div>
  );
}
