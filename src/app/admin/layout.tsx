import type { Metadata } from "next";
import { buildPageMetadata } from "@/lib/seo";

export const metadata: Metadata = buildPageMetadata("admin");

export default function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return children;
}
