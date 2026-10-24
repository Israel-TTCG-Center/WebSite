"use client";

import React, { useState } from "react";
import {
  Dice5,
  Sparkles,
  Ticket,
  ShoppingCart,
  ArrowRight,
  PackageCheck,
  Clock,
  Filter,
} from "lucide-react";
import type { StoreItem } from "@/lib/store";
import { useCart } from "@/context/CartContext";
import { useLanguage } from "@/context/LanguageContext";
import {
  getLocalizedBadge,
  getLocalizedCategory,
  getLocalizedDescription,
  getLocalizedTitle,
} from "@/lib/i18n";
import { formatMoney } from "@/lib/money";
import {
  type AddedDateWindow,
  getEffectiveItemMoney,
  getItemSaleStage,
  isStoreItemInStock,
  isWithinAddedWindow,
  paginateItems,
} from "@/lib/premium";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { AppLink } from "@/components/ui/app-link";
import { PageHeader } from "@/components/ui/page-header";
import { PaginationBar } from "@/components/ui/pagination-bar";
import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
  CardFooter,
} from "@/components/ui/card";

type StoreCategoryFilter = "all" | "board-game" | "tcg" | "pre-order";
type StoreSortOrder = "newest" | "oldest" | "price-asc" | "price-desc";

export default function StorefrontClient({
  initialItems,
}: {
  initialItems: StoreItem[];
}) {
  const [search, setSearch] = useState("");
  const [categoryFilter, setCategoryFilter] =
    useState<StoreCategoryFilter>("all");
  // By default, hide anything that is out of stock from the store
  const [showOutOfStock, setShowOutOfStock] = useState(false);
  const [maxPrice, setMaxPrice] = useState("");
  const [addedWindow, setAddedWindow] = useState<AddedDateWindow>("all");
  const [sortOrder, setSortOrder] = useState<StoreSortOrder>("newest");

  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(9);

  const { addToCart, discountPercent } = useCart();
  const { locale, t } = useLanguage();

  // Unified Store Items (do not separate items from board games; only exclude events and hidden items)
  const storeItems = initialItems.filter(
    (item) =>
      item.kind !== "event" &&
      item.type !== "ticket" &&
      item.category !== "Event Tickets" &&
      getItemSaleStage(item) !== "hidden"
  );

  const maxPriceNum =
    maxPrice.trim() !== "" && !isNaN(Number(maxPrice))
      ? Number(maxPrice)
      : null;

  const filtered = storeItems
    .filter((item) => {
      const stage = item.saleStage || getItemSaleStage(item);
      const inStock = isStoreItemInStock(item);
      const effectiveMoney = getEffectiveItemMoney(item);

      // 1. Default out-of-stock filter (unless showOutOfStock is checked)
      if (
        !showOutOfStock &&
        !inStock &&
        stage !== "coming-soon" &&
        stage !== "pre-order-soon"
      ) {
        return false;
      }

      // 2. Category / Pre-order pill filter
      if (categoryFilter === "board-game" && item.type !== "board-game") {
        return false;
      }
      if (categoryFilter === "tcg" && item.type !== "tcg") {
        return false;
      }
      if (
        categoryFilter === "pre-order" &&
        stage !== "pre-order" &&
        stage !== "pre-order-soon"
      ) {
        return false;
      }

      // 3. Max Price filter
      if (maxPriceNum !== null && effectiveMoney.price > maxPriceNum) {
        return false;
      }

      // 4. Date Added window filter
      if (!isWithinAddedWindow(item as any, addedWindow)) {
        return false;
      }

      // 5. Search query filter
      const title = getLocalizedTitle(item, locale).toLowerCase();
      const desc = getLocalizedDescription(item, locale).toLowerCase();
      const q = search.toLowerCase();
      return (
        !search.trim() ||
        title.includes(q) ||
        desc.includes(q) ||
        item.title.toLowerCase().includes(q)
      );
    })
    .sort((a, b) => {
      const priceA = getEffectiveItemMoney(a).price;
      const priceB = getEffectiveItemMoney(b).price;
      if (sortOrder === "price-asc") return priceA - priceB;
      if (sortOrder === "price-desc") return priceB - priceA;

      const timeA = new Date(
        String((a as any).createdAtUtc || (a as any).createdAt || 0)
      ).getTime() || 0;
      const timeB = new Date(
        String((b as any).createdAtUtc || (b as any).createdAt || 0)
      ).getTime() || 0;
      return sortOrder === "oldest" ? timeA - timeB : timeB - timeA;
    });

  const pagination = paginateItems(filtered, currentPage, pageSize);

  return (
    <div className="max-w-6xl mx-auto px-4 py-10 space-y-10">
      {/* Shared Accessible & SEO PageHeader */}
      <PageHeader
        headingId="hero-heading"
        title={t.hero.title}
        titleTestId="hero-title"
        subtitle={t.hero.subtitle}
        subtitleTestId="hero-subtitle"
        badgeIcon={<Sparkles className="w-3.5 h-3.5" aria-hidden="true" />}
        badgeText={t.hero.badge}
        variant="indigo"
        actions={
          <Button size="lg" asChild>
            <AppLink href="/events">
              <Ticket className="w-4 h-4" aria-hidden="true" />
              <span>{t.hero.ctaTickets}</span>
            </AppLink>
          </Button>
        }
      />

      {/* Catalog Section with Search, Price/Date Filters & Pagination */}
      <section aria-labelledby="catalog-heading" className="space-y-6">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <h2
            id="catalog-heading"
            className="text-xl font-bold text-slate-900 dark:text-white flex items-center gap-2"
          >
            <Dice5 className="w-5 h-5 text-brand-500" aria-hidden="true" />
            <span>{t.nav.store}</span>
          </h2>

          <div
            role="search"
            aria-label="Search and filter store catalog"
            className="flex flex-wrap items-center gap-2.5"
          >
            <label className="inline-flex items-center gap-2 text-xs font-semibold text-slate-600 dark:text-slate-300 cursor-pointer select-none px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900">
              <input
                type="checkbox"
                data-testid="filter-show-out-of-stock"
                checked={showOutOfStock}
                onChange={(e) => {
                  setShowOutOfStock(e.target.checked);
                  setCurrentPage(1);
                }}
                className="rounded border-slate-300 text-brand-500 focus:ring-brand-500"
              />
              <span>{t.filters.showOutOfStock}</span>
            </label>

            <Input
              type="number"
              min="0"
              data-testid="store-filter-max-price"
              aria-label={t.filters.maxPricePlaceholder}
              value={maxPrice}
              onChange={(e) => {
                setMaxPrice(e.target.value);
                setCurrentPage(1);
              }}
              placeholder={t.filters.maxPricePlaceholder}
              className="w-36"
            />

            <select
              data-testid="store-filter-added-window"
              aria-label="Filter by when item was added"
              value={addedWindow}
              onChange={(e) => {
                setAddedWindow(e.target.value as AddedDateWindow);
                setCurrentPage(1);
              }}
              className="h-10 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 px-3 text-xs font-semibold text-slate-900 dark:text-white"
            >
              <option value="all">{t.filters.addedAnyTime}</option>
              <option value="7d">{t.filters.added7d}</option>
              <option value="30d">{t.filters.added30d}</option>
              <option value="90d">{t.filters.added90d}</option>
            </select>

            <select
              data-testid="store-sort-select"
              aria-label="Sort store items"
              value={sortOrder}
              onChange={(e) => {
                setSortOrder(e.target.value as StoreSortOrder);
                setCurrentPage(1);
              }}
              className="h-10 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 px-3 text-xs font-semibold text-slate-900 dark:text-white"
            >
              <option value="newest">{t.filters.sortNewest}</option>
              <option value="oldest">{t.filters.sortOldest}</option>
              <option value="price-asc">{t.filters.sortPriceAsc}</option>
              <option value="price-desc">{t.filters.sortPriceDesc}</option>
            </select>

            <Input
              type="search"
              data-testid="store-search-input"
              aria-label={t.searchPlaceholder}
              value={search}
              onChange={(e) => {
                setSearch(e.target.value);
                setCurrentPage(1);
              }}
              placeholder={t.searchPlaceholder}
              className="w-full sm:w-56"
            />
          </div>
        </div>

        {/* Category & Pre-Order Filter Pills */}
        <div
          role="group"
          aria-label="Filter store items by category"
          data-testid="store-category-filters"
          className="flex flex-wrap items-center gap-2"
        >
          <Filter
            className="w-4 h-4 text-slate-400 me-1"
            aria-hidden="true"
          />
          <Button
            type="button"
            size="sm"
            variant={categoryFilter === "all" ? "default" : "outline"}
            data-testid="store-filter-all"
            onClick={() => {
              setCategoryFilter("all");
              setCurrentPage(1);
            }}
          >
            {t.filters.all}
          </Button>
          <Button
            type="button"
            size="sm"
            variant={categoryFilter === "board-game" ? "default" : "outline"}
            data-testid="store-filter-board-game"
            onClick={() => {
              setCategoryFilter("board-game");
              setCurrentPage(1);
            }}
          >
            {t.filters.boardGames}
          </Button>
          <Button
            type="button"
            size="sm"
            variant={categoryFilter === "tcg" ? "default" : "outline"}
            data-testid="store-filter-tcg"
            onClick={() => {
              setCategoryFilter("tcg");
              setCurrentPage(1);
            }}
          >
            {t.filters.tcg}
          </Button>
          <Button
            type="button"
            size="sm"
            variant={categoryFilter === "pre-order" ? "default" : "outline"}
            data-testid="store-filter-pre-order"
            onClick={() => {
              setCategoryFilter("pre-order");
              setCurrentPage(1);
            }}
          >
            {t.filters.preOrder}
          </Button>
        </div>

        {/* Store Product Grid */}
        {pagination.pageItems.length === 0 ? (
          <div
            role="status"
            aria-live="polite"
            data-testid="store-empty-state"
            className="p-12 rounded-2xl border border-dashed border-slate-300 dark:border-slate-800 text-center text-slate-500 dark:text-slate-400"
          >
            {t.card.emptyStore}
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {pagination.pageItems.map((item) => {
              const localizedTitle = getLocalizedTitle(item, locale);
              const localizedBadge = getLocalizedBadge(item, locale);
              const stage = item.saleStage || getItemSaleStage(item);
              const isPreOrderSoon = stage === "pre-order-soon";
              const isPreOrder = stage === "pre-order";
              const isComingSoon = stage === "coming-soon";
              const isWontBeStocked = stage === "wont-be-stocked";
              const isOutOfStock = stage === "out-of-stock" || isWontBeStocked;
              const activeMoney = getEffectiveItemMoney(item);
              const hasDistinctPreOrderPrice =
                isPreOrder &&
                item.preOrderMoney &&
                item.preOrderMoney.price > 0 &&
                item.preOrderMoney.price !== item.money.price;
              const discountedPrice =
                discountPercent > 0
                  ? Number(
                      (activeMoney.price * (1 - discountPercent / 100)).toFixed(2)
                    )
                  : activeMoney.price;

              return (
                <article
                  key={item.slug}
                  aria-label={localizedTitle}
                  className="flex flex-col"
                >
                  <Card
                    data-testid={`card-${item.slug}`}
                    className="group hover:border-brand-500/60 transition hover:shadow-lg flex-1 flex flex-col justify-between overflow-hidden"
                  >
                    <div>
                      {item.imageUrl && (
                        <div className="w-full h-44 bg-slate-100 dark:bg-slate-900 overflow-hidden border-b border-slate-200/60 dark:border-slate-800">
                          <img
                            src={item.imageUrl}
                            alt={localizedTitle}
                            loading="lazy"
                            decoding="async"
                            data-testid={`img-${item.slug}`}
                            className="w-full h-full object-cover group-hover:scale-105 transition duration-300"
                          />
                        </div>
                      )}

                      <CardHeader className="pb-3">
                        <div className="flex items-center justify-between gap-2 mb-2">
                          <Badge variant="default">
                            <Dice5 className="w-3.5 h-3.5" aria-hidden="true" />
                            {getLocalizedCategory("Store Items", locale)}
                          </Badge>
                          <div className="flex flex-wrap items-center gap-1.5">
                            {isPreOrderSoon && (
                              <Badge
                                variant="secondary"
                                data-testid={`preordersoon-badge-${item.slug}`}
                              >
                                <Clock className="w-3 h-3" aria-hidden="true" />
                                <span>{t.card.preOrderSoon}</span>
                              </Badge>
                            )}
                            {isPreOrder && (
                              <Badge
                                variant="amber"
                                data-testid={`preorder-badge-${item.slug}`}
                              >
                                <Clock className="w-3 h-3" aria-hidden="true" />
                                <span>{t.card.preOrder}</span>
                              </Badge>
                            )}
                            {isComingSoon && (
                              <Badge
                                variant="secondary"
                                data-testid={`comingsoon-badge-${item.slug}`}
                              >
                                <Clock className="w-3 h-3" aria-hidden="true" />
                                <span>{t.card.comingSoon}</span>
                              </Badge>
                            )}
                            {isWontBeStocked && (
                              <Badge
                                variant="secondary"
                                data-testid={`wontbestocked-badge-${item.slug}`}
                              >
                                <span>{t.card.wontBeStocked}</span>
                              </Badge>
                            )}
                            {!isWontBeStocked && item.wontBeStocked && (
                              <Badge
                                variant="amber"
                                data-testid={`wontberestocked-badge-${item.slug}`}
                              >
                                <span>{t.card.wontBeRestockedBadge}</span>
                              </Badge>
                            )}
                            {localizedBadge && (
                              <Badge variant="amber">{localizedBadge}</Badge>
                            )}
                            <Badge
                              variant={item.quantity > 0 ? "emerald" : "amber"}
                              data-testid={`stock-${item.slug}`}
                            >
                              <PackageCheck
                                className="w-3 h-3"
                                aria-hidden="true"
                              />
                              <span>
                                {item.quantity} {t.card.available}
                              </span>
                            </Badge>
                          </div>
                        </div>

                        <AppLink href={`/items/${item.slug}`}>
                          <CardTitle className="text-lg group-hover:text-brand-600 dark:group-hover:text-brand-400 transition">
                            {localizedTitle}
                          </CardTitle>
                        </AppLink>

                        <CardDescription className="line-clamp-3 pt-1">
                          {getLocalizedDescription(item, locale)}
                        </CardDescription>
                      </CardHeader>

                      <CardContent />
                    </div>

                    <CardFooter className="pt-4 border-t border-slate-100 dark:border-slate-800 justify-between gap-3">
                      <div>
                        <span className="text-xs text-slate-400 block">
                          {t.card.price}
                        </span>
                        <div className="flex items-baseline gap-2">
                          <span
                            data-testid={`price-${item.slug}`}
                            className="text-xl font-extrabold text-slate-900 dark:text-white"
                          >
                            {formatMoney({
                              price: discountedPrice,
                              currencyId: activeMoney.currencyId,
                            })}
                          </span>
                          {(discountPercent > 0 || hasDistinctPreOrderPrice) && (
                            <span
                              data-testid={`regular-price-${item.slug}`}
                              className="text-xs line-through text-slate-400"
                            >
                              {formatMoney(item.money)}
                            </span>
                          )}
                        </div>
                      </div>

                      <div className="flex items-center gap-2">
                        <Button variant="outline" size="icon" asChild>
                          <AppLink
                            href={`/items/${item.slug}`}
                            aria-label={`${t.card.viewDetails}: ${localizedTitle}`}
                            title={t.card.viewDetails}
                          >
                            <ArrowRight
                              className="w-4 h-4"
                              aria-hidden="true"
                            />
                          </AppLink>
                        </Button>
                        <Button
                          size="sm"
                          disabled={
                            !item.inStock ||
                            item.quantity <= 0 ||
                            isPreOrderSoon ||
                            isComingSoon ||
                            isOutOfStock
                          }
                          data-testid={`add-to-cart-${item.slug}`}
                          aria-label={`${t.card.addToCart}: ${localizedTitle}`}
                          onClick={() => addToCart(item)}
                        >
                          <ShoppingCart
                            className="w-3.5 h-3.5"
                            aria-hidden="true"
                          />
                          <span>
                            {isWontBeStocked
                              ? t.card.wontBeStocked
                              : !item.inStock ||
                                item.quantity <= 0 ||
                                isOutOfStock
                              ? t.card.outOfStock
                              : isPreOrderSoon
                              ? t.card.preOrderSoon
                              : isComingSoon
                              ? t.card.comingSoon
                              : isPreOrder
                              ? t.card.preOrder
                              : t.card.addToCart}
                          </span>
                        </Button>
                      </div>
                    </CardFooter>
                  </Card>
                </article>
              );
            })}
          </div>
        )}

        {/* Accessible Pagination Bar */}
        <PaginationBar
          prefix="store"
          currentPage={pagination.currentPage}
          totalPages={pagination.totalPages}
          totalItems={pagination.totalItems}
          startIndex={pagination.startIndex}
          endIndex={pagination.endIndex}
          pageSize={pageSize}
          onPageChange={(p) => setCurrentPage(p)}
          onPageSizeChange={(size) => {
            setPageSize(size);
            setCurrentPage(1);
          }}
          labels={{
            showing: t.filters.showing,
            of: t.filters.of,
            perPage: t.filters.perPage,
            previous: t.filters.prevPage,
            next: t.filters.nextPage,
          }}
        />
      </section>
    </div>
  );
}
