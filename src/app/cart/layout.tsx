import type { Metadata } from "next";
import { buildPageMetadata } from "@/lib/seo";

export const metadata: Metadata = buildPageMetadata("cart");

export default function CartLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return children;
}
