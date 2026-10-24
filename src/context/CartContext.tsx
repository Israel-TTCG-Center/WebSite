"use client";

import React, { createContext, useContext, useEffect, useState } from "react";
import type { StoreItem } from "@/lib/mongodb";
import { type Money, normalizeMoney } from "@/lib/money";
import { type Name, normalizeName } from "@/lib/name";
import {
  normalizeAddress,
  normalizeDeliveryAddress,
  resolveDefaultCountryAlpha3,
  type Address,
  type DeliveryAddress,
  type Phone,
} from "@/lib/address";
import type { Locale } from "@/lib/i18n";
import type { Theme } from "@/context/ThemeContext";
import {
  calculatePaymentMethodFee,
  DEFAULT_DELIVERY_OPTIONS,
  DEFAULT_PAYMENT_METHODS_CONFIG,
  DEFAULT_SUPPORTED_COUNTRIES,
  getEffectiveItemMoney,
  normalizeDeliveryOptions,
  normalizeNotifications,
  normalizePaymentMethodsConfig,
  normalizeSupportedCountries,
  type DeliveryOption,
  type LoyaltyStatus,
  type NotificationPreferences,
  type PaymentMethodConfig,
  type SupportedCountryConfig,
} from "@/lib/premium";

export interface CartEntry {
  slug: string;
  title: string;
  title_he?: string;
  money: Money;
  category: string;
  type: string;
  quantity: number;
}

export type { Address, DeliveryAddress, Phone };

export type PaymentMethodType =
  | "credit-card"
  | "paypal"
  | "apple-pay"
  | "google-pay"
  | "paybox"
  | "bit"
  | "bank-transfer"
  | "cash";

export interface PaymentMethod {
  id?: string;
  nickname?: string;
  accountHolderName?: Name;
  type: PaymentMethodType;
  detail: string;
}

export interface GamingAccounts {
  wizardsAccount: string;
  riotAccount: string;
}

export interface UserPreferences {
  locale: Locale;
  theme: Theme;
}

export interface LinkedProvider {
  provider: string;
  providerEmail: string;
  connectedAtUtc: string;
}

export interface UserProfile {
  name: Name;
  email: string;
  contactEmail?: string;
  notifications?: NotificationPreferences;
  linkedProviders?: LinkedProvider[];
  billingAddress?: Address;
  savedAddresses?: DeliveryAddress[];
  savedPaymentMethods?: PaymentMethod[];
  deliveryAddress?: DeliveryAddress;
  paymentMethod?: PaymentMethod;
  gamingAccounts?: GamingAccounts;
  preferences?: UserPreferences;
}

interface CartContextType {
  items: CartEntry[];
  isOpen: boolean;
  setIsOpen: (open: boolean) => void;
  addToCart: (item: StoreItem) => void;
  removeFromCart: (slug: string) => void;
  clearCart: () => void;
  subtotalMoney: Money;
  discountPercent: number;
  discountedSubtotalMoney: Money;
  deliveryOptions: DeliveryOption[];
  selectedDeliveryOption: DeliveryOption;
  setSelectedDeliveryOption: (opt: DeliveryOption) => void;
  refreshDeliveryOptions: () => Promise<void>;
  paymentMethodsConfig: PaymentMethodConfig[];
  activePaymentMethods: PaymentMethodConfig[];
  supportedCountries: SupportedCountryConfig[];
  activeCountries: SupportedCountryConfig[];
  paymentFeeMoney: Money;
  calculateFeeForPaymentType: (type: PaymentMethodType) => Money;
  totalMoney: Money;
  totalCount: number;
  loyalty: LoyaltyStatus | null;
  refreshLoyalty: () => Promise<void>;
  authHydrated: boolean;
  user: UserProfile | null;
  setUser: (user: UserProfile | null) => void;
  contactEmail: string;
  setContactEmail: (email: string) => void;
  notifications: NotificationPreferences;
  setNotifications: (prefs: NotificationPreferences) => void;
  saveNotificationsAndEmail: (
    nextEmail: string,
    nextPrefs: NotificationPreferences
  ) => Promise<boolean>;
  billingAddress: Address;
  setBillingAddress: (addr: Address) => void;
  saveBillingAddress: (addr: Address) => Promise<boolean>;
  savedAddresses: DeliveryAddress[];
  saveAddressesList: (list: DeliveryAddress[]) => Promise<boolean>;
  deliveryAddress: DeliveryAddress;
  setDeliveryAddress: (addr: DeliveryAddress) => void;
  saveDeliveryAddress: (addr: DeliveryAddress) => Promise<boolean>;
  savedPaymentMethods: PaymentMethod[];
  savePaymentMethodsList: (list: PaymentMethod[]) => Promise<boolean>;
  paymentMethod: PaymentMethod;
  setPaymentMethod: (pm: PaymentMethod) => void;
  savePaymentMethod: (pm: PaymentMethod) => Promise<boolean>;
  gamingAccounts: GamingAccounts;
  setGamingAccounts: (ga: GamingAccounts) => void;
  saveGamingAccounts: (ga: GamingAccounts) => Promise<boolean>;
  saveLinkedProviders: (providers: LinkedProvider[]) => Promise<boolean>;
  saveUserPreferences: (prefs: UserPreferences) => Promise<void>;
}

