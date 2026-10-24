"use client";

import React, { useEffect } from "react";
import {
  ArrowLeft,
  Dice5,
  Sparkles,
  Ticket,
  CheckCircle2,
  Users,
  Clock,
  Calendar,
} from "lucide-react";
import { Facebook } from "@/components/ui/brand-icons";
import type { StoreItem } from "@/lib/store";
import { useLanguage } from "@/context/LanguageContext";
import {
  getLocalizedBadge,
  getLocalizedCategory,
  getLocalizedDescription,
  getLocalizedTitle,
} from "@/lib/i18n";
import { formatMoney } from "@/lib/money";
import {
  formatBrowserDateTime,
  getEffectiveItemMoney,
  getItemSaleStage,
  isIsoDateString,
} from "@/lib/premium";
import { clampSeoTitle } from "@/lib/seo";
import AddToCartButton from "@/components/AddToCartButton";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { AppLink } from "@/components/ui/app-link";
import { LocalizedTime } from "@/components/ui/localized-time";
import {
  Card,
  CardHeader,
  CardContent,
  CardFooter,
} from "@/components/ui/card";

const HIDDEN_SPEC_KEYS = new Set([
  "_id",
  "slug",
  "type",
  "kind",
  "isHidden",
  "wontBeStocked",
  "lifecycleStage",
  "comingSoonAtUtc",
  "saleStage",
  "availabilityMode",
  "imageUrl",
  "missingFields",
  "createdAt",
  "createdAtUtc",
  "updatedAt",
  "updatedAtUtc",
  "revealAtUtc",
  "preOrderAtUtc",
  "regularSaleAtUtc",
  "eventDate",
  "eventDateUtc",
  "eventEndUtc",
  "hasEnded",
  "quantity",
  "title",
  "title_he",
  "money",
  "preOrderMoney",
  "price",
  "category",
  "description",
  "description_he",
  "badge",
  "badge_he",
  "inStock",
  "showRegisteredCount",
  "registeredCount",
  "facebookUrl",
]);

