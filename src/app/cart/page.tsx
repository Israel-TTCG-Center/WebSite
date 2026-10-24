"use client";

import React, { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useForm, useWatch } from "react-hook-form";
import {
  ShoppingCart,
  Trash2,
  MapPin,
  CreditCard,
  Truck,
  Mail,
  CheckCircle2,
  AlertTriangle,
  Clock,
  Save,
  ArrowLeft,
} from "lucide-react";
import {
  useCart,
  type Address,
  type DeliveryAddress,
  type PaymentMethod,
  type PaymentMethodType,
} from "@/context/CartContext";
import { useLanguage } from "@/context/LanguageContext";
import { getLocalizedCategory } from "@/lib/i18n";
import { formatMoney, type Money } from "@/lib/money";
import { formatExpectedDeliveryDate } from "@/lib/premium";
import {
  formatAddressOneLine,
  normalizeAddress,
  normalizeDeliveryAddress,
  resolveDefaultCountryAlpha3,
} from "@/lib/address";
import { AddressFormFields } from "@/components/AddressFormFields";
import { NameFields } from "@/components/ui/name-fields";
import { normalizeName, formatFullName } from "@/lib/name";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
  CardFooter,
} from "@/components/ui/card";

type SelectionMode = "existing" | "new-save" | "temp";

