"use client";

import React from "react";
import { ShoppingCart } from "lucide-react";
import { useCart } from "@/context/CartContext";
import { useLanguage } from "@/context/LanguageContext";
import { formatMoney } from "@/lib/money";
import { getEffectiveItemMoney, getItemSaleStage } from "@/lib/premium";
import { Button } from "@/components/ui/button";
import type { StoreItem } from "@/lib/mongodb";

export default function AddToCartButton({ item }: { item: StoreItem }) {
  const { addToCart } = useCart();
  const { t } = useLanguage();
  const effectiveMoney = getEffectiveItemMoney(item);
  const stage = item.saleStage || getItemSaleStage(item);
  const isDisabled =
    !item.inStock ||
    item.quantity <= 0 ||
    stage === "pre-order-soon" ||
    stage === "coming-soon" ||
    stage === "out-of-stock" ||
    stage === "wont-be-stocked";

  return (
    <Button
      size="lg"
      disabled={isDisabled}
      onClick={() => addToCart(item)}
    >
      <ShoppingCart className="w-4 h-4" />
      <span>
        {stage === "wont-be-stocked"
          ? t.card.wontBeStocked
          : stage === "pre-order-soon"
          ? t.card.preOrderSoon
          : stage === "coming-soon"
          ? t.card.comingSoon
          : !item.inStock || item.quantity <= 0 || stage === "out-of-stock"
          ? t.card.outOfStock
          : `${
              item.type === "ticket" ? t.card.reserveTicket : t.card.addToCart
            } — ${formatMoney(effectiveMoney)}`}
      </span>
    </Button>
  );
}
