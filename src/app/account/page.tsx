"use client";

import React, { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useForm, useWatch } from "react-hook-form";
import {
  History,
  MapPin,
  CreditCard,
  Save,
  CheckCircle2,
  Globe,
  Sun,
  Moon,
  Gamepad2,
  Crown,
  Sparkles,
  Bell,
  Link2,
  Ticket,
  Trash2,
  Plus,
  Mail,
  XCircle,
  ShieldCheck,
  Download,
  SlidersHorizontal,
} from "lucide-react";
import { openPrivacyChoicesModal } from "@/components/PrivacyConsentBanner";
import { AddressFormFields } from "@/components/AddressFormFields";
import {
  useCart,
  type Address,
  type DeliveryAddress,
  type PaymentMethod,
  type PaymentMethodType,
} from "@/context/CartContext";
import { useLanguage } from "@/context/LanguageContext";
import { useTheme } from "@/context/ThemeContext";
import { formatMoney, type Money } from "@/lib/money";
import {
  canUserAbortOrder,
  formatExpectedDeliveryDate,
  normalizeOrderStatus,
  nowUtcIso,
} from "@/lib/premium";
import {
  formatAddressOneLine,
  normalizeAddress,
  normalizeDeliveryAddress,
  resolveDefaultCountryAlpha3,
} from "@/lib/address";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { FormattedName, NameFields } from "@/components/ui/name-fields";
import { formatFullName, normalizeName, type Name } from "@/lib/name";
import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
} from "@/components/ui/card";

interface OrderRecord {
  _id: string;
  items: {
    slug: string;
    title: string;
    title_he?: string;
    category?: string;
    type?: string;
    money: Money;
    quantity: number;
  }[];
  subtotalMoney?: Money;
  discountPercent?: number;
  deliveryOption?: {
    id: string;
    label: string;
    label_he?: string;
    cost: Money;
    estimatedDays?: number;
    expectedDeliveryAtUtc?: string;
  };
  expectedDeliveryAtUtc?: string;
  totalMoney: Money;
  pointsEarned?: number;
  billingAddress?: Address;
  deliveryAddress?: DeliveryAddress;
  paymentMethod?: {
    nickname?: string;
    type: PaymentMethodType;
    detail: string;
  };
  gamingAccounts?: {
    wizardsAccount?: string;
    riotAccount?: string;
  };
  status: string;
  reservedUntilUtc?: string | null;
  createdAt: string;
}

const PAYMENT_TYPES: PaymentMethodType[] = [
  "credit-card",
  "paypal",
  "apple-pay",
  "google-pay",
  "paybox",
  "bit",
  "bank-transfer",
  "cash",
];

interface NotificationsFormValues {
  contactEmail: string;
  restockAlerts: boolean;
  orderStatusUpdates: boolean;
  newsletterAndArrivals: boolean;
}

type BillingFormValues = Address;

type ShippingAddressFormValues = DeliveryAddress;

interface PaymentFormValues {
  type: PaymentMethodType;
  nickname: string;
  accountHolderName?: Name;
  detail: string;
}

interface GamingFormValues {
  wizardsAccount: string;
  riotAccount: string;
}

