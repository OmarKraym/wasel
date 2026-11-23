"use client";

import { LogOut } from "lucide-react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

export function SignOutButton() {
  const router = useRouter();
  return (
    <button
      type="button"
      aria-label="تسجيل الخروج"
      title="تسجيل الخروج"
      onClick={async () => {
        await createClient().auth.signOut();
        router.replace("/login");
      }}
      className="rounded p-1.5 text-white/70 hover:bg-white/10 hover:text-white"
    >
      <LogOut className="size-4" />
    </button>
  );
}
