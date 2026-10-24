import React from "react";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getItemBySlug } from "@/lib/mongodb";
import ItemDetailClient from "@/components/ItemDetailClient";
import { buildProductJsonLd, buildProductMetadata } from "@/lib/seo";
import { getEffectiveItemMoney } from "@/lib/premium";

export const dynamic = "force-dynamic";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const item = await getItemBySlug(slug);
  if (!item) {
    return buildProductMetadata({
      slug,
      title: "Product Not Found",
      description:
        "Browse available strategy board games, trading card boosters, and event tickets at Dockside Keep in Haifa.",
    });
  }
  return buildProductMetadata({
    slug: item.slug,
    title: item.title,
    description: item.description,
    category: item.category,
    priceNis: getEffectiveItemMoney(item).price,
  });
}

export default async function ItemDetailPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const item = await getItemBySlug(slug);

  if (!item) {
    notFound();
  }

  const effectiveMoney = getEffectiveItemMoney(item);
  const productJsonLd = buildProductJsonLd({
    slug: item.slug,
    title: item.title,
    description: item.description,
    imageUrl: item.imageUrl,
    category: item.category,
    priceNis: effectiveMoney.price,
    currency: effectiveMoney.currencyId,
    quantity: item.quantity,
    availabilityMode: item.availabilityMode,
  });

  return (
    <>
      <script
        type="application/ld+json"
        data-testid="jsonld-product"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(productJsonLd) }}
      />
      <ItemDetailClient item={item} />
    </>
  );
}