export default function ItemDetailClient({ item }: { item: StoreItem }) {
  const { locale, t } = useLanguage();

  useEffect(() => {
    document.title = clampSeoTitle(item.title, " | Dockside Keep");
  }, [item.title]);

  const stage = item.saleStage || getItemSaleStage(item);
  const isPreOrderSoon = stage === "pre-order-soon";
  const isPreOrder = stage === "pre-order";
  const isComingSoon = stage === "coming-soon";
  const isWontBeStocked = stage === "wont-be-stocked";
  const localizedBadge = getLocalizedBadge(item, locale);
  const effectiveMoney = getEffectiveItemMoney(item);

  const dynamicAttributes = Object.entries(item).filter(
    ([key, val]) =>
      !HIDDEN_SPEC_KEYS.has(key) &&
      val !== undefined &&
      val !== null &&
      val !== "" &&
      typeof val !== "object"
  );

  const scheduleRows: Array<{ key: string; label: string; value: string }> = [];
  if (item.eventDate) {
    scheduleRows.push({
      key: "eventDate",
      label: t.detail.eventDateLabel,
      value: String(item.eventDate),
    });
  }
  if ((isPreOrder || isComingSoon) && item.preOrderAtUtc) {
    scheduleRows.push({
      key: "preOrderAtUtc",
      label: t.detail.preOrderStarts,
      value: String(item.preOrderAtUtc),
    });
  }
  if (item.regularSaleAtUtc) {
    scheduleRows.push({
      key: "regularSaleAtUtc",
      label: t.detail.releaseDate,
      value: String(item.regularSaleAtUtc),
    });
  }

  return (
    <article
      aria-labelledby="product-title"
      className="max-w-4xl mx-auto px-4 py-12"
    >
      <nav aria-label="Breadcrumb" className="mb-6">
        <Button variant="ghost" size="sm" asChild>
          <AppLink href={item.type === "ticket" ? "/events" : "/"}>
            <ArrowLeft className="w-4 h-4" aria-hidden="true" />
            <span>{t.detail.backToStore}</span>
          </AppLink>
        </Button>
      </nav>

      <Card className="p-2 md:p-4">
        <CardHeader className="space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <Badge variant="default">
              {item.type === "board-game" && (
                <Dice5 className="w-4 h-4" aria-hidden="true" />
              )}
              {item.type === "tcg" && (
                <Sparkles className="w-4 h-4" aria-hidden="true" />
              )}
              {item.type === "ticket" && (
                <Ticket className="w-4 h-4" aria-hidden="true" />
              )}
              {getLocalizedCategory(item.category, locale)}
            </Badge>

            <div className="flex flex-wrap items-center gap-2">
              {isPreOrderSoon && (
                <Badge
                  variant="secondary"
                  data-testid="detail-preordersoon-badge"
                >
                  <Clock className="w-4 h-4" aria-hidden="true" />
                  <span>{t.card.preOrderSoon}</span>
                </Badge>
              )}
              {isPreOrder && (
                <Badge variant="amber" data-testid="detail-preorder-badge">
                  <Clock className="w-4 h-4" aria-hidden="true" />
                  <span>{t.card.preOrder}</span>
                </Badge>
              )}
              {isComingSoon && (
                <Badge variant="secondary" data-testid="detail-comingsoon-badge">
                  <Clock className="w-4 h-4" aria-hidden="true" />
                  <span>{t.card.comingSoon}</span>
                </Badge>
              )}
              {isWontBeStocked && (
                <Badge
                  variant="secondary"
                  data-testid="detail-wontbestocked-badge"
                >
                  <span>{t.card.wontBeStocked}</span>
                </Badge>
              )}
              {!isWontBeStocked && item.wontBeStocked && (
                <Badge
                  variant="amber"
                  data-testid="detail-wontberestocked-badge"
                >
                  <span>{t.card.wontBeRestockedBadge}</span>
                </Badge>
              )}
              {localizedBadge && <Badge variant="amber">{localizedBadge}</Badge>}
              <Badge variant={item.quantity > 0 ? "emerald" : "amber"}>
                <CheckCircle2 className="w-4 h-4" aria-hidden="true" />
                {item.quantity} {t.card.available}
              </Badge>
              {item.showRegisteredCount && (
                <Badge variant="default">
                  <Users className="w-4 h-4" aria-hidden="true" />
                  {t.card.registeredPlayers}: {item.registeredCount ?? 0} /{" "}
                  {item.maxPlayers ?? item.quantity}
                </Badge>
              )}
            </div>
          </div>

          <div className="space-y-2">
            <h1
              id="product-title"
              className="text-3xl md:text-4xl font-extrabold tracking-tight"
            >
              {getLocalizedTitle(item, locale)}
            </h1>
            <aside
              aria-label="Product pricing"
              className="flex items-baseline gap-3"
            >
              <p className="text-2xl font-bold text-brand-600 dark:text-brand-400">
                {formatMoney(effectiveMoney)}
              </p>
              {effectiveMoney.price !== item.money.price && (
                <span className="text-sm line-through text-slate-400">
                  {formatMoney(item.money)}
                </span>
              )}
            </aside>
          </div>
        </CardHeader>

        <CardContent className="space-y-8">
          <section aria-label="Product description">
            <p className="text-base text-slate-600 dark:text-slate-300 leading-relaxed">
              {getLocalizedDescription(item, locale)}
            </p>
          </section>

          {item.facebookUrl && (
            <div>
              <Button variant="outline" asChild>
                <AppLink href={item.facebookUrl}>
                  <Facebook
                    className="w-4 h-4 text-blue-500"
                    aria-hidden="true"
                  />
                  <span>{t.card.facebookEvent}</span>
                </AppLink>
              </Button>
            </div>
          )}

          {(scheduleRows.length > 0 || dynamicAttributes.length > 0) && (
            <section
              aria-labelledby="product-specs-heading"
              data-testid="detail-specs-section"
              className="pt-6 border-t border-slate-200 dark:border-slate-800"
            >
              <h2
                id="product-specs-heading"
                className="text-xs font-bold uppercase tracking-wider text-slate-400 mb-4"
              >
                {t.detail.specsHeading}
              </h2>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {scheduleRows.map((row) => (
                  <div
                    key={row.key}
                    data-testid={`spec-row-${row.key}`}
                    className="p-3.5 rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200/60 dark:border-slate-800 flex items-center justify-between gap-2"
                  >
                    <span className="text-xs font-medium text-slate-500 dark:text-slate-400 flex items-center gap-1.5">
                      <Calendar
                        className="w-3.5 h-3.5 text-brand-500"
                        aria-hidden="true"
                      />
                      {row.label}
                    </span>
                    <LocalizedTime
                      value={row.value}
                      data-testid={`spec-time-${row.key}`}
                      className="text-sm font-semibold text-slate-900 dark:text-white text-end"
                    />
                  </div>
                ))}

                {dynamicAttributes.map(([key, value]) => {
                  const strVal = String(value);
                  const isIso = isIsoDateString(strVal);
                  return (
                    <div
                      key={key}
                      data-testid={`spec-row-${key}`}
                      className="p-3.5 rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200/60 dark:border-slate-800 flex items-center justify-between gap-2"
                    >
                      <span className="text-xs font-medium text-slate-500 dark:text-slate-400 capitalize">
                        {key.replace(/([A-Z])/g, " $1")}
                      </span>
                      {isIso ? (
                        <LocalizedTime
                          value={strVal}
                          className="text-sm font-semibold text-slate-900 dark:text-white text-end"
                        />
                      ) : (
                        <span className="text-sm font-semibold text-slate-900 dark:text-white text-end">
                          {formatBrowserDateTime(strVal)}
                        </span>
                      )}
                    </div>
                  );
                })}
              </div>
            </section>
          )}
        </CardContent>

        <CardFooter className="pt-6 border-t border-slate-200 dark:border-slate-800">
          <AddToCartButton item={item} />
        </CardFooter>
      </Card>
    </article>
  );
}