const EMPTY_BILLING_ADDRESS: Address = normalizeAddress(
  {},
  {
    defaultId: "billing-default",
    defaultNickname: "Billing (Default Shipping)",
  }
);

const EMPTY_ADDRESS: DeliveryAddress = normalizeDeliveryAddress(
  {},
  {
    defaultId: "addr-1",
    defaultNickname: "Home",
  }
);

const DEFAULT_PAYMENT: PaymentMethod = {
  id: "pm-1",
  nickname: "Primary",
  type: "credit-card",
  detail: "",
};

const EMPTY_GAMING_ACCOUNTS: GamingAccounts = {
  wizardsAccount: "",
  riotAccount: "",
};

const CartContext = createContext<CartContextType | null>(null);

export function CartProvider({ children }: { children: React.ReactNode }) {
  const [items, setItems] = useState<CartEntry[]>([]);
  const [isOpen, setIsOpen] = useState(false);
  const [authHydrated, setAuthHydrated] = useState(false);
  const [user, setUserState] = useState<UserProfile | null>(null);
  const [loyalty, setLoyalty] = useState<LoyaltyStatus | null>(null);

  const [contactEmail, setContactEmailState] = useState<string>("");
  const [notifications, setNotificationsState] =
    useState<NotificationPreferences>(normalizeNotifications(null));

  const [billingAddress, setBillingAddressState] = useState<Address>(
    EMPTY_BILLING_ADDRESS
  );
  const [savedAddresses, setSavedAddressesState] = useState<DeliveryAddress[]>(
    []
  );
  const [deliveryAddress, setDeliveryAddressState] =
    useState<DeliveryAddress>(EMPTY_ADDRESS);

  const [savedPaymentMethods, setSavedPaymentMethodsState] = useState<
    PaymentMethod[]
  >([]);
  const [paymentMethod, setPaymentMethodState] =
    useState<PaymentMethod>(DEFAULT_PAYMENT);

  const [gamingAccounts, setGamingAccountsState] = useState<GamingAccounts>(
    EMPTY_GAMING_ACCOUNTS
  );

  const [deliveryOptions, setDeliveryOptions] = useState<DeliveryOption[]>(() =>
    normalizeDeliveryOptions(DEFAULT_DELIVERY_OPTIONS)
  );
  const [selectedDeliveryOption, setSelectedDeliveryOption] =
    useState<DeliveryOption>(
      () => normalizeDeliveryOptions(DEFAULT_DELIVERY_OPTIONS)[0]
    );
  const [paymentMethodsConfig, setPaymentMethodsConfig] = useState<
    PaymentMethodConfig[]
  >(DEFAULT_PAYMENT_METHODS_CONFIG);
  const [supportedCountries, setSupportedCountries] = useState<
    SupportedCountryConfig[]
  >(DEFAULT_SUPPORTED_COUNTRIES);

  const fetchLoyaltyForEmail = async (email: string) => {
    try {
      const res = await fetch(
        `/api/premium?email=${encodeURIComponent(email)}`
      );
      if (res.ok) {
        const data = await res.json();
        if (data.loyalty) {
          setLoyalty(data.loyalty);
        }
      }
    } catch {
      // ignore network error
    }
  };

  const refreshDeliveryOptions = async () => {
    try {
      const res = await fetch("/api/metadata");
      if (res.ok) {
        const data = await res.json();
        const opts = normalizeDeliveryOptions(data.metadata?.deliveryOptions);
        if (opts.length > 0) {
          setDeliveryOptions(opts);
          setSelectedDeliveryOption((prev) => {
            const activeOpts = opts.filter((o) => o.active !== false);
            const foundActive = activeOpts.find((o) => o.id === prev.id);
            return foundActive || activeOpts[0] || opts[0];
          });
        }
        const pmConfigs = normalizePaymentMethodsConfig(
          data.metadata?.paymentMethodsConfig
        );
        setPaymentMethodsConfig(pmConfigs);
        setPaymentMethodState((prev) => {
          const isStillActive = pmConfigs.some(
            (m) => m.type === prev.type && m.active
          );
          if (isStillActive) return prev;
          const firstActive = pmConfigs.find((m) => m.active) || pmConfigs[0];
          return {
            ...prev,
            type: firstActive.type,
          };
        });
        const countryConfigs = normalizeSupportedCountries(
          data.metadata?.supportedCountries
        );
        setSupportedCountries(countryConfigs);
      }
    } catch {
      // ignore network error
    }
  };

  const refreshLoyalty = async () => {
    if (!user?.email) {
      setLoyalty(null);
      return;
    }
    await fetchLoyaltyForEmail(user.email);
  };

  const applyUserToState = (rawUser: UserProfile) => {
    const nextUser: UserProfile = {
      ...rawUser,
      name: normalizeName(
        rawUser.name,
        rawUser.email?.split("@")[0] || "Guest",
        "Player"
      ),
    };
    setUserState(nextUser);
    // Use the user's saved notification/contact email, defaulting to their account email
    setContactEmailState(nextUser.contactEmail || nextUser.email || "");
    setNotificationsState(normalizeNotifications(nextUser.notifications));

    const defaultCountry = resolveDefaultCountryAlpha3(
      nextUser.billingAddress,
      nextUser.deliveryAddress || nextUser.savedAddresses?.[0],
      "ISR"
    );

    const rawAddrList = Array.isArray(nextUser.savedAddresses)
      ? nextUser.savedAddresses
      : nextUser.deliveryAddress?.StreetName || (nextUser.deliveryAddress as any)?.street
      ? [nextUser.deliveryAddress]
      : [];
    const addrList: DeliveryAddress[] = rawAddrList.map((a, idx) =>
      normalizeDeliveryAddress(a, {
        billingCountry: defaultCountry,
        defaultId: a.id || `addr-${idx + 1}`,
        defaultNickname: a.nickname || "Home",
      })
    );
    setSavedAddressesState(addrList);
    localStorage.setItem("docksidekeep-addresses-list", JSON.stringify(addrList));

    const nextBilling: Address =
      nextUser.billingAddress?.StreetName || (nextUser.billingAddress as any)?.street
        ? normalizeAddress(nextUser.billingAddress, {
            billingCountry: defaultCountry,
            defaultId: "billing-default",
            defaultNickname:
              nextUser.billingAddress.nickname || "Billing (Default Shipping)",
          })
        : nextUser.deliveryAddress?.StreetName || (nextUser.deliveryAddress as any)?.street
        ? normalizeAddress(nextUser.deliveryAddress, {
            billingCountry: defaultCountry,
            defaultId: "billing-default",
            defaultNickname: "Billing (Default Shipping)",
          })
        : addrList[0]
        ? normalizeAddress(addrList[0], {
            billingCountry: defaultCountry,
            defaultId: "billing-default",
            defaultNickname: "Billing (Default Shipping)",
          })
        : EMPTY_BILLING_ADDRESS;

    setBillingAddressState(nextBilling);
    localStorage.setItem(
      "docksidekeep-billing-address",
      JSON.stringify(nextBilling)
    );

    if (nextBilling.StreetName) {
      setDeliveryAddressState(
        normalizeDeliveryAddress(nextBilling, {
          billingCountry: nextBilling.CountryCodeAlpha3,
        })
      );
    } else if (
      nextUser.deliveryAddress?.StreetName ||
      (nextUser.deliveryAddress as any)?.street
    ) {
      setDeliveryAddressState(
        normalizeDeliveryAddress(nextUser.deliveryAddress, {
          billingCountry: nextBilling.CountryCodeAlpha3,
        })
      );
    } else if (addrList[0]) {
      setDeliveryAddressState(addrList[0]);
    }

    const pmList = Array.isArray(nextUser.savedPaymentMethods)
      ? nextUser.savedPaymentMethods
      : nextUser.paymentMethod?.detail
      ? [
          {
            id: nextUser.paymentMethod.id || "pm-1",
            nickname: nextUser.paymentMethod.nickname || "Primary",
            ...nextUser.paymentMethod,
          },
        ]
      : [];
    setSavedPaymentMethodsState(pmList);
    localStorage.setItem("docksidekeep-payments-list", JSON.stringify(pmList));

    if (nextUser.paymentMethod?.detail) {
      setPaymentMethodState(nextUser.paymentMethod);
    } else if (pmList[0]) {
      setPaymentMethodState(pmList[0]);
    }

    if (nextUser.gamingAccounts) {
      setGamingAccountsState(nextUser.gamingAccounts);
    }
  };

  useEffect(() => {
    refreshDeliveryOptions();
    try {
      const savedCart = localStorage.getItem("docksidekeep-cart");
      if (savedCart) {
        const parsed = JSON.parse(savedCart) as any[];
        setItems(
          parsed.map((entry) => ({
            ...entry,
            money: normalizeMoney(entry.money ?? entry.price, "ILS"),
          }))
        );
      }

      const savedBilling = localStorage.getItem("docksidekeep-billing-address");
      if (savedBilling) {
        setBillingAddressState(
          normalizeAddress(JSON.parse(savedBilling), {
            defaultId: "billing-default",
            defaultNickname: "Billing (Default Shipping)",
          })
        );
      }

      const savedAddress = localStorage.getItem("docksidekeep-address");
      if (savedAddress) {
        setDeliveryAddressState(normalizeDeliveryAddress(JSON.parse(savedAddress)));
      }

      const savedAddressesRaw = localStorage.getItem("docksidekeep-addresses-list");
      if (savedAddressesRaw) {
        const parsedList = JSON.parse(savedAddressesRaw);
        if (Array.isArray(parsedList)) {
          setSavedAddressesState(
            parsedList.map((a, idx) =>
              normalizeDeliveryAddress(a, { defaultId: a?.id || `addr-${idx + 1}` })
            )
          );
        }
      }

      const savedPayment = localStorage.getItem("docksidekeep-payment");
      if (savedPayment) {
        setPaymentMethodState(JSON.parse(savedPayment));
      }

      const savedPaymentsRaw = localStorage.getItem("docksidekeep-payments-list");
      if (savedPaymentsRaw) {
        setSavedPaymentMethodsState(JSON.parse(savedPaymentsRaw));
      }

      const savedGaming = localStorage.getItem("docksidekeep-gaming-accounts");
      if (savedGaming) {
        setGamingAccountsState(JSON.parse(savedGaming));
      }

      const savedUser = localStorage.getItem("docksidekeep-user");
      if (savedUser) {
        const parsedUser = JSON.parse(savedUser) as UserProfile;
        applyUserToState(parsedUser);
        if (parsedUser.email) {
          fetchLoyaltyForEmail(parsedUser.email);
        }
      } else {
        setLoyalty(null);
      }
    } catch {
      // ignore parse errors
    } finally {
      setAuthHydrated(true);
    }
  }, []);

  const saveCart = (next: CartEntry[]) => {
    setItems(next);
    localStorage.setItem("docksidekeep-cart", JSON.stringify(next));
  };

  const setUser = (nextUser: UserProfile | null) => {
    setUserState(nextUser);
    if (nextUser) {
      localStorage.setItem("docksidekeep-user", JSON.stringify(nextUser));
      applyUserToState(nextUser);
      fetchLoyaltyForEmail(nextUser.email);
    } else {
      localStorage.removeItem("docksidekeep-user");
      setContactEmailState("");
      setNotificationsState(normalizeNotifications(null));
      fetchLoyaltyForEmail("guest@local");
    }
  };

  const setContactEmail = (email: string) => {
    setContactEmailState(email);
  };

  const setNotifications = (prefs: NotificationPreferences) => {
    setNotificationsState(normalizeNotifications(prefs));
  };

  const saveNotificationsAndEmail = async (
    nextEmail: string,
    nextPrefs: NotificationPreferences
  ): Promise<boolean> => {
    const normalized = normalizeNotifications(nextPrefs);
    setContactEmailState(nextEmail);
    setNotificationsState(normalized);

    if (user?.email) {
      try {
        const res = await fetch("/api/auth", {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            email: user.email,
            contactEmail: nextEmail || user.email,
            notifications: normalized,
          }),
        });
        if (res.ok) {
          const updatedUser: UserProfile = {
            ...user,
            contactEmail: nextEmail || user.email,
            notifications: normalized,
          };
          setUserState(updatedUser);
          localStorage.setItem("docksidekeep-user", JSON.stringify(updatedUser));
        }
      } catch {
        // local state updated
      }
    }
    return true;
  };

  const setBillingAddress = (addr: Address) => {
    const normalized: Address = normalizeAddress(addr, {
      billingCountry: billingAddress.CountryCodeAlpha3,
      shippingCountry: deliveryAddress.CountryCodeAlpha3,
      defaultId: "billing-default",
      defaultNickname: addr.nickname || "Billing (Default Shipping)",
    });
    setBillingAddressState(normalized);
    localStorage.setItem(
      "docksidekeep-billing-address",
      JSON.stringify(normalized)
    );
  };

  const saveBillingAddress = async (addr: Address): Promise<boolean> => {
    const normalized: Address = normalizeAddress(addr, {
      billingCountry: billingAddress.CountryCodeAlpha3,
      shippingCountry: deliveryAddress.CountryCodeAlpha3,
      defaultId: "billing-default",
      defaultNickname: addr.nickname || "Billing (Default Shipping)",
    });
    setBillingAddress(normalized);
    // Billing address is also the default shipping address
    const asDelivery: DeliveryAddress = normalizeDeliveryAddress(normalized, {
      billingCountry: normalized.CountryCodeAlpha3,
      defaultId: "billing-default",
      defaultNickname: normalized.nickname || "Billing (Default Shipping)",
    });
    setDeliveryAddressState(asDelivery);
    localStorage.setItem("docksidekeep-address", JSON.stringify(asDelivery));

    if (user?.email) {
      try {
        const res = await fetch("/api/auth", {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            email: user.email,
            billingAddress: normalized,
            deliveryAddress: asDelivery,
          }),
        });
        if (res.ok) {
          const updatedUser: UserProfile = {
            ...user,
            billingAddress: normalized,
            deliveryAddress: asDelivery,
          };
          setUserState(updatedUser);
          localStorage.setItem("docksidekeep-user", JSON.stringify(updatedUser));
        }
      } catch {
        // local storage saved
      }
    }
    return true;
  };

  const setDeliveryAddress = (addr: DeliveryAddress) => {
    const normalized = normalizeDeliveryAddress(addr, {
      billingCountry: billingAddress.CountryCodeAlpha3,
      shippingCountry: deliveryAddress.CountryCodeAlpha3,
    });
    setDeliveryAddressState(normalized);
    localStorage.setItem("docksidekeep-address", JSON.stringify(normalized));
  };

  const saveAddressesList = async (
    list: DeliveryAddress[]
  ): Promise<boolean> => {
    const normalizedList = list.map((a, idx) =>
      normalizeDeliveryAddress(a, {
        billingCountry: billingAddress.CountryCodeAlpha3,
        shippingCountry: deliveryAddress.CountryCodeAlpha3,
        defaultId: a.id || `addr-${idx + 1}`,
      })
    );
    setSavedAddressesState(normalizedList);
    localStorage.setItem(
      "docksidekeep-addresses-list",
      JSON.stringify(normalizedList)
    );
    const primary: DeliveryAddress = billingAddress.StreetName
      ? normalizeDeliveryAddress(billingAddress, {
          billingCountry: billingAddress.CountryCodeAlpha3,
        })
      : normalizedList[0] || EMPTY_ADDRESS;
    setDeliveryAddress(primary);

    if (user?.email) {
      try {
        const res = await fetch("/api/auth", {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            email: user.email,
            deliveryAddress: primary,
            savedAddresses: normalizedList,
          }),
        });
        if (res.ok) {
          const updatedUser = {
            ...user,
            deliveryAddress: primary,
            savedAddresses: normalizedList,
          };
          setUserState(updatedUser);
          localStorage.setItem("docksidekeep-user", JSON.stringify(updatedUser));
        }
      } catch {
        // local storage saved
      }
    }
    return true;
  };

  const saveDeliveryAddress = async (
    addr: DeliveryAddress
  ): Promise<boolean> => {
    const withId: DeliveryAddress = normalizeDeliveryAddress(addr, {
      billingCountry: billingAddress.CountryCodeAlpha3,
      shippingCountry: deliveryAddress.CountryCodeAlpha3,
      defaultId: addr.id || `addr-${Date.now()}`,
      defaultNickname: addr.nickname || "Home",
    });
    setDeliveryAddress(withId);

    // If user hasn't set a billing address yet, initialize billing address as well
    if (!billingAddress.StreetName && withId.StreetName) {
      setBillingAddress(
        normalizeAddress(withId, {
          billingCountry: withId.CountryCodeAlpha3,
          defaultId: "billing-default",
          defaultNickname: "Billing (Default Shipping)",
        })
      );
    }

    const existingIdx = savedAddresses.findIndex(
      (a) =>
        (a.id && a.id === withId.id) ||
        (a.nickname &&
          a.nickname.toLowerCase() === (withId.nickname || "").toLowerCase())
    );
    const nextList =
      existingIdx >= 0
        ? savedAddresses.map((a, idx) => (idx === existingIdx ? withId : a))
        : [...savedAddresses, withId];

    return saveAddressesList(nextList);
  };

  const setPaymentMethod = (pm: PaymentMethod) => {
    setPaymentMethodState(pm);
    localStorage.setItem("docksidekeep-payment", JSON.stringify(pm));
  };

  const savePaymentMethodsList = async (
    list: PaymentMethod[]
  ): Promise<boolean> => {
    setSavedPaymentMethodsState(list);
    localStorage.setItem("docksidekeep-payments-list", JSON.stringify(list));
    const primary = list[0] || DEFAULT_PAYMENT;
    setPaymentMethod(primary);

    if (user?.email) {
      try {
        const res = await fetch("/api/auth", {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            email: user.email,
            paymentMethod: primary,
            savedPaymentMethods: list,
          }),
        });
        if (res.ok) {
          const updatedUser = {
            ...user,
            paymentMethod: primary,
            savedPaymentMethods: list,
          };
          setUserState(updatedUser);
          localStorage.setItem("docksidekeep-user", JSON.stringify(updatedUser));
        }
      } catch {
        // local storage saved
      }
    }
    return true;
  };

  const savePaymentMethod = async (pm: PaymentMethod): Promise<boolean> => {
    const withId: PaymentMethod = {
      ...pm,
      id: pm.id || `pm-${Date.now()}`,
      nickname: pm.nickname || pm.type,
    };
    setPaymentMethod(withId);

    const existingIdx = savedPaymentMethods.findIndex(
      (p) => (p.id && p.id === withId.id) || p.detail === withId.detail
    );
    const nextList =
      existingIdx >= 0
        ? savedPaymentMethods.map((p, idx) =>
            idx === existingIdx ? withId : p
          )
        : [...savedPaymentMethods, withId];

    return savePaymentMethodsList(nextList);
  };

  const setGamingAccounts = (ga: GamingAccounts) => {
    setGamingAccountsState(ga);
    localStorage.setItem("docksidekeep-gaming-accounts", JSON.stringify(ga));
  };

  const saveGamingAccounts = async (ga: GamingAccounts): Promise<boolean> => {
    setGamingAccounts(ga);
    if (user?.email) {
      try {
        const res = await fetch("/api/auth", {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            email: user.email,
            gamingAccounts: ga,
          }),
        });
        if (res.ok) {
          const updatedUser = { ...user, gamingAccounts: ga };
          setUserState(updatedUser);
          localStorage.setItem("docksidekeep-user", JSON.stringify(updatedUser));
        }
      } catch {
        // local storage already saved
      }
    }
    return true;
  };

  const saveLinkedProviders = async (
    providers: LinkedProvider[]
  ): Promise<boolean> => {
    if (user?.email) {
      try {
        const res = await fetch("/api/auth", {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            email: user.email,
            linkedProviders: providers,
          }),
        });
        if (res.ok) {
          const updatedUser = { ...user, linkedProviders: providers };
          setUserState(updatedUser);
          localStorage.setItem("docksidekeep-user", JSON.stringify(updatedUser));
        }
      } catch {
        // ignore
      }
    }
    return true;
  };

  const saveUserPreferences = async (prefs: UserPreferences): Promise<void> => {
    localStorage.setItem("docksidekeep-locale", prefs.locale);
    localStorage.setItem("docksidekeep-theme", prefs.theme);
    if (user?.email) {
      try {
        await fetch("/api/auth", {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            email: user.email,
            preferences: prefs,
          }),
        });
        const updatedUser = { ...user, preferences: prefs };
        setUserState(updatedUser);
        localStorage.setItem("docksidekeep-user", JSON.stringify(updatedUser));
      } catch {
        // ignore network failure
      }
    }
  };

  const addToCart = (item: StoreItem) => {
    const effectiveMoney = getEffectiveItemMoney(item);
    const itemMoney = normalizeMoney(effectiveMoney, "ILS");
    const existing = items.find((i) => i.slug === item.slug);
    if (existing) {
      saveCart(
        items.map((i) =>
          i.slug === item.slug ? { ...i, quantity: i.quantity + 1 } : i
        )
      );
    } else {
      saveCart([
        ...items,
        {
          slug: item.slug,
          title: item.title,
          title_he: item.title_he,
          money: itemMoney,
          category: item.category,
          type: item.type,
          quantity: 1,
        },
      ]);
    }
    setIsOpen(true);
  };

  const removeFromCart = (slug: string) => {
    saveCart(items.filter((i) => i.slug !== slug));
  };

  const clearCart = () => {
    saveCart([]);
  };

  const currencyId = items[0]?.money?.currencyId || "ILS";
  const subtotalPrice = items.reduce(
    (sum, i) => sum + i.money.price * i.quantity,
    0
  );
  const discountPercent = loyalty?.discountPercent || 0;
  const discountedSubtotalPrice = Number(
    (subtotalPrice * (1 - discountPercent / 100)).toFixed(2)
  );
  const deliveryCostPrice =
    items.length > 0 ? Number(selectedDeliveryOption?.cost?.price ?? 0) : 0;
  const preFeeTotalPrice = Number(
    (discountedSubtotalPrice + deliveryCostPrice).toFixed(2)
  );
  const activePaymentMethods = paymentMethodsConfig.filter((m) => m.active);
  const activeCountries = supportedCountries.filter((c) => c.active);
  const calculateFeeForPaymentType = (type: PaymentMethodType): Money => {
    if (items.length === 0) {
      return { price: 0, currencyId };
    }
    const cfg = paymentMethodsConfig.find((m) => m.type === type);
    return calculatePaymentMethodFee(preFeeTotalPrice, cfg, currencyId);
  };
  const paymentFeeMoney = calculateFeeForPaymentType(paymentMethod.type);
  const finalTotalPrice = Number(
    (preFeeTotalPrice + paymentFeeMoney.price).toFixed(2)
  );

  const subtotalMoney: Money = { price: subtotalPrice, currencyId };
  const discountedSubtotalMoney: Money = {
    price: discountedSubtotalPrice,
    currencyId,
  };
  const totalMoney: Money = { price: finalTotalPrice, currencyId };
  const totalCount = items.reduce((sum, i) => sum + i.quantity, 0);

  return (
    <CartContext.Provider
      value={{
        items,
        isOpen,
        setIsOpen,
        addToCart,
        removeFromCart,
        clearCart,
        subtotalMoney,
        discountPercent,
        discountedSubtotalMoney,
        deliveryOptions,
        selectedDeliveryOption,
        setSelectedDeliveryOption,
        refreshDeliveryOptions,
        paymentMethodsConfig,
        activePaymentMethods,
        supportedCountries,
        activeCountries,
        paymentFeeMoney,
        calculateFeeForPaymentType,
        totalMoney,
        totalCount,
        loyalty,
        refreshLoyalty,
        authHydrated,
        user,
        setUser,
        contactEmail,
        setContactEmail,
        notifications,
        setNotifications,
        saveNotificationsAndEmail,
        billingAddress,
        setBillingAddress,
        saveBillingAddress,
        savedAddresses,
        saveAddressesList,
        deliveryAddress,
        setDeliveryAddress,
        saveDeliveryAddress,
        savedPaymentMethods,
        savePaymentMethodsList,
        paymentMethod,
        setPaymentMethod,
        savePaymentMethod,
        gamingAccounts,
        setGamingAccounts,
        saveGamingAccounts,
        saveLinkedProviders,
        saveUserPreferences,
      }}
    >
      {children}
    </CartContext.Provider>
  );
}

export function useCart() {
  const ctx = useContext(CartContext);
  if (!ctx) throw new Error("useCart must be used inside CartProvider");
  return ctx;
}
