import React, { Suspense } from "react";
import type { Metadata } from "next";
import { getStoreProducts } from "@/lib/store";
import StorefrontClient from "@/components/StorefrontClient";
import { buildPageMetadata } from "@/lib/seo";

export const dynamic = "force-dynamic";

export const metadata: Metadata = buildPageMetadata("home");

export default async function HomePage() {
  const items = await getStoreProducts();

  return (
    <Suspense
      fallback={
        <div className="max-w-6xl mx-auto px-4 py-12 text-center text-slate-500">
          Loading store...
        </div>
      }
    >
      <StorefrontClient initialItems={items} />
    </Suspense>
  );
}
