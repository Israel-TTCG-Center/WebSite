import type { Metadata } from "next";
import { buildPageMetadata } from "@/lib/seo";

export const metadata: Metadata = buildPageMetadata("account");

export default function AccountLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return children;
}
