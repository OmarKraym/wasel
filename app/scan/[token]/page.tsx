import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { CourierScan } from "@/components/scan/CourierScan";

export const metadata: Metadata = {
  title: "تسليم الطلب — وصلة",
  robots: { index: false, follow: false },
  referrer: "no-referrer",
};

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

/** Public courier portal: no app, no login — just the merchant's 4-digit PIN. */
export default async function ScanPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  if (!UUID_RE.test(token)) notFound();
  return <CourierScan token={token} />;
}
