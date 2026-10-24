import type { Metadata } from "next";
import { buildPageMetadata } from "@/lib/seo";
import PrivacyPageClient from "@/components/PrivacyPageClient";

export const metadata: Metadata = buildPageMetadata("privacy");

export default function PrivacyPage() {
  return <PrivacyPageClient />;
}
