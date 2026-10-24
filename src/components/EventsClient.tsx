"use client";

import React, { useState } from "react";
import {
  Ticket,
  Calendar,
  MapPin,
  ShoppingCart,
  ArrowRight,
  Users,
  PackageCheck,
} from "lucide-react";
import { Facebook } from "@/components/ui/brand-icons";
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
import { isEventEnded, isEventFull, paginateItems } from "@/lib/premium";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { AppLink } from "@/components/ui/app-link";
import { PageHeader } from "@/components/ui/page-header";
import { LocalizedTime } from "@/components/ui/localized-time";
import { PaginationBar } from "@/components/ui/pagination-bar";
import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
  CardFooter,
} from "@/components/ui/card";

type EventSortOrder = "date-asc" | "price-asc" | "price-desc";

export default function EventsClient({
  tickets,
}: {
  tickets: StoreItem[];
}) {
  const [search, setSearch] = useState("");
  // By default, hide events that have already ended
  const [showEndedEvents, setShowEndedEvents] = useState(false);
  // Option to filter out full-capacity / sold-out events
  const [hideFullEvents, setHideFullEvents] = useState(false);
  const [maxPrice, setMaxPrice] = useState("");
  const [eventDateFilter, setEventDateFilter] = useState("");
  const [sortOrder, setSortOrder] = useState<EventSortOrder>("date-asc");

  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(9);

  const { addToCart, discountPercent } = useCart();
  const { locale, t } = useLanguage();

  const maxPriceNum =
    maxPrice.trim() !== "" && !isNaN(Number(maxPrice))
      ? Number(maxPrice)
      : null;

  const filteredTickets = tickets
    .filter((item) => {
      const ended = isEventEnded(item);
      if (!showEndedEvents && ended) {
        return false;
      }

      const full = isEventFull(item);
      if (hideFullEvents && full) {
        return false;
      }

      if (maxPriceNum !== null && item.money.price > maxPriceNum) {
        return false;
      }

      if (eventDateFilter.trim() !== "") {
        const dateQuery = eventDateFilter.trim().toLowerCase();
        const rawDate = String(item.eventDate || "").toLowerCase();
        if (!rawDate.includes(dateQuery)) {
          return false;
        }
      }

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
      if (sortOrder === "price-asc") return a.money.price - b.money.price;
      if (sortOrder === "price-desc") return b.money.price - a.money.price;

      const dateA = new Date(String(a.eventDate || "")).getTime() || 0;
      const dateB = new Date(String(b.eventDate || "")).getTime() || 0;
      return dateA - dateB;
    });

  const pagination = paginateItems(filteredTickets, currentPage, pageSize);

  return (
    <div className="max-w-6xl mx-auto px-4 py-10 space-y-10">
      {/* Shared Accessible & SEO PageHeader */}
      <PageHeader
        headingId="events-heading"
        title={t.eventsPage.title}
        titleTestId="events-title"
        subtitle={t.eventsPage.subtitle}
        badgeIcon={<Ticket className="w-3.5 h-3.5" aria-hidden="true" />}
        badgeText={t.eventsPage.badge}
        variant="purple"
      />

      {/* Event Tickets Filter Bar & Grid */}
      <section
        aria-label="Upcoming tournaments and live events"
        className="space-y-6"
      >
        <div
          role="search"
          aria-label="Filter and search events"
          className="flex flex-wrap items-center justify-between gap-3"
        >
          <div className="flex flex-wrap items-center gap-2.5">
            <label className="inline-flex items-center gap-2 text-xs font-semibold text-slate-600 dark:text-slate-300 cursor-pointer select-none px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900">
              <input
                type="checkbox"
                data-testid="filter-show-ended-events"
                checked={showEndedEvents}
                onChange={(e) => {
                  setShowEndedEvents(e.target.checked);
                  setCurrentPage(1);
                }}
                className="rounded border-slate-300 text-brand-500 focus:ring-brand-500"
              />
              <span>{t.filters.showEndedEvents}</span>
            </label>

            <label className="inline-flex items-center gap-2 text-xs font-semibold text-slate-600 dark:text-slate-300 cursor-pointer select-none px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900">
              <input
                type="checkbox"
                data-testid="filter-hide-full-events"
                checked={hideFullEvents}
                onChange={(e) => {
                  setHideFullEvents(e.target.checked);
                  setCurrentPage(1);
                }}
                className="rounded border-slate-300 text-brand-500 focus:ring-brand-500"
              />
              <span>{t.filters.hideFullEvents}</span>
            </label>

            <Input
              type="number"
              min="0"
              data-testid="events-filter-max-price"
              aria-label={t.filters.maxPricePlaceholder}
              value={maxPrice}
              onChange={(e) => {
                setMaxPrice(e.target.value);
                setCurrentPage(1);
              }}
              placeholder={t.filters.maxPricePlaceholder}
              className="w-36"
            />

            <Input
              type="text"
              data-testid="events-filter-date"
              aria-label={t.filters.eventDateFilterPlaceholder}
              value={eventDateFilter}
              onChange={(e) => {
                setEventDateFilter(e.target.value);
                setCurrentPage(1);
              }}
              placeholder={t.filters.eventDateFilterPlaceholder}
              className="w-44"
            />

            <select
              data-testid="events-sort-select"
              aria-label="Sort events"
              value={sortOrder}
              onChange={(e) => {
                setSortOrder(e.target.value as EventSortOrder);
                setCurrentPage(1);
              }}
              className="h-10 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 px-3 text-xs font-semibold text-slate-900 dark:text-white"
            >
              <option value="date-asc">{t.filters.sortEventDateAsc}</option>
              <option value="price-asc">{t.filters.sortPriceAsc}</option>
              <option value="price-desc">{t.filters.sortPriceDesc}</option>
            </select>
          </div>

          <Input
            type="search"
            data-testid="events-search-input"
            aria-label={t.filters.searchEventsPlaceholder}
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
              setCurrentPage(1);
            }}
            placeholder={t.filters.searchEventsPlaceholder}
            className="w-full sm:w-64"
          />
        </div>

        {pagination.pageItems.length === 0 ? (
          <div
            role="status"
            aria-live="polite"
            data-testid="events-empty-state"
            className="p-12 rounded-2xl border border-dashed border-slate-300 dark:border-slate-800 text-center text-slate-500 dark:text-slate-400"
          >
            {t.card.emptyEvents}
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {pagination.pageItems.map((item) => {
              const localizedTitle = getLocalizedTitle(item, locale);
              const localizedBadge = getLocalizedBadge(item, locale);
              const ended = isEventEnded(item);
              const full = isEventFull(item);
              const discountedPrice =
                discountPercent > 0
                  ? Number(
                      (item.money.price * (1 - discountPercent / 100)).toFixed(2)
                    )
                  : item.money.price;

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
                            <Ticket className="w-3.5 h-3.5" aria-hidden="true" />
                            {getLocalizedCategory(item.category, locale)}
                          </Badge>
                          <div className="flex flex-wrap items-center gap-1.5">
                            {ended && (
                              <Badge
                                variant="secondary"
                                data-testid={`event-ended-badge-${item.slug}`}
                              >
                                {t.filters.endedBadge}
                              </Badge>
                            )}
                            {full && (
                              <Badge
                                variant="amber"
                                data-testid={`event-full-badge-${item.slug}`}
                              >
                                {t.filters.fullBadge}
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

                      <CardContent className="space-y-3">
                        <div className="flex flex-wrap gap-2">
                          {item.eventDate && (
                            <Badge variant="secondary">
                              <Calendar
                                className="w-3.5 h-3.5 text-emerald-500"
                                aria-hidden="true"
                              />
                              <LocalizedTime
                                value={item.eventDate}
                                data-testid={`event-date-${item.slug}`}
                              />
                            </Badge>
                          )}
                          {item.venue && (
                            <Badge variant="secondary">
                              <MapPin
                                className="w-3.5 h-3.5 text-emerald-500"
                                aria-hidden="true"
                              />
                              {item.venue}
                            </Badge>
                          )}
                          {item.showRegisteredCount && (
                            <Badge
                              variant="default"
                              data-testid={`event-registered-${item.slug}`}
                            >
                              <Users
                                className="w-3.5 h-3.5 text-brand-500"
                                aria-hidden="true"
                              />
                              <span>
                                {t.card.registeredPlayers}:{" "}
                                {item.registeredCount ?? 0} /{" "}
                                {item.maxPlayers ?? item.quantity}
                                {item.minPlayers
                                  ? ` (${t.card.minPlayers}: ${item.minPlayers})`
                                  : ""}
                              </span>
                            </Badge>
                          )}
                        </div>

                        {item.facebookUrl && (
                          <div>
                            <Button
                              variant="outline"
                              size="sm"
                              asChild
                              className="w-full"
                            >
                              <AppLink
                                href={item.facebookUrl}
                                data-testid={`event-facebook-${item.slug}`}
                              >
                                <Facebook
                                  className="w-4 h-4 text-blue-500"
                                  aria-hidden="true"
                                />
                                <span>{t.card.facebookEvent}</span>
                              </AppLink>
                            </Button>
                          </div>
                        )}
                      </CardContent>
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
                              currencyId: item.money.currencyId,
                            })}
                          </span>
                          {discountPercent > 0 && (
                            <span className="text-xs line-through text-slate-400">
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
                            !item.inStock || item.quantity <= 0 || ended || full
                          }
                          data-testid={`add-to-cart-${item.slug}`}
                          aria-label={`${t.card.getTicket}: ${localizedTitle}`}
                          onClick={() => addToCart(item)}
                        >
                          <ShoppingCart
                            className="w-3.5 h-3.5"
                            aria-hidden="true"
                          />
                          <span>
                            {ended
                              ? t.filters.endedBadge
                              : full
                              ? t.filters.fullBadge
                              : !item.inStock || item.quantity <= 0
                              ? t.card.outOfStock
                              : t.card.getTicket}
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
          prefix="events"
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