export default function AccountPage() {
  const router = useRouter();
  const {
    authHydrated,
    user,
    setUser,
    clearCart,
    loyalty,
    refreshLoyalty,
    contactEmail,
    notifications,
    saveNotificationsAndEmail,
    billingAddress,
    saveBillingAddress,
    savedAddresses,
    saveAddressesList,
    deliveryAddress,
    saveDeliveryAddress,
    savedPaymentMethods,
    savePaymentMethodsList,
    paymentMethod,
    savePaymentMethod,
    activePaymentMethods,
    activeCountries,
    gamingAccounts,
    saveGamingAccounts,
    saveLinkedProviders,
    saveUserPreferences,
  } = useCart();
  const { locale, setLocale, t } = useLanguage();
  const { theme, setTheme } = useTheme();

  const [orders, setOrders] = useState<OrderRecord[]>([]);
  const [billingSaved, setBillingSaved] = useState(false);
  const [addressSaved, setAddressSaved] = useState(false);
  const [paymentSaved, setPaymentSaved] = useState(false);
  const [gamingSaved, setGamingSaved] = useState(false);
  const [notificationsSaved, setNotificationsSaved] = useState(false);
  const [exportingData, setExportingData] = useState(false);
  const [confirmDeleteOpen, setConfirmDeleteOpen] = useState(false);

  const handleExportPersonalData = async () => {
    if (!user?.email) return;
    setExportingData(true);
    try {
      const res = await fetch("/api/privacy");
      if (res.ok) {
        const bundle = await res.json();
        const blob = new Blob([JSON.stringify(bundle, null, 2)], {
          type: "application/json;charset=utf-8",
        });
        const url = URL.createObjectURL(blob);
        const anchor = document.createElement("a");
        anchor.href = url;
        anchor.download = `dockside-keep-data-${user.email.replace(/[^a-z0-9]/gi, "-")}.json`;
        document.body.appendChild(anchor);
        anchor.click();
        anchor.remove();
        URL.revokeObjectURL(url);
      }
    } finally {
      setExportingData(false);
    }
  };

  const handleDeleteAccountAndData = async () => {
    if (!user?.email) return;
    const res = await fetch("/api/privacy", {
      method: "DELETE",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ email: user.email }),
    });
    if (res.ok) {
      clearCart();
      setUser(null);
      router.replace("/");
    }
  };

  const notificationsForm = useForm<NotificationsFormValues>({
    defaultValues: {
      contactEmail: contactEmail || user?.email || "",
      restockAlerts: Boolean(notifications.restockAlerts ?? false),
      orderStatusUpdates: Boolean(notifications.orderStatusUpdates ?? false),
      newsletterAndArrivals: Boolean(
        notifications.newsletterAndArrivals ?? false
      ),
    },
  });

  const defaultCountryAlpha3 = resolveDefaultCountryAlpha3(
    billingAddress,
    deliveryAddress,
    activeCountries[0]?.code || "ISR"
  );

  const billingForm = useForm<BillingFormValues>({
    defaultValues: normalizeAddress(billingAddress, {
      defaultNickname:
        billingAddress.nickname || "Billing (Default Shipping)",
      billingCountry: defaultCountryAlpha3,
    }),
  });

  const shippingForm = useForm<ShippingAddressFormValues>({
    defaultValues: normalizeDeliveryAddress(deliveryAddress, {
      defaultNickname: deliveryAddress.nickname || "Home",
      billingCountry: billingAddress.CountryCodeAlpha3,
      shippingCountry: deliveryAddress.CountryCodeAlpha3,
    }),
  });

  const paymentForm = useForm<PaymentFormValues>({
    defaultValues: {
      type: paymentMethod.type || "credit-card",
      nickname: paymentMethod.nickname || "",
      detail: paymentMethod.detail || "",
    },
  });
  const selectedPaymentType = useWatch({
    control: paymentForm.control,
    name: "type",
  });

  const gamingForm = useForm<GamingFormValues>({
    defaultValues: {
      wizardsAccount: gamingAccounts.wizardsAccount || "",
      riotAccount: gamingAccounts.riotAccount || "",
    },
  });

  useEffect(() => {
    notificationsForm.reset({
      contactEmail: contactEmail || user?.email || "",
      restockAlerts: Boolean(notifications.restockAlerts ?? false),
      orderStatusUpdates: Boolean(notifications.orderStatusUpdates ?? false),
      newsletterAndArrivals: Boolean(
        notifications.newsletterAndArrivals ?? false
      ),
    });
  }, [contactEmail, user?.email, notifications, notificationsForm]);

  useEffect(() => {
    billingForm.reset(
      normalizeAddress(billingAddress, {
        defaultNickname:
          billingAddress.nickname || "Billing (Default Shipping)",
        billingCountry: billingAddress.CountryCodeAlpha3,
      })
    );
  }, [billingAddress, billingForm]);

  useEffect(() => {
    shippingForm.reset(
      normalizeDeliveryAddress(deliveryAddress, {
        defaultNickname: deliveryAddress.nickname || "Home",
        billingCountry: billingAddress.CountryCodeAlpha3,
        shippingCountry: deliveryAddress.CountryCodeAlpha3,
      })
    );
  }, [deliveryAddress, billingAddress.CountryCodeAlpha3, shippingForm]);

  useEffect(() => {
    paymentForm.reset({
      type: paymentMethod.type || "credit-card",
      nickname: paymentMethod.nickname || "",
      detail: paymentMethod.detail || "",
    });
  }, [paymentMethod, paymentForm]);

  useEffect(() => {
    gamingForm.reset({
      wizardsAccount: gamingAccounts.wizardsAccount || "",
      riotAccount: gamingAccounts.riotAccount || "",
    });
  }, [gamingAccounts, gamingForm]);

  // Redirect unauthenticated visitors to /login: /account is not accessible when not signed in
  useEffect(() => {
    if (authHydrated && !user) {
      router.replace("/login");
    }
  }, [authHydrated, user, router]);

  const fetchOrdersAndLoyalty = async () => {
    if (!user?.email) {
      setOrders([]);
      return;
    }
    const res = await fetch(
      `/api/orders?email=${encodeURIComponent(user.email)}`
    );
    if (res.ok) {
      const data = await res.json();
      setOrders(data.orders || []);
    }
    await refreshLoyalty();
  };

  const handleAbortOrder = async (orderId: string) => {
    if (!user?.email) return;
    const res = await fetch("/api/orders", {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        orderId,
        status: "aborted",
        customerEmail: user.email,
      }),
    });
    if (res.ok) {
      await fetchOrdersAndLoyalty();
    }
  };

  useEffect(() => {
    if (user?.email) {
      fetchOrdersAndLoyalty();
    }
  }, [user]);

  const handleSaveBilling = async (values: BillingFormValues) => {
    const recipient = normalizeName(values.recipientName);
    const normalizedBilling = normalizeAddress(
      {
        ...values,
        id: "billing-default",
        nickname:
          (values.nickname || "").trim() || "Billing (Default Shipping)",
        ...(recipient.firstName || recipient.lastName
          ? { recipientName: recipient }
          : {}),
      },
      {
        defaultId: "billing-default",
        defaultNickname:
          (values.nickname || "").trim() || "Billing (Default Shipping)",
        billingCountry: billingAddress.CountryCodeAlpha3,
        shippingCountry: deliveryAddress.CountryCodeAlpha3,
      }
    );
    await saveBillingAddress(normalizedBilling);
    setBillingSaved(true);
    setTimeout(() => setBillingSaved(false), 3000);
  };

  const handleSaveAddress = async (values: ShippingAddressFormValues) => {
    const recipient = normalizeName(values.recipientName);
    const nextAddr: DeliveryAddress = normalizeDeliveryAddress(
      {
        ...values,
        id: `addr-${nowUtcIso()}`,
        nickname: (values.nickname || "").trim(),
        ...(recipient.firstName || recipient.lastName
          ? { recipientName: recipient }
          : {}),
      },
      {
        billingCountry: billingAddress.CountryCodeAlpha3,
        shippingCountry: deliveryAddress.CountryCodeAlpha3,
      }
    );
    await saveDeliveryAddress(nextAddr);
    setAddressSaved(true);
    setTimeout(() => setAddressSaved(false), 3000);
  };

  const handleRemoveSavedAddress = async (idxToRemove: number) => {
    const nextList = savedAddresses.filter((_, idx) => idx !== idxToRemove);
    await saveAddressesList(nextList);
  };

  const handleSavePayment = async (values: PaymentFormValues) => {
    const holder = normalizeName(values.accountHolderName);
    const nextPm: PaymentMethod = {
      id: `pm-${nowUtcIso()}`,
      type: values.type,
      nickname: values.nickname.trim() || values.type,
      ...(holder.firstName || holder.lastName
        ? { accountHolderName: holder }
        : {}),
      detail: values.detail.trim(),
    };
    await savePaymentMethod(nextPm);
    setPaymentSaved(true);
    setTimeout(() => setPaymentSaved(false), 3000);
  };

  const handleRemoveSavedPayment = async (idxToRemove: number) => {
    const nextList = savedPaymentMethods.filter(
      (_, idx) => idx !== idxToRemove
    );
    await savePaymentMethodsList(nextList);
  };

  const handleSaveGaming = async (values: GamingFormValues) => {
    await saveGamingAccounts({
      wizardsAccount: values.wizardsAccount.trim(),
      riotAccount: values.riotAccount.trim(),
    });
    setGamingSaved(true);
    setTimeout(() => setGamingSaved(false), 3000);
  };

  const handleSaveNotifications = async (values: NotificationsFormValues) => {
    const effectiveEmail =
      values.contactEmail.trim() || contactEmail.trim() || user?.email || "";
    await saveNotificationsAndEmail(effectiveEmail, {
      restockAlerts: Boolean(values.restockAlerts),
      orderStatusUpdates: Boolean(values.orderStatusUpdates),
      newsletterAndArrivals: Boolean(values.newsletterAndArrivals),
    });
    setNotificationsSaved(true);
    setTimeout(() => setNotificationsSaved(false), 3000);
  };

  const handleLinkProvider = async (providerName: string) => {
    const current = user?.linkedProviders || [];
    if (current.some((p) => p.provider === providerName)) return;
    const nextProviders = [
      ...current,
      {
        provider: providerName,
        providerEmail:
          user?.email ||
          `${providerName}.player@docksidekeep.org`,
        connectedAtUtc: nowUtcIso(),
      },
    ];
    await saveLinkedProviders(nextProviders);
  };

  const handleDisconnectProvider = async (providerName: string) => {
    const current = user?.linkedProviders || [];
    const nextProviders = current.filter((p) => p.provider !== providerName);
    await saveLinkedProviders(nextProviders);
  };

  const getStatusBadgeVariant = (status: string) => {
    const norm = normalizeOrderStatus(status);
    if (
      norm === "cancelled" ||
      norm === "aborted" ||
      norm === "ordered-not-paid"
    )
      return "amber" as const;
    if (
      norm === "packaged" ||
      norm === "sent-or-waiting" ||
      norm === "completed"
    )
      return "emerald" as const;
    return "default" as const;
  };

  const currentClassName = loyalty?.currentClass
    ? locale === "he" && loyalty.currentClass.name_he
      ? loyalty.currentClass.name_he
      : loyalty.currentClass.name
    : t.loyalty.standardClass;

  const nextClassName = loyalty?.nextClass
    ? locale === "he" && loyalty.nextClass.name_he
      ? loyalty.nextClass.name_he
      : loyalty.nextClass.name
    : null;

  // Derive Participated Events across all active orders (exclude cancelled/aborted/declined)
  const participatedEvents = orders
    .filter((o) => {
      const norm = normalizeOrderStatus(o.status);
      return norm !== "cancelled" && norm !== "aborted";
    })
    .flatMap((order) =>
      order.items
        .filter(
          (it) =>
            it.type === "ticket" ||
            it.category === "Event Tickets" ||
            it.slug.includes("ticket") ||
            it.slug.includes("event")
        )
        .map((it) => ({
          orderId: order._id,
          orderStatus: order.status,
          orderedAt: order.createdAt,
          ...it,
        }))
    );

  if (!authHydrated || !user) {
    return null;
  }

  return (
    <div className="max-w-5xl mx-auto px-4 py-12 space-y-10">
      <div className="space-y-2">
        <h1
          data-testid="account-title"
          className="text-3xl font-extrabold text-slate-900 dark:text-white"
        >
          {t.account.title}
        </h1>
        <p className="text-slate-600 dark:text-slate-400 text-sm">
          {t.account.subtitle}
        </p>
      </div>

      {/* Loyalty & Premium Class Card */}
      <Card
        data-testid="loyalty-status-card"
        className="border-brand-500/30 bg-gradient-to-br from-brand-500/5 via-transparent to-amber-500/5"
      >
        <CardHeader>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <CardTitle className="flex items-center gap-2 text-xl">
              <Crown className="w-5 h-5 text-amber-500" />
              <span>{t.loyalty.title}</span>
            </CardTitle>
            {loyalty?.isAdminAssigned && (
              <Badge variant="amber" data-testid="loyalty-admin-assigned">
                <Sparkles className="w-3.5 h-3.5" />
                <span>{t.loyalty.adminAssignedBadge}</span>
              </Badge>
            )}
          </div>
          <CardDescription>{t.loyalty.subtitle}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="p-4 rounded-2xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200/70 dark:border-slate-800">
              <span className="text-xs text-slate-500 block">
                {t.loyalty.currentClass}
              </span>
              <span
                data-testid="loyalty-current-class"
                className="text-lg font-extrabold text-slate-900 dark:text-white"
              >
                {currentClassName}
              </span>
            </div>

            <div className="p-4 rounded-2xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200/70 dark:border-slate-800">
              <span className="text-xs text-slate-500 block">
                {t.loyalty.monthlyPoints}
              </span>
              <span
                data-testid="loyalty-monthly-points"
                className="text-lg font-extrabold text-brand-600 dark:text-brand-400"
              >
                {loyalty?.monthlyPoints ?? 0} pts
              </span>
            </div>
          </div>

          {!loyalty?.isAdminAssigned &&
            loyalty?.nextClass &&
            loyalty.pointsNeededForNext !== null && (
              <div
                data-testid="loyalty-next-class"
                className="p-3.5 rounded-xl bg-brand-500/10 border border-brand-500/20 text-xs font-semibold text-brand-600 dark:text-brand-400 flex items-center justify-between"
              >
                <span>
                  {t.loyalty.pointsNeededPrefix}{" "}
                  <strong>{loyalty.pointsNeededForNext}</strong>{" "}
                  {t.loyalty.pointsNeededMiddle}{" "}
                  <strong>{nextClassName}</strong> (
                  {loyalty.nextClass.discountPercent}% discount)
                </span>
              </div>
            )}
        </CardContent>
      </Card>

      {/* Participated Events History Section */}
      <Card data-testid="participated-events-card">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-xl">
            <Ticket className="w-5 h-5 text-amber-500" />
            <span>{t.account.participatedEventsTitle}</span>
          </CardTitle>
        </CardHeader>
        <CardContent>
          {participatedEvents.length === 0 ? (
            <p className="text-sm text-slate-500 dark:text-slate-400 py-4">
              {t.account.noParticipatedEvents}
            </p>
          ) : (
            <div
              data-testid="participated-events-list"
              className="grid grid-cols-1 sm:grid-cols-2 gap-3"
            >
              {participatedEvents.map((ev, idx) => (
                <div
                  key={`${ev.orderId}-${ev.slug}-${idx}`}
                  data-testid={`participated-event-${ev.slug}`}
                  className="p-4 rounded-2xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200/70 dark:border-slate-800 flex items-center justify-between gap-3"
                >
                  <div>
                    <span className="font-bold text-sm text-slate-900 dark:text-white block">
                      {locale === "he" && ev.title_he ? ev.title_he : ev.title}
                    </span>
                    <span className="text-xs text-slate-500">
                      Tickets: {ev.quantity} • Order #{ev.orderId.slice(-6)}
                    </span>
                  </div>
                  <Badge variant={getStatusBadgeVariant(ev.orderStatus)}>
                    {ev.orderStatus}
                  </Badge>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Order History Section */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-xl">
            <History className="w-5 h-5 text-brand-500" />
            <span>{t.account.orderHistoryTitle}</span>
          </CardTitle>
        </CardHeader>
        <CardContent>
          {orders.length === 0 ? (
            <p className="text-sm text-slate-500 dark:text-slate-400 py-6">
              {t.account.noOrders}
            </p>
          ) : (
            <div className="space-y-4" data-testid="order-history-list">
              {orders.map((order) => {
                const normStatus = normalizeOrderStatus(order.status);
                const statusLabel =
                  (t.account.status as Record<string, string>)[normStatus] ||
                  (t.account.status as Record<string, string>)[order.status] ||
                  normStatus;
                const canAbort = canUserAbortOrder(normStatus);
                return (
                  <div
                    key={order._id}
                    data-testid={`order-item-${order._id}`}
                    className="p-4 rounded-2xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200/70 dark:border-slate-800 space-y-3"
                  >
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="font-bold text-sm text-slate-900 dark:text-white">
                          {t.account.orderNumber} #{order._id.slice(-6)}
                        </span>
                        <Badge
                          data-testid={`order-status-${order._id}`}
                          variant={getStatusBadgeVariant(normStatus)}
                        >
                          {statusLabel}
                        </Badge>
                        {order.pointsEarned ? (
                          <Badge variant="secondary">
                            +{order.pointsEarned} pts
                          </Badge>
                        ) : null}
                      </div>
                      <div className="flex flex-wrap items-center gap-2">
                        {canAbort && (
                          <Button
                            type="button"
                            size="sm"
                            variant="destructive"
                            data-testid={`user-abort-order-${order._id}`}
                            onClick={() => handleAbortOrder(order._id)}
                          >
                            <XCircle className="w-3.5 h-3.5" />
                            <span>{t.account.abortOrderBtn}</span>
                          </Button>
                        )}
                        {order.discountPercent && order.discountPercent > 0 ? (
                          <Badge variant="emerald">
                            −{order.discountPercent}%
                          </Badge>
                        ) : null}
                        <span className="text-base font-extrabold text-brand-600 dark:text-brand-400">
                          {formatMoney(order.totalMoney)}
                        </span>
                      </div>
                    </div>

                    <div className="space-y-1 text-xs text-slate-600 dark:text-slate-300">
                      {order.items.map((item, idx) => (
                        <div key={idx} className="flex justify-between">
                          <span>
                            {item.quantity}×{" "}
                            {locale === "he" && item.title_he
                              ? item.title_he
                              : item.title}
                          </span>
                          <span>{formatMoney(item.money)}</span>
                        </div>
                      ))}
                      {order.deliveryOption && (
                        <div className="flex flex-wrap justify-between gap-2 text-slate-500 pt-1">
                          <span>
                            🚚 {order.deliveryOption.label}
                            {(order.expectedDeliveryAtUtc ||
                              order.deliveryOption.expectedDeliveryAtUtc) && (
                              <span
                                data-testid={`order-expected-delivery-${order._id}`}
                                className="ms-2 text-[11px] font-semibold text-brand-600 dark:text-brand-400"
                              >
                                • Expected Delivery:{" "}
                                {formatExpectedDeliveryDate(
                                  order.expectedDeliveryAtUtc ||
                                    order.deliveryOption.expectedDeliveryAtUtc ||
                                    ""
                                )}
                              </span>
                            )}
                          </span>
                          <span>{formatMoney(order.deliveryOption.cost)}</span>
                        </div>
                      )}
                    </div>

                    <div className="pt-2 border-t border-slate-200/60 dark:border-slate-700/60 flex flex-wrap items-center justify-between gap-2 text-xs text-slate-500 dark:text-slate-400">
                      {order.deliveryAddress?.StreetName && (
                        <span>
                          📍{" "}
                          {formatAddressOneLine(order.deliveryAddress, {
                            includeNickname: true,
                          })}
                        </span>
                      )}
                      {order.paymentMethod && (
                        <span>
                          💳{" "}
                          {t.payment.types[order.paymentMethod.type] ||
                            order.paymentMethod.type}
                          {order.paymentMethod.detail
                            ? ` (${order.paymentMethod.detail})`
                            : ""}
                        </span>
                      )}
                      {(order.gamingAccounts?.wizardsAccount ||
                        order.gamingAccounts?.riotAccount) && (
                        <span>
                          🎮{" "}
                          {order.gamingAccounts?.wizardsAccount
                            ? `MTG: ${order.gamingAccounts.wizardsAccount} `
                            : ""}
                          {order.gamingAccounts?.riotAccount
                            ? `Riftbound: ${order.gamingAccounts.riotAccount}`
                            : ""}
                        </span>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Notification Preferences & Contact Email Card (Opt-Out Default = False) */}
      <Card data-testid="notifications-card">
        <CardHeader>
          <CardTitle className="flex items-center justify-between text-lg">
            <span className="flex items-center gap-2">
              <Bell className="w-5 h-5 text-brand-500" />
              <span>{t.notifications.title}</span>
            </span>
            {notificationsSaved && (
              <span
                data-testid="notifications-saved-msg"
                className="text-xs font-semibold text-emerald-500 flex items-center gap-1"
              >
                <CheckCircle2 className="w-4 h-4" />
                {t.notifications.savedStatus}
              </span>
            )}
          </CardTitle>
          <CardDescription>{t.notifications.subtitle}</CardDescription>
        </CardHeader>
        <CardContent>
          <form
            onSubmit={notificationsForm.handleSubmit(handleSaveNotifications)}
            className="space-y-4"
          >
            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-slate-700 dark:text-slate-300 block">
                {t.notifications.contactEmailLabel}
              </label>
              <div className="relative">
                <Mail className="w-4 h-4 text-brand-500 absolute start-3.5 top-3 pointer-events-none" />
                <Input
                  type="email"
                  required
                  data-testid="account-contact-email"
                  placeholder="player@example.com"
                  className="ps-10"
                  {...notificationsForm.register("contactEmail", {
                    required: true,
                    validate: (v) => v.trim().length > 0,
                  })}
                />
              </div>
            </div>

            <div className="space-y-2.5">
              <label className="flex items-center gap-2.5 text-xs font-semibold text-slate-700 dark:text-slate-300 cursor-pointer">
                <input
                  type="checkbox"
                  data-testid="notify-restock-alerts"
                  {...notificationsForm.register("restockAlerts")}
                />
                <span>{t.notifications.restockAlerts}</span>
              </label>

              <label className="flex items-center gap-2.5 text-xs font-semibold text-slate-700 dark:text-slate-300 cursor-pointer">
                <input
                  type="checkbox"
                  data-testid="notify-order-status"
                  {...notificationsForm.register("orderStatusUpdates")}
                />
                <span>{t.notifications.orderStatusUpdates}</span>
              </label>

              <label className="flex items-center gap-2.5 text-xs font-semibold text-slate-700 dark:text-slate-300 cursor-pointer">
                <input
                  type="checkbox"
                  data-testid="notify-newsletter-arrivals"
                  {...notificationsForm.register("newsletterAndArrivals")}
                />
                <span>{t.notifications.newsletterAndArrivals}</span>
              </label>
            </div>

            <Button type="submit" data-testid="save-notifications-btn">
              <Save className="w-4 h-4" />
              <span>{t.notifications.saveButton}</span>
            </Button>
          </form>
        </CardContent>
      </Card>

      {/* Third-Party Connections Card */}
      <Card data-testid="third-party-card">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-lg">
            <Link2 className="w-5 h-5 text-brand-500" />
            <span>{t.thirdParty.title}</span>
          </CardTitle>
          <CardDescription>{t.thirdParty.subtitle}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex flex-wrap gap-2">
            {(user?.linkedProviders || []).map((lp) => (
              <div
                key={lp.provider}
                data-testid={`linked-provider-${lp.provider}`}
                className="px-3.5 py-2 rounded-xl bg-emerald-500/10 border border-emerald-500/30 flex items-center gap-2 text-xs font-semibold"
              >
                <span className="uppercase">{lp.provider}</span>
                <span className="text-slate-500">({lp.providerEmail})</span>
                <Badge variant="emerald">{t.thirdParty.connectedBadge}</Badge>
                <button
                  type="button"
                  onClick={() => handleDisconnectProvider(lp.provider)}
                  className="text-rose-500 hover:underline ms-1 cursor-pointer"
                >
                  {t.thirdParty.disconnectBtn}
                </button>
              </div>
            ))}
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <Button
              type="button"
              variant="outline"
              data-testid="connect-google-btn"
              onClick={() => handleLinkProvider("google")}
            >
              <Globe className="w-4 h-4 text-brand-500" />
              <span>{t.thirdParty.connectGoogleBtn}</span>
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* 1 Billing Address (Default Shipping Address) Card */}
      <Card data-testid="billing-address-card">
        <CardHeader>
          <CardTitle className="flex items-center justify-between text-lg">
            <span className="flex items-center gap-2">
              <MapPin className="w-5 h-5 text-amber-500" />
              {t.address.billingTitle}
            </span>
            {billingSaved && (
              <span
                data-testid="billing-address-saved-msg"
                className="text-xs font-semibold text-emerald-500 flex items-center gap-1"
              >
                <CheckCircle2 className="w-4 h-4" />
                {t.address.billingSavedStatus}
              </span>
            )}
          </CardTitle>
          <CardDescription>{t.address.billingSubtitle}</CardDescription>
        </CardHeader>
        <CardContent>
          <form
            onSubmit={billingForm.handleSubmit(handleSaveBilling)}
            className="space-y-3"
          >
            {billingAddress.StreetName && (
              <div
                data-testid="active-billing-address-summary"
                className="p-2.5 rounded-xl bg-amber-500/10 border border-amber-500/20 text-xs font-semibold text-amber-800 dark:text-amber-300"
              >
                {formatAddressOneLine(billingAddress)}
              </div>
            )}
            <AddressFormFields
              form={billingForm}
              activeCountries={activeCountries}
              testIdPrefix="billing-address"
              showDeliveryNotes={false}
              requiredFields={false}
              zipActionsTestId="billing-zip-autocomplete-actions"
              fillZipBtnTestId="billing-fill-address-from-zip-btn"
              findZipBtnTestId="billing-find-zip-from-address-btn"
            />
            <Button type="submit" data-testid="save-billing-address-btn">
              <Save className="w-4 h-4" />
              <span>{t.address.saveBillingButton}</span>
            </Button>
          </form>
        </CardContent>
      </Card>

      {/* Multiple Saved Shipping Addresses (with Nicknames & Phone) & Multiple Payment Methods */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <Card data-testid="shipping-addresses-card">
          <CardHeader>
            <CardTitle className="flex items-center justify-between text-lg">
              <span className="flex items-center gap-2">
                <MapPin className="w-5 h-5 text-brand-500" />
                {t.address.shippingTitle} ({savedAddresses.length})
              </span>
              {addressSaved && (
                <span className="text-xs font-semibold text-emerald-500 flex items-center gap-1">
                  <CheckCircle2 className="w-4 h-4" />
                  {t.address.savedStatus}
                </span>
              )}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {savedAddresses.length > 0 && (
              <div
                data-testid="saved-addresses-list"
                className="space-y-2 max-h-44 overflow-y-auto"
              >
                {savedAddresses.map((addr, idx) => (
                  <div
                    key={addr.id || idx}
                    data-testid={`saved-address-item-${idx}`}
                    className="p-2.5 rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-800 flex items-center justify-between gap-2 text-xs"
                  >
                    <div>
                      <Badge variant="default" className="me-1.5 text-[10px]">
                        {addr.nickname || "Address"}
                      </Badge>
                      <span className="font-semibold">
                        {formatAddressOneLine(addr, { includeNickname: false })}
                      </span>
                      {addr.deliveryNotes && (
                        <span className="block text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">
                          {addr.deliveryNotes}
                        </span>
                      )}
                    </div>
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => handleRemoveSavedAddress(idx)}
                      className="h-7 w-7 text-slate-400 hover:text-rose-500"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </Button>
                  </div>
                ))}
              </div>
            )}

            <form
              onSubmit={shippingForm.handleSubmit(handleSaveAddress)}
              className="space-y-2.5 pt-2 border-t border-slate-200 dark:border-slate-800"
            >
              <AddressFormFields
                form={shippingForm}
                activeCountries={activeCountries}
                testIdPrefix="account-address"
                showDeliveryNotes={true}
                requiredFields={true}
                zipActionsTestId="account-zip-autocomplete-actions"
                fillZipBtnTestId="account-fill-address-from-zip-btn"
                findZipBtnTestId="account-find-zip-from-address-btn"
              />
              <Button
                type="submit"
                data-testid="account-add-address-btn"
                className="w-full"
              >
                <Plus className="w-4 h-4" />
                <span>{t.address.saveButton}</span>
              </Button>
            </form>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center justify-between text-lg">
              <span className="flex items-center gap-2">
                <CreditCard className="w-5 h-5 text-brand-500" />
                {t.payment.title} ({savedPaymentMethods.length})
              </span>
              {paymentSaved && (
                <span className="text-xs font-semibold text-emerald-500 flex items-center gap-1">
                  <CheckCircle2 className="w-4 h-4" />
                  {t.payment.savedStatus}
                </span>
              )}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {savedPaymentMethods.length > 0 && (
              <div
                data-testid="saved-payments-list"
                className="space-y-2 max-h-44 overflow-y-auto"
              >
                {savedPaymentMethods.map((pm, idx) => (
                  <div
                    key={pm.id || idx}
                    data-testid={`saved-payment-item-${idx}`}
                    className="p-2.5 rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-800 flex items-center justify-between gap-2 text-xs"
                  >
                    <div>
                      <Badge variant="default" className="me-1.5 text-[10px]">
                        {pm.nickname || t.payment.types[pm.type]}
                      </Badge>
                      <span className="font-semibold">{pm.detail}</span>
                    </div>
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => handleRemoveSavedPayment(idx)}
                      className="h-7 w-7 text-slate-400 hover:text-rose-500"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </Button>
                  </div>
                ))}
              </div>
            )}

            <form
              onSubmit={paymentForm.handleSubmit(handleSavePayment)}
              className="space-y-2.5 pt-2 border-t border-slate-200 dark:border-slate-800"
            >
              <div className="grid grid-cols-2 gap-1.5">
                {PAYMENT_TYPES.filter((pt) =>
                  activePaymentMethods.some((m) => m.type === pt && m.active)
                ).map((pt) => (
                  <button
                    key={pt}
                    type="button"
                    onClick={() => paymentForm.setValue("type", pt)}
                    className={`px-3 py-2 rounded-xl text-xs font-semibold border transition cursor-pointer ${
                      selectedPaymentType === pt
                        ? "bg-brand-600 text-white border-brand-600"
                        : "bg-slate-50 dark:bg-slate-800 text-slate-700 dark:text-slate-300 border-slate-200 dark:border-slate-700"
                    }`}
                  >
                    {t.payment.types[pt]}
                  </button>
                ))}
              </div>

              <Input
                data-testid="account-payment-nickname"
                placeholder={t.payment.nicknamePlaceholder}
                {...paymentForm.register("nickname")}
              />

              <NameFields
                register={paymentForm.register}
                fieldPrefix="accountHolderName"
                testIdPrefix="account-payment-holder-name"
              />

              <Input
                data-testid="account-payment-detail"
                placeholder={t.payment.detailPlaceholder}
                {...paymentForm.register("detail")}
              />

              <Button
                type="submit"
                data-testid="account-add-payment-btn"
                className="w-full"
              >
                <Plus className="w-4 h-4" />
                <span>{t.payment.saveButton}</span>
              </Button>
            </form>
          </CardContent>
        </Card>
      </div>

      {/* Wizards (MTG) & Riot (Riftbound) Gaming Accounts Card */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center justify-between text-lg">
            <span className="flex items-center gap-2">
              <Gamepad2 className="w-5 h-5 text-brand-500" />
              {t.gaming.title}
            </span>
            {gamingSaved && (
              <span
                data-testid="gaming-accounts-saved-msg"
                className="text-xs font-semibold text-emerald-500 flex items-center gap-1"
              >
                <CheckCircle2 className="w-4 h-4" />
                {t.gaming.savedStatus}
              </span>
            )}
          </CardTitle>
          <CardDescription>{t.gaming.subtitle}</CardDescription>
        </CardHeader>
        <CardContent>
          <form
            onSubmit={gamingForm.handleSubmit(handleSaveGaming)}
            className="space-y-4"
          >
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-slate-700 dark:text-slate-300 block">
                  {t.gaming.wizardsLabel}
                </label>
                <Input
                  data-testid="gaming-wizards-input"
                  placeholder={t.gaming.wizardsPlaceholder}
                  {...gamingForm.register("wizardsAccount")}
                />
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-slate-700 dark:text-slate-300 block">
                  {t.gaming.riotLabel}
                </label>
                <Input
                  data-testid="gaming-riot-input"
                  placeholder={t.gaming.riotPlaceholder}
                  {...gamingForm.register("riotAccount")}
                />
              </div>
            </div>

            <Button type="submit" data-testid="save-gaming-accounts-btn">
              <Save className="w-4 h-4" />
              <span>{t.gaming.saveButton}</span>
            </Button>
          </form>
        </CardContent>
      </Card>

      {/* Saved Language & Theme Preferences */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">
            {t.account.preferencesTitle}
          </CardTitle>
          <CardDescription>
            {t.account.currentLang}: {locale === "he" ? "עברית" : "English"} •{" "}
            {t.account.currentTheme}: {theme === "dark" ? "Dark" : "Light"}
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-wrap gap-3">
          <Button
            variant="outline"
            onClick={async () => {
              const nextLocale = locale === "en" ? "he" : "en";
              setLocale(nextLocale);
              await saveUserPreferences({ locale: nextLocale, theme });
            }}
          >
            <Globe className="w-4 h-4 text-brand-500" />
            <span>{locale === "en" ? "עברית (Hebrew)" : "English"}</span>
          </Button>
          <Button
            variant="outline"
            onClick={async () => {
              const nextTheme = theme === "dark" ? "light" : "dark";
              setTheme(nextTheme);
              await saveUserPreferences({ locale, theme: nextTheme });
            }}
          >
            {theme === "dark" ? (
              <Sun className="w-4 h-4 text-amber-400" />
            ) : (
              <Moon className="w-4 h-4 text-slate-700" />
            )}
            <span>{theme === "dark" ? "Light Mode" : "Dark Mode"}</span>
          </Button>
        </CardContent>
      </Card>

      {/* Privacy, Data Portability & Right to Erasure (GDPR / CCPA / Israeli PPL Amendment 13) */}
      <Card data-testid="account-privacy-card">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-lg">
            <ShieldCheck className="w-5 h-5 text-teal-500" aria-hidden="true" />
            <span>{t.privacy.accountPrivacyTitle}</span>
          </CardTitle>
          <CardDescription>{t.privacy.accountPrivacySubtitle}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex flex-wrap items-center gap-3">
            <Button
              type="button"
              variant="default"
              data-testid="privacy-export-btn"
              disabled={exportingData}
              onClick={handleExportPersonalData}
            >
              <Download className="w-4 h-4" aria-hidden="true" />
              <span>
                {exportingData
                  ? t.privacy.exportingDataBtn
                  : t.privacy.exportDataBtn}
              </span>
            </Button>
            <Button
              type="button"
              variant="outline"
              data-testid="privacy-manage-cookies-btn"
              onClick={openPrivacyChoicesModal}
            >
              <SlidersHorizontal className="w-4 h-4" aria-hidden="true" />
              <span>{t.privacy.manageCookiesBtn}</span>
            </Button>
            {!confirmDeleteOpen && (
              <Button
                type="button"
                variant="destructive"
                data-testid="privacy-delete-account-btn"
                onClick={() => setConfirmDeleteOpen(true)}
              >
                <Trash2 className="w-4 h-4" aria-hidden="true" />
                <span>{t.privacy.deleteAccountBtn}</span>
              </Button>
            )}
          </div>

          {confirmDeleteOpen && (
            <div
              role="alert"
              data-testid="privacy-confirm-delete-box"
              className="p-4 rounded-2xl bg-rose-500/10 border border-rose-500/30 space-y-3 text-xs"
            >
              <p className="font-semibold text-rose-600 dark:text-rose-400">
                {t.privacy.confirmDeletePrompt}
              </p>
              <div className="flex flex-wrap items-center gap-2">
                <Button
                  type="button"
                  variant="destructive"
                  size="sm"
                  data-testid="privacy-confirm-delete-btn"
                  onClick={handleDeleteAccountAndData}
                >
                  {t.privacy.confirmDeleteBtn}
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  data-testid="privacy-cancel-delete-btn"
                  onClick={() => setConfirmDeleteOpen(false)}
                >
                  {t.privacy.cancelDeleteBtn}
                </Button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