export default function CartPage() {
  const router = useRouter();
  const { locale, t } = useLanguage();
  const {
    items,
    removeFromCart,
    clearCart,
    subtotalMoney,
    discountPercent,
    discountedSubtotalMoney,
    deliveryOptions,
    selectedDeliveryOption,
    setSelectedDeliveryOption,
    refreshDeliveryOptions,
    activePaymentMethods,
    activeCountries,
    calculateFeeForPaymentType,
    totalMoney,
    totalCount,
    loyalty,
    refreshLoyalty,
    user,
    contactEmail,
    setContactEmail,
    billingAddress,
    setBillingAddress,
    saveBillingAddress,
    savedAddresses,
    deliveryAddress,
    setDeliveryAddress,
    saveDeliveryAddress,
    savedPaymentMethods,
    paymentMethod,
    setPaymentMethod,
    savePaymentMethod,
  } = useCart();

  // Combine Billing Address (which is the default shipping address) + Saved Shipping Addresses
  const allSelectableAddresses: DeliveryAddress[] = [
    ...(billingAddress.StreetName
      ? [
          normalizeDeliveryAddress(billingAddress, {
            defaultId: "billing-default",
            defaultNickname:
              billingAddress.nickname || "Billing (Default Shipping)",
          }),
        ]
      : []),
    ...savedAddresses,
  ];

  const defaultCountryAlpha3 = resolveDefaultCountryAlpha3(
    billingAddress,
    deliveryAddress,
    activeCountries[0]?.code || "ISR"
  );

  const [addressMode, setAddressMode] = useState<SelectionMode>("new-save");
  const [selectedAddressId, setSelectedAddressId] = useState<string>(
    "billing-default"
  );
  const cartAddressForm = useForm<DeliveryAddress>({
    defaultValues: normalizeDeliveryAddress(
      {
        nickname: "Home",
        recipientName: { firstName: "", middleName: "", lastName: "" },
        CountryCodeAlpha3: defaultCountryAlpha3,
        StreetName: "",
        BuildingNumber: "",
        Apartment: "",
        TownName: "",
        CountrySubDivision: "",
        PostalCode: "",
        phone: { CountryCodeAlpha3: defaultCountryAlpha3, PhoneNumber: "" as any },
        deliveryNotes: "",
      },
      { billingCountry: defaultCountryAlpha3 }
    ),
  });
  const watchedAddress = useWatch({ control: cartAddressForm.control });
  const draftAddress: DeliveryAddress = normalizeDeliveryAddress(watchedAddress, {
    defaultNickname: "Home",
    billingCountry: billingAddress.CountryCodeAlpha3,
    shippingCountry: deliveryAddress.CountryCodeAlpha3,
  });

  const [sameAsShipping, setSameAsShipping] = useState<boolean>(true);
  const [billingMode, setBillingMode] = useState<SelectionMode>("new-save");
  const [selectedBillingAddressId, setSelectedBillingAddressId] =
    useState<string>("billing-default");
  const cartBillingForm = useForm<Address>({
    defaultValues: normalizeAddress(
      {
        nickname: "Billing",
        recipientName: { firstName: "", middleName: "", lastName: "" },
        CountryCodeAlpha3: defaultCountryAlpha3,
        StreetName: "",
        BuildingNumber: "",
        Apartment: "",
        TownName: "",
        CountrySubDivision: "",
        PostalCode: "",
        phone: { CountryCodeAlpha3: defaultCountryAlpha3, PhoneNumber: "" as any },
      },
      { billingCountry: defaultCountryAlpha3 }
    ),
  });
  const watchedBilling = useWatch({ control: cartBillingForm.control });
  const draftBillingAddress: Address = normalizeAddress(watchedBilling, {
    defaultNickname: "Billing",
    billingCountry: billingAddress.CountryCodeAlpha3,
    shippingCountry: deliveryAddress.CountryCodeAlpha3,
  });

  const [paymentMode, setPaymentMode] = useState<SelectionMode>("new-save");
  const [selectedPaymentId, setSelectedPaymentId] = useState<string>("");
  const cartPaymentForm = useForm<PaymentMethod>({
    defaultValues: {
      nickname: "Primary",
      type: "credit-card",
      accountHolderName: { firstName: "", middleName: "", lastName: "" },
      detail: "",
    },
  });
  const watchedPayment = useWatch({ control: cartPaymentForm.control });
  const draftPayment: PaymentMethod = {
    nickname: watchedPayment.nickname || "Primary",
    type: watchedPayment.type || "credit-card",
    accountHolderName: watchedPayment.accountHolderName
      ? normalizeName(watchedPayment.accountHolderName)
      : undefined,
    detail: watchedPayment.detail || "",
  };

  const cartCheckoutForm = useForm<{ contactEmail: string }>({
    defaultValues: {
      contactEmail: contactEmail || user?.email || "",
    },
  });

  const [addressSavedStatus, setAddressSavedStatus] = useState(false);
  const [billingSavedStatus, setBillingSavedStatus] = useState(false);
  const [paymentSavedStatus, setPaymentSavedStatus] = useState(false);
  const [checkoutStatus, setCheckoutStatus] = useState<string | null>(null);
  const [checkoutError, setCheckoutError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    refreshDeliveryOptions();
  }, []);

  useEffect(() => {
    cartCheckoutForm.reset({
      contactEmail: contactEmail || user?.email || "",
    });
  }, [contactEmail, user?.email, cartCheckoutForm]);

  useEffect(() => {
    if (allSelectableAddresses.length > 0 && !selectedAddressId) {
      const firstId = allSelectableAddresses[0].id || "billing-default";
      setSelectedAddressId(firstId);
    }
    if (allSelectableAddresses.length > 0 && !selectedBillingAddressId) {
      const firstId = allSelectableAddresses[0].id || "billing-default";
      setSelectedBillingAddressId(firstId);
    }
    if (
      deliveryAddress.StreetName &&
      !cartAddressForm.getValues("StreetName")
    ) {
      cartAddressForm.reset(
        normalizeDeliveryAddress(deliveryAddress, {
          defaultNickname: deliveryAddress.nickname || "Home",
          billingCountry: billingAddress.CountryCodeAlpha3,
        })
      );
    }
    if (billingAddress.StreetName && !cartBillingForm.getValues("StreetName")) {
      cartBillingForm.reset(
        normalizeAddress(billingAddress, {
          defaultNickname: billingAddress.nickname || "Billing",
        })
      );
    }
  }, [billingAddress, savedAddresses, deliveryAddress]);

  useEffect(() => {
    if (savedPaymentMethods.length > 0 && !selectedPaymentId) {
      const firstId = savedPaymentMethods[0].id || "pm-0";
      setSelectedPaymentId(firstId);
    }
    if (paymentMethod.detail && !cartPaymentForm.getValues("detail")) {
      cartPaymentForm.reset({
        nickname: paymentMethod.nickname || "Primary",
        type: paymentMethod.type,
        detail: paymentMethod.detail,
      });
    }
  }, [savedPaymentMethods, paymentMethod]);

  const getEffectiveAddress = (): DeliveryAddress => {
    if (addressMode === "existing" && allSelectableAddresses.length > 0) {
      const found = allSelectableAddresses.find(
        (a, idx) => (a.id || `addr-${idx}`) === selectedAddressId
      );
      return found || allSelectableAddresses[0];
    }
    return draftAddress;
  };

  const getEffectiveBillingAddress = (): Address => {
    if (sameAsShipping) {
      const effShipping = getEffectiveAddress();
      return normalizeAddress(
        effShipping.StreetName
          ? effShipping
          : billingAddress.StreetName
          ? billingAddress
          : effShipping
      );
    }
    if (billingMode === "existing" && allSelectableAddresses.length > 0) {
      const found = allSelectableAddresses.find(
        (a, idx) => (a.id || `addr-${idx}`) === selectedBillingAddressId
      );
      return normalizeAddress(found || allSelectableAddresses[0]);
    }
    return draftBillingAddress;
  };

  const getEffectivePayment = (): PaymentMethod => {
    const activeTypes = new Set(activePaymentMethods.map((m) => m.type));
    const activeSaved = savedPaymentMethods.filter((p) =>
      activeTypes.has(p.type)
    );
    if (paymentMode === "existing" && activeSaved.length > 0) {
      const found = activeSaved.find(
        (p, idx) => (p.id || `pm-${idx}`) === selectedPaymentId
      );
      return found || activeSaved[0];
    }
    if (!activeTypes.has(draftPayment.type) && activePaymentMethods[0]) {
      return {
        ...draftPayment,
        type: activePaymentMethods[0].type,
      };
    }
    return draftPayment;
  };

  const handleSaveAddressClick = async () => {
    setDeliveryAddress(draftAddress);
    if (sameAsShipping && draftAddress.StreetName) {
      setBillingAddress(normalizeAddress(draftAddress));
    }
    if (addressMode !== "temp") {
      await saveDeliveryAddress(draftAddress);
      setAddressSavedStatus(true);
      setTimeout(() => setAddressSavedStatus(false), 3000);
    }
  };

  const handleSaveBillingAddressClick = async () => {
    setBillingAddress(draftBillingAddress);
    if (billingMode !== "temp") {
      await saveBillingAddress(draftBillingAddress);
      setBillingSavedStatus(true);
      setTimeout(() => setBillingSavedStatus(false), 3000);
    }
  };

  const handleSavePaymentClick = async () => {
    setPaymentMethod(draftPayment);
    if (paymentMode !== "temp") {
      await savePaymentMethod(draftPayment);
      setPaymentSavedStatus(true);
      setTimeout(() => setPaymentSavedStatus(false), 3000);
    }
  };

  const effectivePayment = getEffectivePayment();
  const effectivePaymentFee = calculateFeeForPaymentType(effectivePayment.type);
  const effectiveTotalMoney: Money = {
    price: Number(
      (
        discountedSubtotalMoney.price +
        (items.length > 0 ? selectedDeliveryOption.cost.price : 0) +
        effectivePaymentFee.price
      ).toFixed(2)
    ),
    currencyId: totalMoney.currencyId,
  };
  const isBankOrCash =
    effectivePayment.type === "bank-transfer" ||
    effectivePayment.type === "cash";

  const handleCheckout = async () => {
    if (items.length === 0) return;
    setSubmitting(true);
    setCheckoutError(null);
    setCheckoutStatus(null);

    try {
      const chosenAddress = getEffectiveAddress();
      const chosenBilling = getEffectiveBillingAddress();
      const chosenPayment = getEffectivePayment();

      // Only persist to user account if mode is "new-save"
      if (addressMode === "new-save" && chosenAddress.StreetName) {
        await saveDeliveryAddress(chosenAddress);
      }
      if (
        !sameAsShipping &&
        billingMode === "new-save" &&
        chosenBilling.StreetName
      ) {
        await saveBillingAddress(chosenBilling);
      }
      if (paymentMode === "new-save") {
        await savePaymentMethod(chosenPayment);
      }

      const formContactEmail = cartCheckoutForm.getValues("contactEmail");
      if (formContactEmail) {
        setContactEmail(formContactEmail);
      }
      const effectiveEmail =
        (formContactEmail || contactEmail).trim() ||
        user?.contactEmail ||
        user?.email ||
        "guest@local";
      const effectiveBilling = normalizeAddress(
        chosenBilling.StreetName
          ? chosenBilling
          : billingAddress.StreetName
          ? billingAddress
          : chosenAddress
      );

      const res = await fetch("/api/orders", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          items,
          totalMoney,
          deliveryOption: selectedDeliveryOption,
          billingAddress: effectiveBilling,
          shippingAddress: chosenAddress,
          deliveryAddress: chosenAddress,
          paymentMethod: chosenPayment,
          contactEmail: effectiveEmail,
          customer: user
            ? { ...user, contactEmail: effectiveEmail }
            : {
                name: { firstName: "Guest", lastName: "Player" },
                email: "guest@local",
                contactEmail: effectiveEmail,
              },
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        const missingList = Array.isArray(data.missingItems)
          ? data.missingItems.join(", ")
          : "";
        setCheckoutError(`${t.cart.missingItemError} ${missingList}`.trim());
        router.refresh();
      } else {
        clearCart();
        await refreshLoyalty();
        const suffix = isBankOrCash
          ? t.cart.orderReservedSuffix
          : t.cart.orderSavedSuffix;
        setCheckoutStatus(
          `${t.cart.orderSavedPrefix} #${String(
            data.orderId || "confirmed"
          ).slice(-6)} ${suffix}`
        );
        router.refresh();
      }
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div
      data-testid="cart-page"
      className="max-w-5xl mx-auto px-4 py-10 space-y-8"
    >
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1
            data-testid="cart-page-title"
            className="text-3xl font-extrabold text-slate-900 dark:text-white flex items-center gap-2.5"
          >
            <ShoppingCart className="w-7 h-7 text-brand-500" />
            <span>
              {t.cart.title} ({totalCount})
            </span>
          </h1>
        </div>
        <Button variant="outline" size="sm" asChild>
          <Link href="/">
            <ArrowLeft className="w-4 h-4" />
            <span>{t.detail.backToStore}</span>
          </Link>
        </Button>
      </div>

      {checkoutError && (
        <div
          data-testid="checkout-error"
          className="p-4 rounded-2xl bg-rose-500/10 border border-rose-500/30 text-rose-600 dark:text-rose-400 flex items-center gap-3 text-sm font-medium"
        >
          <AlertTriangle className="w-5 h-5 shrink-0" />
          <span>{checkoutError}</span>
        </div>
      )}

      {checkoutStatus && (
        <div
          data-testid="checkout-status"
          className="p-4 rounded-2xl bg-emerald-500/10 border border-emerald-500/30 text-emerald-600 dark:text-emerald-400 flex items-center gap-3 text-sm font-medium"
        >
          <CheckCircle2 className="w-5 h-5 shrink-0" />
          <span>{checkoutStatus}</span>
        </div>
      )}

      {/* Cart Items */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">{t.cart.title}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {items.length === 0 ? (
            <p className="text-sm text-slate-500 dark:text-slate-400 py-6 text-center">
              {t.cart.empty}
            </p>
          ) : (
            items.map((item) => (
              <div
                key={item.slug}
                data-testid={`cart-item-${item.slug}`}
                className="flex items-center justify-between p-4 rounded-2xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200/70 dark:border-slate-800"
              >
                <div>
                  <Badge
                    variant="default"
                    className="mb-1 text-[10px] px-2 py-0.5"
                  >
                    {getLocalizedCategory(item.category, locale)}
                  </Badge>
                  <h4 className="text-sm font-bold text-slate-900 dark:text-white">
                    {locale === "he" && item.title_he
                      ? item.title_he
                      : item.title}
                  </h4>
                  <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                    {t.cart.qty}: {item.quantity} × {formatMoney(item.money)}
                  </p>
                </div>
                <Button
                  variant="ghost"
                  size="icon"
                  data-testid={`remove-cart-${item.slug}`}
                  onClick={() => removeFromCart(item.slug)}
                  className="text-slate-400 hover:text-rose-500"
                >
                  <Trash2 className="w-4 h-4" />
                </Button>
              </div>
            ))
          )}
        </CardContent>
      </Card>

      {/* Delivery Options (Including "Wait in Store" & Admin-Configured Options) */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-lg">
            <Truck className="w-5 h-5 text-brand-500" />
            <span>{t.cart.deliveryOptionTitle}</span>
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div
            data-testid="cart-delivery-options"
            className="grid grid-cols-1 sm:grid-cols-2 gap-3"
          >
            {deliveryOptions
              .filter((opt) => opt.active !== false)
              .map((opt) => {
                const isSelected = selectedDeliveryOption.id === opt.id;
                const estDays = Math.max(
                  0,
                  Math.floor(
                    Number(opt.estimatedDays ?? (opt.isStorePickup ? 0 : 3))
                  )
                );
                const expectedDateStr = formatExpectedDeliveryDate(
                  opt.expectedDeliveryAtUtc || estDays
                );
                return (
                  <button
                    key={opt.id}
                    type="button"
                    data-testid={`delivery-option-${opt.id}`}
                    onClick={() => setSelectedDeliveryOption(opt)}
                    className={`p-4 rounded-2xl border text-start transition cursor-pointer flex items-center justify-between gap-3 ${
                      isSelected
                        ? "bg-brand-500/10 border-brand-600 text-slate-900 dark:text-white"
                        : "bg-slate-50 dark:bg-slate-800/60 border-slate-200 dark:border-slate-800 text-slate-600 dark:text-slate-300"
                    }`}
                  >
                    <div className="space-y-0.5">
                      <span className="font-bold text-sm block">
                        {locale === "he" && opt.label_he
                          ? opt.label_he
                          : opt.label}
                      </span>
                      {opt.isStorePickup && (
                        <span className="text-xs text-emerald-500 font-semibold block">
                          Store Pickup • Wait in Store
                        </span>
                      )}
                      <span
                        data-testid={`delivery-expected-date-${opt.id}`}
                        className="text-[11px] text-slate-500 dark:text-slate-400 block"
                      >
                        {locale === "he"
                          ? `תאריך אספקה משוער: ${expectedDateStr} (${estDays} ימים)`
                          : `Expected Delivery: ${expectedDateStr} (${estDays}d)`}
                      </span>
                    </div>
                    <Badge variant={opt.cost.price === 0 ? "emerald" : "default"}>
                      {formatMoney(opt.cost)}
                    </Badge>
                  </button>
                );
              })}
          </div>
        </CardContent>
      </Card>

      {/* Shipping Address (with Billing Address as Default) & Payment Method Grid (NO Gaming Accounts in Cart!) */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Address Section with 3 Modes: Existing (Billing or Saved Shipping), Add & Save, or Temporary */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center justify-between text-lg">
              <span className="flex items-center gap-2">
                <MapPin className="w-5 h-5 text-brand-500" />
                <span>{t.address.title}</span>
              </span>
              {addressSavedStatus && (
                <span
                  data-testid="address-saved-msg"
                  className="text-xs font-semibold text-emerald-500 flex items-center gap-1"
                >
                  <CheckCircle2 className="w-4 h-4" />
                  {t.address.savedStatus}
                </span>
              )}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-3 gap-1.5">
              <button
                type="button"
                data-testid="address-mode-existing"
                onClick={() => setAddressMode("existing")}
                className={`px-2 py-2 rounded-xl text-[11px] font-semibold border transition cursor-pointer ${
                  addressMode === "existing"
                    ? "bg-brand-600 text-white border-brand-600"
                    : "bg-slate-50 dark:bg-slate-800 border-slate-200 dark:border-slate-700"
                }`}
              >
                {t.cart.addressModeExisting}
              </button>
              <button
                type="button"
                data-testid="address-mode-new-save"
                onClick={() => setAddressMode("new-save")}
                className={`px-2 py-2 rounded-xl text-[11px] font-semibold border transition cursor-pointer ${
                  addressMode === "new-save"
                    ? "bg-brand-600 text-white border-brand-600"
                    : "bg-slate-50 dark:bg-slate-800 border-slate-200 dark:border-slate-700"
                }`}
              >
                {t.cart.addressModeNewSave}
              </button>
              <button
                type="button"
                data-testid="address-mode-temp"
                onClick={() => setAddressMode("temp")}
                className={`px-2 py-2 rounded-xl text-[11px] font-semibold border transition cursor-pointer ${
                  addressMode === "temp"
                    ? "bg-brand-600 text-white border-brand-600"
                    : "bg-slate-50 dark:bg-slate-800 border-slate-200 dark:border-slate-700"
                }`}
              >
                {t.cart.addressModeTemp}
              </button>
            </div>

            {addressMode === "existing" && allSelectableAddresses.length > 0 ? (
              <div className="space-y-2">
                <select
                  data-testid="saved-address-select"
                  value={selectedAddressId}
                  onChange={(e) => setSelectedAddressId(e.target.value)}
                  className="w-full h-10 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 px-3 text-xs font-semibold"
                >
                  {allSelectableAddresses.map((addr, idx) => {
                    const id = addr.id || `addr-${idx}`;
                    return (
                      <option key={`${id}-${idx}`} value={id}>
                        {formatAddressOneLine(addr, { includeNickname: true })}
                      </option>
                    );
                  })}
                </select>
              </div>
            ) : (
              <form
                onSubmit={cartAddressForm.handleSubmit(handleSaveAddressClick)}
                className="space-y-2.5"
              >
                <AddressFormFields
                  form={cartAddressForm}
                  activeCountries={activeCountries}
                  testIdPrefix="address"
                  showNickname={addressMode !== "temp"}
                  showDeliveryNotes={true}
                  zipActionsTestId="cart-zip-autocomplete-actions"
                  fillZipBtnTestId="fill-address-from-zip-btn"
                  findZipBtnTestId="find-zip-from-address-btn"
                />
                {addressMode !== "temp" && (
                  <Button
                    type="submit"
                    variant="secondary"
                    size="sm"
                    className="w-full"
                    data-testid="save-address-btn"
                  >
                    <Save className="w-3.5 h-3.5" />
                    <span>{t.address.saveButton}</span>
                  </Button>
                )}
              </form>
            )}

            <label
              data-testid="same-as-shipping-label"
              className="flex items-center gap-2.5 pt-3 border-t border-slate-200 dark:border-slate-800 text-xs font-semibold text-slate-700 dark:text-slate-300 cursor-pointer"
            >
              <input
                type="checkbox"
                data-testid="same-as-shipping-checkbox"
                checked={sameAsShipping}
                onChange={(e) => {
                  const nextChecked = e.target.checked;
                  setSameAsShipping(nextChecked);
                  if (!nextChecked) {
                    const effShip = getEffectiveAddress();
                    if (
                      effShip.StreetName &&
                      !cartBillingForm.getValues("StreetName")
                    ) {
                      cartBillingForm.reset(
                        normalizeAddress(effShip, {
                          defaultNickname: effShip.nickname || "Billing",
                        })
                      );
                    }
                  }
                }}
              />
              <span>{t.cart.sameAsShippingLabel}</span>
            </label>
          </CardContent>
        </Card>

        {!sameAsShipping && (
          <Card data-testid="cart-billing-address-card">
            <CardHeader>
              <CardTitle className="flex items-center justify-between text-lg">
                <span className="flex items-center gap-2">
                  <MapPin className="w-5 h-5 text-amber-500" />
                  <span>{t.cart.billingAddressTitle}</span>
                </span>
                {billingSavedStatus && (
                  <span
                    data-testid="cart-billing-saved-msg"
                    className="text-xs font-semibold text-emerald-500 flex items-center gap-1"
                  >
                    <CheckCircle2 className="w-4 h-4" />
                    {t.address.billingSavedStatus}
                  </span>
                )}
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-3 gap-1.5">
                <button
                  type="button"
                  data-testid="billing-mode-existing"
                  onClick={() => setBillingMode("existing")}
                  className={`px-2 py-2 rounded-xl text-[11px] font-semibold border transition cursor-pointer ${
                    billingMode === "existing"
                      ? "bg-brand-600 text-white border-brand-600"
                      : "bg-slate-50 dark:bg-slate-800 border-slate-200 dark:border-slate-700"
                  }`}
                >
                  {t.cart.billingModeExisting}
                </button>
                <button
                  type="button"
                  data-testid="billing-mode-new-save"
                  onClick={() => setBillingMode("new-save")}
                  className={`px-2 py-2 rounded-xl text-[11px] font-semibold border transition cursor-pointer ${
                    billingMode === "new-save"
                      ? "bg-brand-600 text-white border-brand-600"
                      : "bg-slate-50 dark:bg-slate-800 border-slate-200 dark:border-slate-700"
                  }`}
                >
                  {t.cart.billingModeNewSave}
                </button>
                <button
                  type="button"
                  data-testid="billing-mode-temp"
                  onClick={() => setBillingMode("temp")}
                  className={`px-2 py-2 rounded-xl text-[11px] font-semibold border transition cursor-pointer ${
                    billingMode === "temp"
                      ? "bg-brand-600 text-white border-brand-600"
                      : "bg-slate-50 dark:bg-slate-800 border-slate-200 dark:border-slate-700"
                  }`}
                >
                  {t.cart.billingModeTemp}
                </button>
              </div>

              {billingMode === "existing" && allSelectableAddresses.length > 0 ? (
                <div className="space-y-2">
                  <select
                    data-testid="saved-billing-address-select"
                    value={selectedBillingAddressId}
                    onChange={(e) =>
                      setSelectedBillingAddressId(e.target.value)
                    }
                    className="w-full h-10 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 px-3 text-xs font-semibold"
                  >
                    {allSelectableAddresses.map((addr, idx) => {
                      const id = addr.id || `addr-${idx}`;
                      return (
                        <option key={`${id}-${idx}`} value={id}>
                          {formatAddressOneLine(addr, { includeNickname: true })}
                        </option>
                      );
                    })}
                  </select>
                </div>
              ) : (
                <form
                  onSubmit={cartBillingForm.handleSubmit(
                    handleSaveBillingAddressClick
                  )}
                  className="space-y-2.5"
                >
                  <AddressFormFields
                    form={cartBillingForm}
                    activeCountries={activeCountries}
                    testIdPrefix="cart-billing-address"
                    showNickname={billingMode !== "temp"}
                    showDeliveryNotes={false}
                    zipActionsTestId="cart-billing-zip-autocomplete-actions"
                    fillZipBtnTestId="cart-billing-fill-address-from-zip-btn"
                    findZipBtnTestId="cart-billing-find-zip-from-address-btn"
                  />
                  {billingMode !== "temp" && (
                    <Button
                      type="submit"
                      variant="secondary"
                      size="sm"
                      className="w-full"
                      data-testid="save-cart-billing-address-btn"
                    >
                      <Save className="w-3.5 h-3.5" />
                      <span>{t.address.saveBillingButton}</span>
                    </Button>
                  )}
                </form>
              )}
            </CardContent>
          </Card>
        )}

        {/* Payment Method Section with 3 Modes + Bank Transaction & Hard Cash */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center justify-between text-lg">
              <span className="flex items-center gap-2">
                <CreditCard className="w-5 h-5 text-brand-500" />
                <span>{t.payment.title}</span>
              </span>
              {paymentSavedStatus && (
                <span
                  data-testid="payment-saved-msg"
                  className="text-xs font-semibold text-emerald-500 flex items-center gap-1"
                >
                  <CheckCircle2 className="w-4 h-4" />
                  {t.payment.savedStatus}
                </span>
              )}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-3 gap-1.5">
              <button
                type="button"
                data-testid="payment-mode-existing"
                onClick={() => setPaymentMode("existing")}
                className={`px-2 py-2 rounded-xl text-[11px] font-semibold border transition cursor-pointer ${
                  paymentMode === "existing"
                    ? "bg-brand-600 text-white border-brand-600"
                    : "bg-slate-50 dark:bg-slate-800 border-slate-200 dark:border-slate-700"
                }`}
              >
                {t.cart.paymentModeExisting}
              </button>
              <button
                type="button"
                data-testid="payment-mode-new-save"
                onClick={() => setPaymentMode("new-save")}
                className={`px-2 py-2 rounded-xl text-[11px] font-semibold border transition cursor-pointer ${
                  paymentMode === "new-save"
                    ? "bg-brand-600 text-white border-brand-600"
                    : "bg-slate-50 dark:bg-slate-800 border-slate-200 dark:border-slate-700"
                }`}
              >
                {t.cart.paymentModeNewSave}
              </button>
              <button
                type="button"
                data-testid="payment-mode-temp"
                onClick={() => setPaymentMode("temp")}
                className={`px-2 py-2 rounded-xl text-[11px] font-semibold border transition cursor-pointer ${
                  paymentMode === "temp"
                    ? "bg-brand-600 text-white border-brand-600"
                    : "bg-slate-50 dark:bg-slate-800 border-slate-200 dark:border-slate-700"
                }`}
              >
                {t.cart.paymentModeTemp}
              </button>
            </div>

            {paymentMode === "existing" && savedPaymentMethods.length > 0 ? (
              <div className="space-y-2">
                <select
                  data-testid="saved-payment-select"
                  value={selectedPaymentId}
                  onChange={(e) => setSelectedPaymentId(e.target.value)}
                  className="w-full h-10 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 px-3 text-xs font-semibold"
                >
                  {savedPaymentMethods.map((pm, idx) => {
                    const id = pm.id || `pm-${idx}`;
                    return (
                      <option key={id} value={id}>
                        {pm.nickname ? `[${pm.nickname}] ` : ""}
                        {t.payment.types[pm.type] || pm.type} — {pm.detail}
                      </option>
                    );
                  })}
                </select>
              </div>
            ) : (
              <form
                onSubmit={cartPaymentForm.handleSubmit(handleSavePaymentClick)}
                className="space-y-2.5"
              >
                <div className="grid grid-cols-2 gap-1.5">
                  {activePaymentMethods.map((pmCfg) => {
                    const pt = pmCfg.type;
                    const hasPct = pmCfg.feePercent > 0;
                    const hasConst = pmCfg.feeConstant.price > 0;
                    const feeSummary =
                      hasPct && hasConst
                        ? `+${pmCfg.feePercent}% + ${formatMoney(pmCfg.feeConstant)}`
                        : hasPct
                        ? `+${pmCfg.feePercent}%`
                        : hasConst
                        ? `+${formatMoney(pmCfg.feeConstant)}`
                        : null;
                    return (
                      <button
                        key={pt}
                        type="button"
                        data-testid={`payment-type-${pt}`}
                        onClick={() => {
                          cartPaymentForm.setValue("type", pt);
                          setPaymentMethod({
                            ...draftPayment,
                            type: pt,
                          });
                        }}
                        className={`px-2.5 py-2 rounded-xl text-xs font-semibold border transition cursor-pointer flex flex-col items-center justify-center gap-0.5 ${
                          effectivePayment.type === pt
                            ? "bg-brand-600 text-white border-brand-600"
                            : "bg-slate-50 dark:bg-slate-800 text-slate-700 dark:text-slate-300 border-slate-200 dark:border-slate-700"
                        }`}
                      >
                        <span>{t.payment.types[pt]}</span>
                        {feeSummary && (
                          <span
                            data-testid={`payment-type-fee-badge-${pt}`}
                            className="text-[10px] opacity-85"
                          >
                            ({feeSummary})
                          </span>
                        )}
                      </button>
                    );
                  })}
                </div>

                {paymentMode !== "temp" && (
                  <Input
                    data-testid="payment-nickname"
                    placeholder={t.payment.nicknamePlaceholder}
                    {...cartPaymentForm.register("nickname")}
                  />
                )}

                <NameFields
                  register={cartPaymentForm.register}
                  fieldPrefix="accountHolderName"
                  testIdPrefix="payment-holder-name"
                  required={false}
                  showFieldLabels={false}
                  label={t.name.accountHolderLabel}
                />

                <Input
                  data-testid="payment-detail"
                  placeholder={t.payment.detailPlaceholder}
                  {...cartPaymentForm.register("detail")}
                />

                {paymentMode !== "temp" && (
                  <Button
                    type="submit"
                    variant="secondary"
                    size="sm"
                    className="w-full"
                    data-testid="save-payment-btn"
                  >
                    <Save className="w-3.5 h-3.5" />
                    <span>{t.payment.saveButton}</span>
                  </Button>
                )}
              </form>
            )}

            {isBankOrCash && (
              <div
                data-testid="bank-or-cash-notice"
                className="p-3.5 rounded-xl bg-amber-500/10 border border-amber-500/30 text-amber-600 dark:text-amber-300 text-xs font-medium flex items-start gap-2.5"
              >
                <Clock className="w-4 h-4 shrink-0 mt-0.5" />
                <span>{t.cart.bankOrCashNotice}</span>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Contact / Notification Email & Order Summary Card */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-lg">
            <Mail className="w-5 h-5 text-brand-500" />
            <span>{t.cart.contactEmailTitle}</span>
          </CardTitle>
          <CardDescription>{t.cart.contactEmailSubtitle}</CardDescription>
        </CardHeader>
        <form onSubmit={cartCheckoutForm.handleSubmit(handleCheckout)}>
          <CardContent className="space-y-4">
            <Input
              type="email"
              data-testid="cart-contact-email"
              placeholder="notifications@example.com"
              {...cartCheckoutForm.register("contactEmail")}
            />

            <div className="p-4 rounded-2xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-800 space-y-2 text-sm">
              <div className="flex items-center justify-between text-slate-600 dark:text-slate-300">
                <span>{t.cart.subtotal}</span>
                <span data-testid="cart-subtotal-money">
                  {formatMoney(subtotalMoney)}
                </span>
              </div>

              {discountPercent > 0 && (
                <div
                  data-testid="cart-discount-row"
                  className="flex items-center justify-between text-emerald-600 dark:text-emerald-400 font-semibold"
                >
                  <span>
                    {t.cart.discount} ({loyalty?.currentClass?.name} −
                    {discountPercent}%)
                  </span>
                  <span>
                    −
                    {formatMoney({
                      price: Number(
                        (
                          subtotalMoney.price - discountedSubtotalMoney.price
                        ).toFixed(2)
                      ),
                      currencyId: totalMoney.currencyId,
                    })}
                  </span>
                </div>
              )}

              <div className="flex items-center justify-between text-slate-600 dark:text-slate-300">
                <span>
                  {t.cart.deliveryCost} (
                  {locale === "he" && selectedDeliveryOption.label_he
                    ? selectedDeliveryOption.label_he
                    : selectedDeliveryOption.label}
                  )
                </span>
                <span data-testid="cart-delivery-cost">
                  {formatMoney(selectedDeliveryOption.cost)}
                </span>
              </div>

              <div className="flex items-center justify-between text-xs text-slate-500 dark:text-slate-400">
                <span>
                  {locale === "he"
                    ? "תאריך אספקה משוער"
                    : "Expected Delivery Date"}
                </span>
                <span data-testid="cart-expected-delivery-date">
                  {formatExpectedDeliveryDate(
                    selectedDeliveryOption.expectedDeliveryAtUtc ||
                      (selectedDeliveryOption.estimatedDays ??
                        (selectedDeliveryOption.isStorePickup ? 0 : 3))
                  )}
                </span>
              </div>

              {effectivePaymentFee.price > 0 && (
                <div
                  data-testid="cart-payment-fee-row"
                  className="flex items-center justify-between text-slate-600 dark:text-slate-300"
                >
                  <span>
                    {t.cart.paymentFee} ({t.payment.types[effectivePayment.type]})
                  </span>
                  <span data-testid="cart-payment-fee-money">
                    {formatMoney(effectivePaymentFee)}
                  </span>
                </div>
              )}

              <div className="pt-2 border-t border-slate-200 dark:border-slate-700 flex items-center justify-between text-lg font-extrabold text-slate-900 dark:text-white">
                <span>{t.cart.total}</span>
                <span data-testid="cart-total-money">
                  {formatMoney(effectiveTotalMoney)}
                </span>
              </div>
            </div>

            <p
              data-testid="cart-privacy-section11-notice"
              className="text-[11px] text-slate-500 dark:text-slate-400 leading-relaxed"
            >
              {t.privacy.section11Notice}{" "}
              <Link
                href="/privacy"
                className="text-teal-600 dark:text-teal-400 underline font-semibold"
              >
                {t.footer.privacyPolicyLink}
              </Link>
            </p>
          </CardContent>
          <CardFooter className="flex flex-col sm:flex-row gap-3">
            <Button
              type="submit"
              className="w-full"
              size="lg"
              data-testid="checkout-btn"
              disabled={items.length === 0 || submitting}
            >
              {submitting ? t.cart.processing : t.cart.completeOrder}
            </Button>
          </CardFooter>
        </form>
      </Card>
    </div>
  );
}
