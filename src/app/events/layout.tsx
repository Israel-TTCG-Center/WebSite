import type { Metadata } from "next";
import { buildPageMetadata } from "@/lib/seo";

export const metadata: Metadata = buildPageMetadata("events");

export default function EventsLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return children;
}
