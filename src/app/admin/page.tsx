"use client";

import React, { Suspense, useEffect, useState } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import { useForm, useWatch } from "react-hook-form";
import {
  ShieldAlert,
  Plus,
  Trash2,
  XCircle,
  CheckCircle2,
  Package,
  ShoppingBag,
  LogOut,
  Users,
  Eye,
  EyeOff,
  Save,
  Calendar,
  Settings,
  Edit3,
  Crown,
  Image as ImageIcon,
  Lock,
  Upload,
  Download,
  AlertTriangle,
  Truck,
  CreditCard,
} from "lucide-react";
import { Facebook } from "@/components/ui/brand-icons";
import type { StoreItem } from "@/lib/mongodb";
import { formatMoney, type Money } from "@/lib/money";
import {
  canStoreCancelOrder,
  DEFAULT_DELIVERY_OPTIONS,
  DEFAULT_PAYMENT_METHODS_CONFIG,
  DEFAULT_SUPPORTED_COUNTRIES,
  formatExpectedDeliveryDate,
  normalizeDeliveryOptions,
  normalizeOrderStatus,
  normalizePaymentMethodsConfig,
  normalizeSupportedCountries,
  ORDER_LIFECYCLE_STEPS,
  type DeliveryOption,
  type PaymentMethodConfig,
  type PremiumClass,
  type SupportedCountryConfig,
  type SaleStage,
} from "@/lib/premium";
import { useLanguage } from "@/context/LanguageContext";
import {
  formatAddressOneLine,
  formatPhone,
  normalizeCountryCodeAlpha3,
  type DeliveryAddress,
} from "@/lib/address";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { FormattedName } from "@/components/ui/name-fields";
import type { Name } from "@/lib/name";
import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
} from "@/components/ui/card";

interface AdminOrder {
  _id: string;
  items: { slug: string; title: string; quantity: number; money: Money }[];
  totalMoney: Money;
  customer?: { name: Name | string; email: string; contactEmail?: string };
  deliveryOption?: {
    id: string;
    label: string;
    cost: Money;
    estimatedDays?: number;
    expectedDeliveryAtUtc?: string;
  };
  expectedDeliveryAtUtc?: string;
  deliveryAddress?: DeliveryAddress;
  paymentMethod?: { type: string; detail: string };
  gamingAccounts?: { wizardsAccount?: string; riotAccount?: string };
  status: string;
  createdAt: string;
}

type AdminPageTab = "inventory" | "events" | "metadata";

function AdminPortalContent() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const { t } = useLanguage();
  const pageParam = searchParams.get("page") as AdminPageTab | null;

  const [activePage, setActivePage] = useState<AdminPageTab>("inventory");
  const [adminToken, setAdminToken] = useState<string | null>(null);
  const adminLoginForm = useForm<{ username: string; password: string }>({
    defaultValues: { username: "", password: "" },
  });
  const username =
    useWatch({ control: adminLoginForm.control, name: "username" }) || "";
  const adminActionForm = useForm();
  const [loginError, setLoginError] = useState<string | null>(null);

  const [items, setItems] = useState<StoreItem[]>([]);
  const [events, setEvents] = useState<StoreItem[]>([]);
  const [orders, setOrders] = useState<AdminOrder[]>([]);
  const [qtyDrafts, setQtyDrafts] = useState<Record<string, string>>({});
  const [editingSlug, setEditingSlug] = useState<string | null>(null);
  const [editDraft, setEditDraft] = useState<Record<string, any>>({});

  // CSV Upload state (Page 1: Inventory)
  const [csvText, setCsvText] = useState("");
  const [csvStatusMsg, setCsvStatusMsg] = useState<string | null>(null);

  // Store Item form state (Page 1: Inventory)
  const [newTitle, setNewTitle] = useState("");
  const [newTitleHe, setNewTitleHe] = useState("");
  const [newSlug, setNewSlug] = useState("");
  const [newPrice, setNewPrice] = useState("150");
  const [newPreOrderPrice, setNewPreOrderPrice] = useState("");
  const [newCurrencyId, setNewCurrencyId] = useState("ILS");
  const [newQuantity, setNewQuantity] = useState("5");
  const [newImageUrl, setNewImageUrl] = useState("");
  const [newDescription, setNewDescription] = useState("");
  const [newIsHidden, setNewIsHidden] = useState(false);
  const [newWontBeStocked, setNewWontBeStocked] = useState(false);
  const [newLifecycleStage, setNewLifecycleStage] = useState<string>("");
  const [newRevealAtUtc, setNewRevealAtUtc] = useState("");
  const [newPreOrderAtUtc, setNewPreOrderAtUtc] = useState("");
  const [newComingSoonAtUtc, setNewComingSoonAtUtc] = useState("");
  const [newRegularSaleAtUtc, setNewRegularSaleAtUtc] = useState("");

  // Event form state (Page 2: Events)
  const [evSlug, setEvSlug] = useState("");
  const [evTitle, setEvTitle] = useState("");
  const [evTitleHe, setEvTitleHe] = useState("");
  const [evPrice, setEvPrice] = useState("60");
  const [evCurrencyId, setEvCurrencyId] = useState("ILS");
  const [evQuantity, setEvQuantity] = useState("16");
  const [evImageUrl, setEvImageUrl] = useState("");
  const [evDescription, setEvDescription] = useState("");
  const [evFacebookUrl, setEvFacebookUrl] = useState("");
  const [evDate, setEvDate] = useState("");
  const [evVenue, setEvVenue] = useState("");
  const [evMinPlayers, setEvMinPlayers] = useState("");
  const [evMaxPlayers, setEvMaxPlayers] = useState("16");
  const [evShowRegistered, setEvShowRegistered] = useState(true);
  const [downloadedCsvPreview, setDownloadedCsvPreview] = useState<
    Record<string, string>
  >({});

  // Store Metadata & Delivery Options & Loyalty state (Page 3: Metadata)
  const [metaPhone, setMetaPhone] = useState("053-774-6837");
  const [metaEmail, setMetaEmail] = useState("israelttgcenter@gmail.com");
  const [metaAddress, setMetaAddress] = useState(
    "הרץ 3, Haifa, Israel, 3223201"
  );
  const [metaHours, setMetaHours] = useState("");
  const [metaHoursHe, setMetaHoursHe] = useState("");
  const [deliveryOptions, setDeliveryOptions] = useState<DeliveryOption[]>(() =>
    normalizeDeliveryOptions(DEFAULT_DELIVERY_OPTIONS)
  );
  const [paymentMethodsConfig, setPaymentMethodsConfig] = useState<
    PaymentMethodConfig[]
  >(DEFAULT_PAYMENT_METHODS_CONFIG);
  const [supportedCountries, setSupportedCountries] = useState<
    SupportedCountryConfig[]
  >(DEFAULT_SUPPORTED_COUNTRIES);
  const [newCountryCode, setNewCountryCode] = useState("");
  const [newCountryName, setNewCountryName] = useState("");
  const [newCountryNameHe, setNewCountryNameHe] = useState("");
  const [newCountrySupportsZip, setNewCountrySupportsZip] = useState(true);
  const deliveryOptionForm = useForm<{
    id: string;
    label: string;
    labelHe: string;
    price: string;
    estimatedDays: string;
    isStorePickup: boolean;
  }>({
    defaultValues: {
      id: "",
      label: "",
      labelHe: "",
      price: "25",
      estimatedDays: "3",
      isStorePickup: false,
    },
  });
  const [deliverySaved, setDeliverySaved] = useState(false);
  const [metaSaved, setMetaSaved] = useState(false);

  const [premiumClasses, setPremiumClasses] = useState<PremiumClass[]>([]);
  const [clsId, setClsId] = useState("");
  const [clsName, setClsName] = useState("");
  const [clsNameHe, setClsNameHe] = useState("");
  const [clsDiscount, setClsDiscount] = useState("10");
  const [clsReachable, setClsReachable] = useState(true);
  const [clsMinPoints, setClsMinPoints] = useState("200");

  const [assignEmail, setAssignEmail] = useState("");
  const [assignClassId, setAssignClassId] = useState("");
  const [assignSaved, setAssignSaved] = useState(false);

  // Blog Posts state (Admin-only creation & deletion)
  const [blogPosts, setBlogPosts] = useState<any[]>([]);
  const [blogSlug, setBlogSlug] = useState("");
  const [blogTitle, setBlogTitle] = useState("");
  const [blogTitleHe, setBlogTitleHe] = useState("");
  const [blogContent, setBlogContent] = useState("");
  const [blogContentHe, setBlogContentHe] = useState("");
  const [blogImageUrl, setBlogImageUrl] = useState("");
  const [blogSavedMsg, setBlogSavedMsg] = useState<string | null>(null);

  // Admin Hierarchy (Owner + Sub-Admins) & Immutable Audit Logs state
  const [currentAdmin, setCurrentAdmin] = useState<{
    username: string;
    role: string;
    level: number;
    privileges: string[];
  } | null>(null);
  const [adminsList, setAdminsList] = useState<any[]>([]);
  const [auditLogs, setAuditLogs] = useState<any[]>([]);
  const [auditFilterType, setAuditFilterType] = useState<string>("all");
  const [auditSearchQuery, setAuditSearchQuery] = useState<string>("");

  const [subAdminUsername, setSubAdminUsername] = useState("");
  const [subAdminPassword, setSubAdminPassword] = useState("");
  const [subAdminRole, setSubAdminRole] = useState("editor");
  const [subAdminPrivs, setSubAdminPrivs] = useState<Record<string, boolean>>({
    inventory: true,
    events: true,
    metadata: false,
    blog: true,
  });
  const [subAdminSavedMsg, setSubAdminSavedMsg] = useState<string | null>(null);
  const [subAdminErrorMsg, setSubAdminErrorMsg] = useState<string | null>(null);
  const [otelSnapshot, setOtelSnapshot] = useState<any | null>(null);

  useEffect(() => {
    if (
      pageParam === "inventory" ||
      pageParam === "events" ||
      pageParam === "metadata"
    ) {
      setActivePage(pageParam);
    }
  }, [pageParam]);

  useEffect(() => {
    const saved = sessionStorage.getItem("dockside-admin-token");
    if (saved) {
      setAdminToken(saved);
    }
  }, []);

  const switchPage = (tab: AdminPageTab) => {
    setActivePage(tab);
    router.replace(`/admin?page=${tab}`);
  };

  const loadDashboardData = async () => {
    const authHeaders: Record<string, string> = adminToken
      ? { "x-admin-token": adminToken }
      : {};
    const [
      itemsRes,
      eventsRes,
      ordersRes,
      metaRes,
      premRes,
      blogRes,
      adminRes,
      otelRes,
    ] = await Promise.all([
      fetch("/api/items", { headers: authHeaders }),
      fetch("/api/events", { headers: authHeaders }),
      fetch("/api/orders", { headers: authHeaders }),
      fetch("/api/metadata"),
      fetch("/api/premium", { headers: authHeaders }),
      fetch("/api/blog"),
      adminToken
        ? fetch("/api/admin", { headers: authHeaders })
        : Promise.resolve(null),
      fetch("/api/telemetry"),
    ]);
    const nextDrafts: Record<string, string> = {};
    if (itemsRes.ok) {
      const data = await itemsRes.json();
      const loadedItems: StoreItem[] = data.items || [];
      setItems(loadedItems);
      for (const it of loadedItems) {
        nextDrafts[it.slug] = String(it.quantity ?? 0);
      }
    }
    if (eventsRes.ok) {
      const data = await eventsRes.json();
      const loadedEvents: StoreItem[] = data.events || data.items || [];
      setEvents(loadedEvents);
      for (const ev of loadedEvents) {
        nextDrafts[ev.slug] = String(ev.quantity ?? 0);
      }
    }
    if (Object.keys(nextDrafts).length > 0) {
      setQtyDrafts((prev) => ({ ...prev, ...nextDrafts }));
    }
    if (ordersRes.ok) {
      const data = await ordersRes.json();
      setOrders(data.orders || []);
    }
    if (metaRes.ok) {
      const data = await metaRes.json();
      if (data.metadata) {
        setMetaPhone(
          typeof data.metadata.phone === "object" && data.metadata.phone
            ? data.metadata.phone.PhoneNumber || formatPhone(data.metadata.phone)
            : String(data.metadata.phone || "")
        );
        setMetaEmail(data.metadata.email || "");
        setMetaAddress(
          formatAddressOneLine(data.metadata.address, { includePhone: false })
        );
        setMetaHours(data.metadata.openingHours || "");
        setMetaHoursHe(data.metadata.openingHours_he || "");
        if (Array.isArray(data.metadata.deliveryOptions)) {
          setDeliveryOptions(
            normalizeDeliveryOptions(data.metadata.deliveryOptions)
          );
        }
        if (Array.isArray(data.metadata.paymentMethodsConfig)) {
          setPaymentMethodsConfig(
            normalizePaymentMethodsConfig(data.metadata.paymentMethodsConfig)
          );
        }
        if (Array.isArray(data.metadata.supportedCountries)) {
          setSupportedCountries(
            normalizeSupportedCountries(data.metadata.supportedCountries)
          );
        }
      }
    }
    if (premRes.ok) {
      const data = await premRes.json();
      setPremiumClasses(data.classes || []);
    }
    if (blogRes.ok) {
      const data = await blogRes.json();
      setBlogPosts(data.posts || []);
    }
    if (adminRes && adminRes.ok) {
      const data = await adminRes.json();
      if (data.currentAdmin) setCurrentAdmin(data.currentAdmin);
      if (Array.isArray(data.admins)) setAdminsList(data.admins);
      if (Array.isArray(data.auditLogs)) setAuditLogs(data.auditLogs);
    }
    if (otelRes && otelRes.ok) {
      const data = await otelRes.json();
      setOtelSnapshot(data);
    }
  };

  useEffect(() => {
    if (adminToken) {
      loadDashboardData();
    }
  }, [adminToken]);

  const handleAdminLogin = adminLoginForm.handleSubmit(async (values) => {
    setLoginError(null);
    const res = await fetch("/api/admin", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        username: values.username,
        password: values.password,
      }),
    });
    const data = await res.json();
    if (!res.ok) {
      setLoginError(data.error || "Invalid admin credentials");
      return;
    }
    sessionStorage.setItem("dockside-admin-token", data.adminToken);
    if (data.admin) {
      setCurrentAdmin(data.admin);
    }
    setAdminToken(data.adminToken);
  });

  const handleAdminAuth0Sso = async () => {
    setLoginError(null);
    const res = await fetch("/api/admin", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        mode: "auth0-sso",
        username: username.trim() || "admin",
        auth0Token: "auth0-admin-sso-session",
      }),
    });
    const data = await res.json();
    if (!res.ok) {
      setLoginError(data.error || "Auth0 admin authentication failed");
      return;
    }
    sessionStorage.setItem("dockside-admin-token", data.adminToken);
    if (data.admin) {
      setCurrentAdmin(data.admin);
    }
    setAdminToken(data.adminToken);
  };

  const handleImageFileUpload = (
    e: React.ChangeEvent<HTMLInputElement>,
    setter: (url: string) => void
  ) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === "string") {
        setter(reader.result);
      }
    };
    reader.readAsDataURL(file);
  };

  const handleCsvFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === "string") {
        setCsvText(reader.result);
      }
    };
    reader.readAsText(file);
  };

  const handleImportCsv = adminActionForm.handleSubmit(async () => {
    if (!adminToken || !csvText.trim()) return;
    setCsvStatusMsg(null);
    const res = await fetch("/api/items", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-admin-token": adminToken,
      },
      body: JSON.stringify({ csvText }),
    });
    if (res.ok) {
      const data = await res.json();
      setCsvStatusMsg(`Imported ${data.importedCount || 0} items from CSV!`);
      setCsvText("");
      await loadDashboardData();
    }
  });

  const handleDownloadEventParticipants = async (slug: string) => {
    const res = await fetch(
      `/api/orders?eventSlug=${encodeURIComponent(slug)}&format=csv`,
      {
        headers: adminToken ? { "x-admin-token": adminToken } : {},
      }
    );
    if (!res.ok) return;
    const csvContent = await res.text();
    setDownloadedCsvPreview((prev) => ({ ...prev, [slug]: csvContent }));

    try {
      const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `participants-${slug}.csv`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch {
      // ignore in headless environments where blob download may be intercepted
    }
  };

  const handleAddStoreItem = adminActionForm.handleSubmit(async () => {
    if (!adminToken || !newTitle || !newSlug) return;
    const parsedQty = Math.max(0, Number(newQuantity || 0));

    const res = await fetch("/api/items", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-admin-token": adminToken,
      },
      body: JSON.stringify({
        slug: newSlug,
        kind: "item",
        category: "Store Items",
        title: newTitle,
        title_he: newTitleHe || newTitle,
        money: { price: Number(newPrice), currencyId: newCurrencyId },
        preOrderMoney:
          newPreOrderPrice.trim() !== "" && Number(newPreOrderPrice) > 0
            ? { price: Number(newPreOrderPrice), currencyId: newCurrencyId }
            : null,
        quantity: parsedQty,
        imageUrl: newImageUrl.trim(),
        description: newDescription,
        description_he: newDescription,
        inStock: parsedQty > 0,
        isHidden: newIsHidden,
        wontBeStocked: newWontBeStocked,
        lifecycleStage: newLifecycleStage || null,
        revealAtUtc: newRevealAtUtc || null,
        preOrderAtUtc: newPreOrderAtUtc || null,
        comingSoonAtUtc: newComingSoonAtUtc || null,
        regularSaleAtUtc: newRegularSaleAtUtc || null,
      }),
    });

    if (res.ok) {
      await loadDashboardData();
      setNewTitle("");
      setNewTitleHe("");
      setNewSlug("");
      setNewPreOrderPrice("");
      setNewImageUrl("");
      setNewDescription("");
      setNewIsHidden(false);
      setNewWontBeStocked(false);
      setNewLifecycleStage("");
      setNewRevealAtUtc("");
      setNewPreOrderAtUtc("");
      setNewComingSoonAtUtc("");
      setNewRegularSaleAtUtc("");
    }
  });

  const handleCreateEvent = adminActionForm.handleSubmit(async () => {
    if (!adminToken || !evTitle || !evSlug) return;
    const parsedQty = Math.max(0, Number(evQuantity || 1));
    const parsedMax = evMaxPlayers
      ? Math.max(1, Number(evMaxPlayers))
      : parsedQty;
    const parsedMin =
      evMinPlayers.trim() !== "" && Number(evMinPlayers) > 0
        ? Number(evMinPlayers)
        : null;

    const res = await fetch("/api/events", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-admin-token": adminToken,
      },
      body: JSON.stringify({
        slug: evSlug,
        kind: "event",
        category: "Event Tickets",
        title: evTitle,
        title_he: evTitleHe || evTitle,
        money: { price: Number(evPrice), currencyId: evCurrencyId },
        quantity: parsedQty,
        imageUrl: evImageUrl.trim(),
        description: evDescription,
        description_he: evDescription,
        inStock: parsedQty > 0,
        facebookUrl: evFacebookUrl.trim(),
        eventDate: evDate.trim(),
        venue: evVenue.trim(),
        showRegisteredCount: evShowRegistered,
        minPlayers: parsedMin,
        maxPlayers: parsedMax,
      }),
    });

    if (res.ok) {
      await loadDashboardData();
      setEvSlug("");
      setEvTitle("");
      setEvTitleHe("");
      setEvImageUrl("");
      setEvDescription("");
      setEvFacebookUrl("");
      setEvDate("");
      setEvVenue("");
      setEvMinPlayers("");
    }
  });

  const startEditingItem = (item: StoreItem) => {
    setEditingSlug(item.slug);
    setEditDraft({
      price: String(item.money.price),
      preOrderPrice:
        item.preOrderMoney && item.preOrderMoney.price > 0
          ? String(item.preOrderMoney.price)
          : "",
      currencyId: item.money.currencyId,
      quantity: String(item.quantity ?? 0),
      imageUrl: item.imageUrl || "",
      description: item.description || "",
      isHidden: Boolean(item.isHidden),
      wontBeStocked: Boolean(item.wontBeStocked),
      lifecycleStage: item.lifecycleStage || "",
      revealAtUtc: item.revealAtUtc || "",
      preOrderAtUtc: item.preOrderAtUtc || "",
      comingSoonAtUtc: item.comingSoonAtUtc || "",
      regularSaleAtUtc: item.regularSaleAtUtc || "",
    });
  };

  const handleSaveItemEdit = async (slug: string) => {
    if (!adminToken) return;
    await fetch("/api/items", {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
        "x-admin-token": adminToken,
      },
      body: JSON.stringify({
        slug,
        money: {
          price: Number(editDraft.price),
          currencyId: editDraft.currencyId || "ILS",
        },
        preOrderMoney:
          editDraft.preOrderPrice &&
          String(editDraft.preOrderPrice).trim() !== "" &&
          Number(editDraft.preOrderPrice) > 0
            ? {
                price: Number(editDraft.preOrderPrice),
                currencyId: editDraft.currencyId || "ILS",
              }
            : null,
        quantity: Math.max(0, Number(editDraft.quantity)),
        imageUrl: editDraft.imageUrl,
        description: editDraft.description,
        description_he: editDraft.description,
        isHidden: Boolean(editDraft.isHidden),
        wontBeStocked: Boolean(editDraft.wontBeStocked),
        lifecycleStage: editDraft.lifecycleStage || null,
        revealAtUtc: editDraft.revealAtUtc || null,
        preOrderAtUtc: editDraft.preOrderAtUtc || null,
        comingSoonAtUtc: editDraft.comingSoonAtUtc || null,
        regularSaleAtUtc: editDraft.regularSaleAtUtc || null,
      }),
    });
    setEditingSlug(null);
    await loadDashboardData();
  };

  const handleChangeItemStage = async (item: StoreItem, nextStage: SaleStage) => {
    if (!adminToken) return;
    await fetch("/api/items", {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
        "x-admin-token": adminToken,
      },
      body: JSON.stringify({
        slug: item.slug,
        lifecycleStage: nextStage,
        isHidden: nextStage === "hidden",
        wontBeStocked:
          nextStage === "wont-be-stocked" ? true : item.wontBeStocked,
        inStock:
          nextStage === "out-of-stock" || nextStage === "wont-be-stocked"
            ? false
            : nextStage === "regular" || nextStage === "pre-order"
            ? true
            : item.inStock,
        quantity:
          nextStage === "out-of-stock" || nextStage === "wont-be-stocked"
            ? 0
            : (nextStage === "regular" || nextStage === "pre-order") &&
              (item.quantity ?? 0) <= 0
            ? 1
            : item.quantity,
      }),
    });
    await loadDashboardData();
  };

  const handleToggleWontBeStocked = async (item: StoreItem) => {
    if (!adminToken) return;
    const nextWontBeStocked = !item.wontBeStocked;
    await fetch("/api/items", {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
        "x-admin-token": adminToken,
      },
      body: JSON.stringify({
        slug: item.slug,
        wontBeStocked: nextWontBeStocked,
        lifecycleStage:
          (item.quantity ?? 0) <= 0 || !item.inStock
            ? nextWontBeStocked
              ? "wont-be-stocked"
              : "out-of-stock"
            : item.lifecycleStage || "regular",
      }),
    });
    await loadDashboardData();
  };

  const handleRemoveItem = async (slug: string, isEvent = false) => {
    if (!adminToken) return;
    const endpoint = isEvent ? "/api/events" : "/api/items";
    await fetch(`${endpoint}?slug=${encodeURIComponent(slug)}`, {
      method: "DELETE",
      headers: { "x-admin-token": adminToken },
    });
    await loadDashboardData();
  };

  const handleUpdateQuantity = async (slug: string, isEvent = false) => {
    if (!adminToken) return;
    const nextQty = Math.max(0, Number(qtyDrafts[slug] ?? 0));
    const endpoint = isEvent ? "/api/events" : "/api/items";
    await fetch(endpoint, {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
        "x-admin-token": adminToken,
      },
      body: JSON.stringify({
        slug,
        quantity: nextQty,
      }),
    });
    await loadDashboardData();
  };

  const handleToggleStock = async (item: StoreItem) => {
    if (!adminToken) return;
    await fetch("/api/items", {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
        "x-admin-token": adminToken,
      },
      body: JSON.stringify({
        slug: item.slug,
        inStock: !item.inStock,
        lifecycleStage: item.inStock
          ? item.wontBeStocked
            ? "wont-be-stocked"
            : "out-of-stock"
          : "regular",
      }),
    });
    await loadDashboardData();
  };

  const handleToggleShowRegistered = async (item: StoreItem) => {
    if (!adminToken) return;
    await fetch("/api/events", {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
        "x-admin-token": adminToken,
      },
      body: JSON.stringify({
        slug: item.slug,
        showRegisteredCount: !item.showRegisteredCount,
      }),
    });
    await loadDashboardData();
  };

  const handleOrderStatus = async (orderId: string, status: string) => {
    if (!adminToken) return;
    await fetch("/api/orders", {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
        "x-admin-token": adminToken,
      },
      body: JSON.stringify({ orderId, status }),
    });
    await loadDashboardData();
  };

  const handleAddDeliveryOption = () => {
    const vals = deliveryOptionForm.getValues();
    if (!vals.id.trim() || !vals.label.trim()) return;
    const isPickup = Boolean(vals.isStorePickup);
    const estDays = Math.max(
      0,
      Math.floor(Number(vals.estimatedDays ?? (isPickup ? 0 : 3)))
    );
    const nextOpt: DeliveryOption = {
      id: vals.id.trim(),
      label: vals.label.trim(),
      label_he: vals.labelHe.trim() || vals.label.trim(),
      cost: {
        price: Math.max(0, Number(vals.price || 0)),
        currencyId: "ILS",
      },
      isStorePickup: isPickup,
      active: true,
      estimatedDays: estDays,
    };
    const filtered = deliveryOptions.filter((o) => o.id !== nextOpt.id);
    setDeliveryOptions(normalizeDeliveryOptions([...filtered, nextOpt]));
    deliveryOptionForm.reset({
      id: "",
      label: "",
      labelHe: "",
      price: "25",
      estimatedDays: "3",
      isStorePickup: false,
    });
  };

  const handleRemoveDeliveryOption = (id: string) => {
    if (deliveryOptions.length <= 1) return;
    const next = deliveryOptions.filter((o) => o.id !== id);
    if (!next.some((o) => o.active !== false) && next[0]) {
      next[0] = { ...next[0], active: true };
    }
    setDeliveryOptions(next);
  };

  const handleAddSupportedCountry = () => {
    const rawCode = newCountryCode.trim().toUpperCase();
    const name = newCountryName.trim();
    if (rawCode.length < 2 || !name) return;
    const code = normalizeCountryCodeAlpha3(rawCode);
    const nextEntry: SupportedCountryConfig = {
      code,
      name,
      name_he: newCountryNameHe.trim() || name,
      active: true,
      supportsZipAutocomplete: Boolean(newCountrySupportsZip),
    };
    const filtered = supportedCountries.filter((c) => c.code !== code);
    setSupportedCountries(
      normalizeSupportedCountries([...filtered, nextEntry])
    );
    setNewCountryCode("");
    setNewCountryName("");
    setNewCountryNameHe("");
    setNewCountrySupportsZip(true);
  };

  const handleSaveDeliveryOptions = async () => {
    if (!adminToken) return;
    const res = await fetch("/api/metadata", {
      method: "PUT",
      headers: {
        "Content-Type": "application/json",
        "x-admin-token": adminToken,
      },
      body: JSON.stringify({
        phone: metaPhone,
        email: metaEmail,
        address: metaAddress,
        openingHours: metaHours,
        openingHours_he: metaHoursHe || metaHours,
        deliveryOptions,
        paymentMethodsConfig,
        supportedCountries,
      }),
    });
    if (res.ok) {
      setDeliverySaved(true);
      setTimeout(() => setDeliverySaved(false), 3000);
      await loadDashboardData();
    }
  };

  const handleSaveMetadata = adminActionForm.handleSubmit(async () => {
    if (!adminToken) return;
    const res = await fetch("/api/metadata", {
      method: "PUT",
      headers: {
        "Content-Type": "application/json",
        "x-admin-token": adminToken,
      },
      body: JSON.stringify({
        phone: metaPhone,
        email: metaEmail,
        address: metaAddress,
        openingHours: metaHours,
        openingHours_he: metaHoursHe || metaHours,
        deliveryOptions,
        paymentMethodsConfig,
        supportedCountries,
      }),
    });
    if (res.ok) {
      setMetaSaved(true);
      setTimeout(() => setMetaSaved(false), 3000);
      await loadDashboardData();
    }
  });

  const handleSavePremiumClass = adminActionForm.handleSubmit(async () => {
    if (!adminToken || !clsId || !clsName) return;
    const res = await fetch("/api/premium", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-admin-token": adminToken,
      },
      body: JSON.stringify({
        id: clsId,
        name: clsName,
        name_he: clsNameHe || clsName,
        discountPercent: Number(clsDiscount),
        isPointsReachable: clsReachable,
        minPoints: clsReachable ? Number(clsMinPoints) : null,
      }),
    });
    if (res.ok) {
      setClsId("");
      setClsName("");
      setClsNameHe("");
      await loadDashboardData();
    }
  });

  const handleDeletePremiumClass = async (id: string) => {
    if (!adminToken) return;
    await fetch(`/api/premium?id=${encodeURIComponent(id)}`, {
      method: "DELETE",
      headers: { "x-admin-token": adminToken },
    });
    await loadDashboardData();
  };

  const handleAssignUserClass = adminActionForm.handleSubmit(async () => {
    if (!adminToken || !assignEmail) return;
    const res = await fetch("/api/premium", {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
        "x-admin-token": adminToken,
      },
      body: JSON.stringify({
        email: assignEmail,
        assignedClassId: assignClassId || null,
      }),
    });
    if (res.ok) {
      setAssignSaved(true);
      setTimeout(() => setAssignSaved(false), 3000);
      await loadDashboardData();
    }
  });

  if (!adminToken) {
    return (
      <section
        aria-labelledby="admin-login-heading"
        className="max-w-md mx-auto px-4 py-16"
      >
        <Card className="p-2">
          <CardHeader>
            <div
              aria-hidden="true"
              className="w-10 h-10 rounded-xl bg-amber-500/15 text-amber-500 flex items-center justify-center mb-2"
            >
              <ShieldAlert className="w-5 h-5" aria-hidden="true" />
            </div>
            <h1
              id="admin-login-heading"
              data-testid="admin-login-title"
              className="text-2xl font-bold leading-none tracking-tight text-slate-900 dark:text-white"
            >
              {t.adminPortal.loginTitle}
            </h1>
            <CardDescription>{t.adminPortal.loginSubtitle}</CardDescription>
          </CardHeader>
          <CardContent>
            {loginError && (
              <div
                role="alert"
                aria-live="assertive"
                className="mb-4 p-3 rounded-xl bg-rose-500/10 border border-rose-500/30 text-rose-500 text-xs font-medium"
              >
                {loginError}
              </div>
            )}
            <div className="mb-4">
              <Button
                type="button"
                variant="outline"
                data-testid="admin-auth0-sso-btn"
                onClick={handleAdminAuth0Sso}
                className="w-full font-bold"
              >
                <Lock className="w-4 h-4 text-amber-500" />
                <span>Sign In with Auth0 (SSO)</span>
              </Button>
            </div>
            <form onSubmit={handleAdminLogin} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold mb-1">
                  {t.adminPortal.usernameLabel}
                </label>
                <Input
                  data-testid="admin-username"
                  placeholder="admin"
                  required
                  {...adminLoginForm.register("username", { required: true })}
                />
              </div>
              <div>
                <label className="block text-xs font-semibold mb-1">
                  {t.adminPortal.passwordLabel}
                </label>
                <Input
                  type="password"
                  data-testid="admin-password"
                  placeholder="••••••••"
                  required
                  {...adminLoginForm.register("password", { required: true })}
                />
              </div>
              <Button
                type="submit"
                data-testid="admin-login-btn"
                className="w-full"
              >
                {t.adminPortal.loginBtn}
              </Button>
            </form>
          </CardContent>
        </Card>
      </section>
    );
  }

  const storeInventoryItems = items;
  const eventItems = events;

  // Backward-compatibility check: find any existing DB items/events missing required fields
  const itemsWithMissingFields = [...items, ...events].filter(
    (i) => Array.isArray(i.missingFields) && i.missingFields.length > 0
  );

  return (
    <div className="max-w-6xl mx-auto px-4 py-10 space-y-8">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <div className="flex flex-wrap items-center gap-3">
            <h1
              data-testid="admin-dashboard-title"
              className="text-3xl font-extrabold text-slate-900 dark:text-white"
            >
              {t.adminPortal.dashboardTitle}
            </h1>
            {currentAdmin && (
              <Badge
                data-testid="admin-current-role-badge"
                variant={currentAdmin.role === "owner" ? "amber" : "default"}
              >
                {currentAdmin.username} • {currentAdmin.role.toUpperCase()}{" "}
                (Level {currentAdmin.level})
              </Badge>
            )}
          </div>
          <p className="text-sm text-slate-500 mt-1">
            {t.adminPortal.dashboardSubtitle}
          </p>
        </div>

        <div className="flex items-center gap-2">
          <Button
            variant={activePage === "inventory" ? "default" : "outline"}
            size="sm"
            data-testid="admin-tab-inventory"
            onClick={() => switchPage("inventory")}
          >
            <Package className="w-4 h-4" />
            <span>
              {t.adminPortal.tabInventory} ({storeInventoryItems.length})
            </span>
          </Button>
          <Button
            variant={activePage === "events" ? "default" : "outline"}
            size="sm"
            data-testid="admin-tab-events"
            onClick={() => switchPage("events")}
          >
            <Calendar className="w-4 h-4" />
            <span>
              {t.adminPortal.tabEvents} ({eventItems.length})
            </span>
          </Button>
          <Button
            variant={activePage === "metadata" ? "default" : "outline"}
            size="sm"
            data-testid="admin-tab-metadata"
            onClick={() => switchPage("metadata")}
          >
            <Settings className="w-4 h-4" />
            <span>{t.adminPortal.tabMetadata}</span>
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => {
              sessionStorage.removeItem("dockside-admin-token");
              setAdminToken(null);
            }}
          >
            <LogOut className="w-4 h-4" />
            <span>{t.adminPortal.signOut}</span>
          </Button>
        </div>
      </div>

      {/* Backward-Compatibility Missing Fields Alert Panel */}
      {itemsWithMissingFields.length > 0 && (
        <div
          data-testid="admin-missing-fields-alert"
          className="p-4 rounded-2xl bg-amber-500/10 border border-amber-500/30 text-amber-700 dark:text-amber-300 space-y-2"
        >
          <div className="flex items-center gap-2 font-bold text-sm">
            <AlertTriangle className="w-5 h-5 text-amber-500 shrink-0" />
            <span>
              Backward-Compatibility Alert: {itemsWithMissingFields.length}{" "}
              record(s) in MongoDB have missing fields that should be updated
            </span>
          </div>
          <ul className="text-xs space-y-1 ps-6 list-disc">
            {itemsWithMissingFields.map((it) => (
              <li
                key={it.slug}
                data-testid={`admin-missing-alert-item-${it.slug}`}
              >
                <strong>{it.title}</strong> (<code>{it.slug}</code>) — Missing:{" "}
                <span className="font-semibold">
                  {(it.missingFields || []).join(", ")}
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* ===================================================================== */}
      {/* PAGE 1: INVENTORY (STORE ITEMS, CSV UPLOAD & ORDERS)                  */}
      {/* ===================================================================== */}
      {activePage === "inventory" && (
        <div data-testid="admin-page-inventory" className="space-y-8">
          {/* Bulk CSV Upload Card */}
          <Card data-testid="admin-csv-upload">
            <CardHeader>
              <CardTitle className="flex items-center justify-between text-lg">
                <span className="flex items-center gap-2">
                  <Upload className="w-5 h-5 text-brand-500" />
                  <span>Bulk CSV Upload for New Inventory Items</span>
                </span>
                {csvStatusMsg && (
                  <span
                    data-testid="admin-csv-status-msg"
                    className="text-xs font-semibold text-emerald-500 flex items-center gap-1"
                  >
                    <CheckCircle2 className="w-4 h-4" />
                    {csvStatusMsg}
                  </span>
                )}
              </CardTitle>
              <CardDescription>
                Upload a CSV file or paste CSV lines in the format:{" "}
                <code>
                  slug,title,title_he,price,currencyId,quantity,description,imageUrl
                </code>
              </CardDescription>
            </CardHeader>
            <CardContent>
              <form onSubmit={handleImportCsv} className="space-y-3">
                <Input
                  type="file"
                  accept=".csv,text/csv"
                  data-testid="admin-csv-file-input"
                  onChange={handleCsvFileUpload}
                />
                <textarea
                  data-testid="admin-csv-textarea"
                  value={csvText}
                  onChange={(e) => setCsvText(e.target.value)}
                  rows={3}
                  placeholder={
                    "slug,title,title_he,price,currencyId,quantity,description,imageUrl\ncatan-seafarers,Catan Seafarers,קטאן יורדי הים,190,ILS,8,Expansion for Catan,https://images.unsplash.com/photo-1610890716171-6b1bb98ffd09?w=600"
                  }
                  className="w-full rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-3 text-xs font-mono"
                />
                <Button type="submit" data-testid="admin-csv-import-btn">
                  <Upload className="w-4 h-4" />
                  <span>Import CSV Items</span>
                </Button>
              </form>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-lg">
                <Plus className="w-5 h-5 text-brand-500" />
                <span>Add New Store Item</span>
              </CardTitle>
              <CardDescription>
                Add a unified store item with picture, quantity, hidden status,
                and UTC times for Reveal, optional Pre-Order, and Regular Sale.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <form onSubmit={handleAddStoreItem} className="space-y-4">
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  <Input
                    data-testid="admin-new-slug"
                    value={newSlug}
                    onChange={(e) => setNewSlug(e.target.value)}
                    placeholder="Item slug (e.g. catan-base-game)"
                    required
                  />
                  <Input
                    data-testid="admin-new-title"
                    value={newTitle}
                    onChange={(e) => setNewTitle(e.target.value)}
                    placeholder="Item Name (English — locked after creation)"
                    required
                  />
                  <Input
                    data-testid="admin-new-title-he"
                    value={newTitleHe}
                    onChange={(e) => setNewTitleHe(e.target.value)}
                    placeholder="Item Name (Hebrew — locked after creation)"
                  />
                  <div className="flex gap-2">
                    <Input
                      type="number"
                      data-testid="admin-new-price"
                      value={newPrice}
                      onChange={(e) => setNewPrice(e.target.value)}
                      placeholder="Regular Price"
                      required
                    />
                    <Input
                      type="number"
                      data-testid="admin-new-preorder-price"
                      value={newPreOrderPrice}
                      onChange={(e) => setNewPreOrderPrice(e.target.value)}
                      placeholder={t.adminPortal.preOrderPriceLabel}
                    />
                    <Input
                      data-testid="admin-new-currency"
                      value={newCurrencyId}
                      onChange={(e) => setNewCurrencyId(e.target.value)}
                      placeholder="ILS"
                      className="w-20"
                    />
                  </div>
                  <div className="flex items-center gap-2">
                    <label className="text-xs font-semibold text-slate-500 whitespace-nowrap">
                      Available Qty:
                    </label>
                    <Input
                      type="number"
                      min={0}
                      data-testid="admin-new-quantity"
                      value={newQuantity}
                      onChange={(e) => setNewQuantity(e.target.value)}
                      placeholder="Qty"
                      required
                    />
                  </div>
                  <Input
                    data-testid="admin-new-desc"
                    value={newDescription}
                    onChange={(e) => setNewDescription(e.target.value)}
                    placeholder="Description"
                  />
                </div>

                {/* Picture URL or File Upload */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <Input
                    data-testid="admin-new-image"
                    value={newImageUrl}
                    onChange={(e) => setNewImageUrl(e.target.value)}
                    placeholder="Item Picture URL (https://... or upload file ->)"
                  />
                  <Input
                    type="file"
                    accept="image/*"
                    data-testid="admin-new-image-file"
                    onChange={(e) => handleImageFileUpload(e, setNewImageUrl)}
                  />
                </div>

                {/* Visibility & Release Schedule (UTC) */}
                <div className="p-4 rounded-2xl bg-slate-50 dark:bg-slate-900/60 border border-slate-200 dark:border-slate-800 space-y-3">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <span className="text-xs font-bold uppercase tracking-wider text-brand-500">
                      Item Lifecycle &amp; Release Schedule (Saved in UTC)
                    </span>
                    <div className="flex flex-wrap items-center gap-4">
                      <label className="flex items-center gap-2 text-xs font-semibold cursor-pointer">
                        <input
                          type="checkbox"
                          data-testid="admin-new-wont-be-stocked"
                          checked={newWontBeStocked}
                          onChange={(e) => setNewWontBeStocked(e.target.checked)}
                        />
                        <span>Won&apos;t Be Stocked (Can be Regular when stock &gt; 0)</span>
                      </label>
                      <label className="flex items-center gap-2 text-xs font-semibold cursor-pointer">
                        <input
                          type="checkbox"
                          data-testid="admin-new-hidden"
                          checked={newIsHidden}
                          onChange={(e) => setNewIsHidden(e.target.checked)}
                        />
                        <span>Hide Item from Users</span>
                      </label>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-5 gap-3">
                    <div>
                      <label className="block text-[11px] text-slate-500 mb-1">
                        Explicit Lifecycle Stage
                      </label>
                      <select
                        data-testid="admin-new-lifecycle-stage"
                        value={newLifecycleStage}
                        onChange={(e) => setNewLifecycleStage(e.target.value)}
                        className="w-full h-10 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 px-3 text-xs font-semibold"
                      >
                        <option value="">Auto (From UTC &amp; Stock)</option>
                        <option value="hidden">Hidden</option>
                        <option value="pre-order-soon">Pre-Order Soon</option>
                        <option value="pre-order">Pre-Order</option>
                        <option value="coming-soon">Coming Soon</option>
                        <option value="regular">Regular</option>
                        <option value="out-of-stock">Out of Stock</option>
                        <option value="wont-be-stocked">Won&apos;t Be Stocked</option>
                      </select>
                    </div>
                    <div>
                      <label className="block text-[11px] text-slate-500 mb-1">
                        Reveal Time (UTC ISO)
                      </label>
                      <Input
                        data-testid="admin-new-reveal-utc"
                        value={newRevealAtUtc}
                        onChange={(e) => setNewRevealAtUtc(e.target.value)}
                        placeholder="e.g. 2026-01-01T00:00:00Z"
                      />
                    </div>
                    <div>
                      <label className="block text-[11px] text-slate-500 mb-1">
                        Pre-Order Time (UTC ISO — Optional)
                      </label>
                      <Input
                        data-testid="admin-new-preorder-utc"
                        value={newPreOrderAtUtc}
                        onChange={(e) => setNewPreOrderAtUtc(e.target.value)}
                        placeholder="Optional (leave empty if no pre-order)"
                      />
                    </div>
                    <div>
                      <label className="block text-[11px] text-slate-500 mb-1">
                        Coming Soon Time (UTC ISO — Optional)
                      </label>
                      <Input
                        data-testid="admin-new-comingsoon-utc"
                        value={newComingSoonAtUtc}
                        onChange={(e) => setNewComingSoonAtUtc(e.target.value)}
                        placeholder="Optional (pre-order ends -> coming soon)"
                      />
                    </div>
                    <div>
                      <label className="block text-[11px] text-slate-500 mb-1">
                        Regular Sale Time (UTC ISO)
                      </label>
                      <Input
                        data-testid="admin-new-regular-utc"
                        value={newRegularSaleAtUtc}
                        onChange={(e) => setNewRegularSaleAtUtc(e.target.value)}
                        placeholder="e.g. 2026-12-01T00:00:00Z"
                      />
                    </div>
                  </div>
                </div>

                <Button type="submit" data-testid="admin-add-item-btn">
                  <Plus className="w-4 h-4" />
                  <span>Add Item to Store Inventory</span>
                </Button>
              </form>
            </CardContent>
          </Card>

          {/* Store Items List */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-lg">
                <Package className="w-5 h-5 text-brand-500" />
                <span>
                  Store Inventory Items ({storeInventoryItems.length})
                </span>
              </CardTitle>
              <CardDescription>
                Admins can edit every attribute of an item except its name.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              {storeInventoryItems.map((item) => (
                <div
                  key={item.slug}
                  data-testid={`admin-item-${item.slug}`}
                  className="p-4 rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200/70 dark:border-slate-800 space-y-3"
                >
                  <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
                    <div className="flex items-start gap-3">
                      {item.imageUrl ? (
                        <img
                          src={item.imageUrl}
                          alt={item.title}
                          className="w-14 h-14 rounded-lg object-cover border border-slate-200 dark:border-slate-700 shrink-0"
                        />
                      ) : (
                        <div className="w-14 h-14 rounded-lg bg-slate-200/70 dark:bg-slate-800 flex items-center justify-center text-slate-400 shrink-0">
                          <ImageIcon className="w-5 h-5" />
                        </div>
                      )}
                      <div className="space-y-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="font-bold text-sm">{item.title}</span>
                          <Badge
                            data-testid={`admin-stock-badge-${item.slug}`}
                            variant={
                              item.inStock && item.quantity > 0
                                ? "emerald"
                                : "amber"
                            }
                          >
                            {item.inStock && item.quantity > 0
                              ? `Available: ${item.quantity}`
                              : "Out of Stock (0)"}
                          </Badge>
                          <Badge
                            data-testid={`admin-stage-badge-${item.slug}`}
                            variant={
                              item.saleStage === "hidden"
                                ? "amber"
                                : item.saleStage === "pre-order"
                                ? "default"
                                : "secondary"
                            }
                          >
                            Stage: {item.saleStage || "regular"}
                          </Badge>
                          {item.wontBeStocked && (
                            <Badge
                              variant="amber"
                              data-testid={`admin-wontbestocked-badge-${item.slug}`}
                            >
                              Won&apos;t Be Stocked
                            </Badge>
                          )}
                          {item.preOrderMoney &&
                            item.preOrderMoney.price > 0 && (
                              <Badge
                                variant="amber"
                                data-testid={`admin-preorder-price-badge-${item.slug}`}
                              >
                                Pre-Order:{" "}
                                {formatMoney(item.preOrderMoney)}
                              </Badge>
                            )}
                        </div>
                        <p className="text-xs text-slate-500">
                          Slug: {item.slug} • Regular Price:{" "}
                          {formatMoney(item.money)} ({item.money.currencyId})
                          {item.preOrderMoney && item.preOrderMoney.price > 0
                            ? ` • Pre-Order Price: ${formatMoney(item.preOrderMoney)}`
                            : ""}
                        </p>
                      </div>
                    </div>

                    <div className="flex flex-wrap items-center gap-2">
                      <select
                        data-testid={`admin-stage-select-${item.slug}`}
                        value={item.saleStage || "regular"}
                        onChange={(e) =>
                          handleChangeItemStage(
                            item,
                            e.target.value as SaleStage
                          )
                        }
                        className="h-9 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 px-2.5 text-xs font-semibold"
                      >
                        <option value="hidden">Hidden</option>
                        <option value="pre-order-soon">Pre-Order Soon</option>
                        <option value="pre-order">Pre-Order</option>
                        <option value="coming-soon">Coming Soon</option>
                        <option value="regular">Regular</option>
                        <option value="out-of-stock">Out of Stock</option>
                        <option value="wont-be-stocked">Won&apos;t Be Stocked</option>
                      </select>

                      <Button
                        type="button"
                        variant={item.wontBeStocked ? "default" : "outline"}
                        size="sm"
                        data-testid={`admin-wont-be-stocked-btn-${item.slug}`}
                        onClick={() => handleToggleWontBeStocked(item)}
                      >
                        {item.wontBeStocked
                          ? "Won't Be Stocked: ON"
                          : "Won't Be Stocked: OFF"}
                      </Button>

                      <div className="flex items-center gap-1.5">
                        <Input
                          type="number"
                          min={0}
                          data-testid={`admin-qty-input-${item.slug}`}
                          value={
                            qtyDrafts[item.slug] ?? String(item.quantity ?? 0)
                          }
                          onChange={(e) =>
                            setQtyDrafts({
                              ...qtyDrafts,
                              [item.slug]: e.target.value,
                            })
                          }
                          className="w-20 h-9 text-xs"
                        />
                        <Button
                          type="button"
                          variant="secondary"
                          size="sm"
                          data-testid={`admin-qty-save-${item.slug}`}
                          onClick={() => handleUpdateQuantity(item.slug, false)}
                        >
                          <Save className="w-3.5 h-3.5" />
                          <span>Set Qty</span>
                        </Button>
                      </div>

                      <Button
                        variant="outline"
                        size="sm"
                        data-testid={`admin-edit-btn-${item.slug}`}
                        onClick={() =>
                          editingSlug === item.slug
                            ? setEditingSlug(null)
                            : startEditingItem(item)
                        }
                      >
                        <Edit3 className="w-3.5 h-3.5" />
                        <span>Edit Details</span>
                      </Button>

                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => handleToggleStock(item)}
                      >
                        {item.inStock ? "Mark Out of Stock" : "Mark In Stock"}
                      </Button>

                      <Button
                        variant="destructive"
                        size="sm"
                        data-testid={`admin-delete-${item.slug}`}
                        onClick={() => handleRemoveItem(item.slug, false)}
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                        <span>Remove</span>
                      </Button>
                    </div>
                  </div>

                  {/* Full Item Editor (All fields editable EXCEPT Locked Name) */}
                  {editingSlug === item.slug && (
                    <div
                      data-testid={`admin-edit-panel-${item.slug}`}
                      className="pt-3 border-t border-slate-200 dark:border-slate-700 space-y-3"
                    >
                      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                        <div>
                          <label className="flex items-center gap-1 text-[11px] font-semibold text-slate-400 mb-1">
                            <Lock className="w-3 h-3" />
                            <span>Item Name (Locked — Cannot Edit)</span>
                          </label>
                          <Input
                            data-testid={`admin-edit-locked-title-${item.slug}`}
                            value={item.title}
                            disabled
                            readOnly
                            className="opacity-60 cursor-not-allowed"
                          />
                        </div>
                        <div>
                          <label className="block text-[11px] text-slate-500 mb-1">
                            Regular Price, Pre-Order Price &amp; Currency
                          </label>
                          <div className="flex gap-2">
                            <Input
                              type="number"
                              data-testid={`admin-edit-price-${item.slug}`}
                              value={editDraft.price}
                              onChange={(e) =>
                                setEditDraft({
                                  ...editDraft,
                                  price: e.target.value,
                                })
                              }
                              placeholder="Regular"
                            />
                            <Input
                              type="number"
                              data-testid={`admin-edit-preorder-price-${item.slug}`}
                              value={editDraft.preOrderPrice || ""}
                              onChange={(e) =>
                                setEditDraft({
                                  ...editDraft,
                                  preOrderPrice: e.target.value,
                                })
                              }
                              placeholder="Pre-Order"
                            />
                            <Input
                              data-testid={`admin-edit-currency-${item.slug}`}
                              value={editDraft.currencyId}
                              onChange={(e) =>
                                setEditDraft({
                                  ...editDraft,
                                  currencyId: e.target.value,
                                })
                              }
                              className="w-20"
                            />
                          </div>
                        </div>
                        <div>
                          <label className="block text-[11px] text-slate-500 mb-1">
                            Picture URL
                          </label>
                          <Input
                            data-testid={`admin-edit-image-${item.slug}`}
                            value={editDraft.imageUrl}
                            onChange={(e) =>
                              setEditDraft({
                                ...editDraft,
                                imageUrl: e.target.value,
                              })
                            }
                          />
                        </div>
                      </div>

                      <div className="grid grid-cols-1 sm:grid-cols-4 gap-3">
                        <Input
                          data-testid={`admin-edit-desc-${item.slug}`}
                          value={editDraft.description}
                          onChange={(e) =>
                            setEditDraft({
                              ...editDraft,
                              description: e.target.value,
                            })
                          }
                          placeholder="Description"
                        />
                        <Input
                          data-testid={`admin-edit-reveal-${item.slug}`}
                          value={editDraft.revealAtUtc}
                          onChange={(e) =>
                            setEditDraft({
                              ...editDraft,
                              revealAtUtc: e.target.value,
                            })
                          }
                          placeholder="Reveal Time UTC ISO"
                        />
                        <Input
                          data-testid={`admin-edit-preorder-${item.slug}`}
                          value={editDraft.preOrderAtUtc}
                          onChange={(e) =>
                            setEditDraft({
                              ...editDraft,
                              preOrderAtUtc: e.target.value,
                            })
                          }
                          placeholder="Pre-Order Time UTC (Optional)"
                        />
                        <Input
                          data-testid={`admin-edit-regular-${item.slug}`}
                          value={editDraft.regularSaleAtUtc}
                          onChange={(e) =>
                            setEditDraft({
                              ...editDraft,
                              regularSaleAtUtc: e.target.value,
                            })
                          }
                          placeholder="Regular Sale Time UTC ISO"
                        />
                      </div>

                      <div className="flex items-center justify-between">
                        <label className="flex items-center gap-2 text-xs font-semibold cursor-pointer">
                          <input
                            type="checkbox"
                            data-testid={`admin-edit-hidden-${item.slug}`}
                            checked={Boolean(editDraft.isHidden)}
                            onChange={(e) =>
                              setEditDraft({
                                ...editDraft,
                                isHidden: e.target.checked,
                              })
                            }
                          />
                          <span>Hidden from Users</span>
                        </label>

                        <Button
                          size="sm"
                          data-testid={`admin-edit-save-${item.slug}`}
                          onClick={() => handleSaveItemEdit(item.slug)}
                        >
                          <Save className="w-3.5 h-3.5" />
                          <span>Save Item Changes</span>
                        </Button>
                      </div>
                    </div>
                  )}
                </div>
              ))}
            </CardContent>
          </Card>

          {/* Orders Management */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-lg">
                <ShoppingBag className="w-5 h-5 text-brand-500" />
                <span>Customer Orders ({orders.length})</span>
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {orders.map((order) => {
                const normStatus = normalizeOrderStatus(order.status);
                const canCancel = canStoreCancelOrder(normStatus);
                return (
                  <div
                    key={order._id}
                    data-testid={`admin-order-${order._id}`}
                    className="p-4 rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200/70 dark:border-slate-800 flex flex-wrap items-center justify-between gap-4"
                  >
                    <div className="space-y-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="font-bold text-sm">
                          Order #{order._id.slice(-6)}
                        </span>
                        <Badge
                          data-testid={`admin-order-status-${order._id}`}
                          variant={
                            normStatus === "cancelled" ||
                            normStatus === "aborted" ||
                            normStatus === "ordered-not-paid"
                              ? "amber"
                              : normStatus === "completed" ||
                                normStatus === "sent-or-waiting" ||
                                normStatus === "packaged"
                              ? "emerald"
                              : "default"
                          }
                        >
                          {normStatus}
                        </Badge>
                        <span className="font-extrabold text-sm text-brand-500">
                          {formatMoney(order.totalMoney)}
                        </span>
                      </div>
                      <p className="text-xs text-slate-500">
                        Customer:{" "}
                        <FormattedName
                          value={order.customer?.name}
                          fallback="Guest Player"
                        />{" "}
                        (
                        {order.customer?.email}) • Payment:{" "}
                        {order.paymentMethod?.type}{" "}
                        {order.paymentMethod?.detail}
                        {order.deliveryOption
                          ? ` • Delivery: ${order.deliveryOption.label}`
                          : ""}
                        {order.expectedDeliveryAtUtc ||
                        order.deliveryOption?.expectedDeliveryAtUtc
                          ? ` • Expected Delivery: ${formatExpectedDeliveryDate(
                              order.expectedDeliveryAtUtc ||
                                order.deliveryOption?.expectedDeliveryAtUtc ||
                                ""
                            )}`
                          : ""}
                      </p>
                    </div>

                    <div className="flex flex-wrap items-center gap-1.5">
                      {ORDER_LIFECYCLE_STEPS.filter(
                        (step) => step !== "in-cart"
                      ).map((step) => (
                        <Button
                          key={step}
                          size="sm"
                          variant={normStatus === step ? "default" : "outline"}
                          disabled={
                            normStatus === "cancelled" ||
                            normStatus === "aborted"
                          }
                          data-testid={
                            step === "packaged"
                              ? `admin-approve-order-${order._id}`
                              : `admin-order-step-${step}-${order._id}`
                          }
                          onClick={() => handleOrderStatus(order._id, step)}
                        >
                          <span>
                            {step === "ordered-not-paid"
                              ? "Ordered (Not Paid)"
                              : step === "ordered-paid"
                              ? "Ordered (Paid)"
                              : step === "packaged"
                              ? "Packaged"
                              : step === "sent-or-waiting"
                              ? "Sent / Waiting"
                              : "Completed"}
                          </span>
                        </Button>
                      ))}
                      <Button
                        size="sm"
                        variant="destructive"
                        disabled={!canCancel}
                        data-testid={`admin-decline-order-${order._id}`}
                        onClick={() =>
                          handleOrderStatus(order._id, "cancelled")
                        }
                      >
                        <XCircle className="w-3.5 h-3.5" />
                        <span>Cancel Order</span>
                      </Button>
                    </div>
                  </div>
                );
              })}
            </CardContent>
          </Card>
        </div>
      )}

      {/* ===================================================================== */}
      {/* PAGE 2: EVENTS & PARTICIPANT CSV DOWNLOAD                             */}
      {/* ===================================================================== */}
      {activePage === "events" && (
        <div data-testid="admin-page-events" className="space-y-8">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-lg">
                <Calendar className="w-5 h-5 text-brand-500" />
                <span>Create New Event</span>
              </CardTitle>
              <CardDescription>
                Configure event tickets, picture, Facebook link, minimum/maximum
                players, and public registration count visibility.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <form onSubmit={handleCreateEvent} className="space-y-4">
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  <Input
                    data-testid="admin-event-slug"
                    value={evSlug}
                    onChange={(e) => setEvSlug(e.target.value)}
                    placeholder="Event slug (e.g. friday-night-tcg)"
                    required
                  />
                  <Input
                    data-testid="admin-event-title"
                    value={evTitle}
                    onChange={(e) => setEvTitle(e.target.value)}
                    placeholder="Event Title (English)"
                    required
                  />
                  <Input
                    data-testid="admin-event-title-he"
                    value={evTitleHe}
                    onChange={(e) => setEvTitleHe(e.target.value)}
                    placeholder="Event Title (Hebrew)"
                  />
                  <div className="flex gap-2">
                    <Input
                      type="number"
                      data-testid="admin-event-price"
                      value={evPrice}
                      onChange={(e) => setEvPrice(e.target.value)}
                      placeholder="Ticket Price"
                      required
                    />
                    <Input
                      data-testid="admin-event-currency"
                      value={evCurrencyId}
                      onChange={(e) => setEvCurrencyId(e.target.value)}
                      placeholder="ILS"
                      className="w-24"
                    />
                  </div>
                  <Input
                    type="number"
                    min={0}
                    data-testid="admin-event-quantity"
                    value={evQuantity}
                    onChange={(e) => setEvQuantity(e.target.value)}
                    placeholder="Available Tickets"
                    required
                  />
                  <Input
                    data-testid="admin-event-image"
                    value={evImageUrl}
                    onChange={(e) => setEvImageUrl(e.target.value)}
                    placeholder="Event Picture URL (https://...)"
                  />
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <Input
                    data-testid="admin-event-desc"
                    value={evDescription}
                    onChange={(e) => setEvDescription(e.target.value)}
                    placeholder="Event Description"
                  />
                  <Input
                    data-testid="admin-event-facebook"
                    value={evFacebookUrl}
                    onChange={(e) => setEvFacebookUrl(e.target.value)}
                    placeholder="Facebook Event Link (https://www.facebook.com/...)"
                  />
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-4 gap-3">
                  <Input
                    data-testid="admin-event-date"
                    value={evDate}
                    onChange={(e) => setEvDate(e.target.value)}
                    placeholder="Event Date (e.g. Friday, 19:00)"
                  />
                  <Input
                    data-testid="admin-event-venue"
                    value={evVenue}
                    onChange={(e) => setEvVenue(e.target.value)}
                    placeholder="Venue (e.g. Main Hall)"
                  />
                  <Input
                    type="number"
                    min={0}
                    data-testid="admin-event-min-players"
                    value={evMinPlayers}
                    onChange={(e) => setEvMinPlayers(e.target.value)}
                    placeholder="Min Players (leave empty if none)"
                  />
                  <Input
                    type="number"
                    min={1}
                    data-testid="admin-event-max-players"
                    value={evMaxPlayers}
                    onChange={(e) => setEvMaxPlayers(e.target.value)}
                    placeholder="Max Players (e.g. 16)"
                  />
                </div>

                <label className="flex items-center gap-2 text-xs font-semibold text-slate-700 dark:text-slate-300 cursor-pointer">
                  <input
                    type="checkbox"
                    data-testid="admin-event-show-registered"
                    checked={evShowRegistered}
                    onChange={(e) => setEvShowRegistered(e.target.checked)}
                  />
                  <span>
                    Show amount of registered users publicly on the Events page
                  </span>
                </label>

                <Button type="submit" data-testid="admin-create-event-btn">
                  <Plus className="w-4 h-4" />
                  <span>Create Event</span>
                </Button>
              </form>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-lg">
                <Calendar className="w-5 h-5 text-brand-500" />
                <span>Published Events ({eventItems.length})</span>
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {eventItems.map((item) => {
                const regCount = item.registeredCount ?? 0;
                const maxP = item.maxPlayers ?? item.quantity;
                const hasMinPlayers =
                  typeof item.minPlayers === "number" && item.minPlayers > 0;
                const minMet =
                  hasMinPlayers && regCount >= (item.minPlayers ?? 0);

                return (
                  <div
                    key={item.slug}
                    data-testid={`admin-item-${item.slug}`}
                    className="p-4 rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200/70 dark:border-slate-800 space-y-3"
                  >
                    <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
                      <div className="space-y-1.5">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="font-bold text-sm">
                            {item.title}
                          </span>
                          <Badge
                            data-testid={`admin-stock-badge-${item.slug}`}
                            variant={
                              item.inStock && item.quantity > 0
                                ? "emerald"
                                : "amber"
                            }
                          >
                            {item.inStock && item.quantity > 0
                              ? `Available: ${item.quantity}`
                              : "Sold Out (0)"}
                          </Badge>
                          {item.facebookUrl && (
                            <a
                              href={item.facebookUrl}
                              target="_blank"
                              rel="noopener noreferrer"
                              data-testid={`admin-fb-link-${item.slug}`}
                              className="inline-flex items-center gap-1 text-xs font-semibold text-blue-500 hover:underline"
                            >
                              <Facebook className="w-3.5 h-3.5" />
                              <span>Facebook Link</span>
                            </a>
                          )}
                        </div>

                        <div className="flex flex-wrap items-center gap-2 pt-1">
                          {hasMinPlayers ? (
                            <Badge
                              data-testid={`admin-event-min-status-${item.slug}`}
                              variant={minMet ? "emerald" : "amber"}
                            >
                              <Users className="w-3.5 h-3.5" />
                              <span>
                                {minMet
                                  ? `Minimum Met! (${regCount} / ${maxP} Registered • Min: ${item.minPlayers})`
                                  : `Waiting for Min Players: ${regCount} / ${
                                      item.minPlayers
                                    } min (Max: ${maxP}) — Needs ${
                                      (item.minPlayers ?? 0) - regCount
                                    } more`}
                              </span>
                            </Badge>
                          ) : (
                            <Badge
                              data-testid={`admin-event-no-min-${item.slug}`}
                              variant="default"
                            >
                              <Users className="w-3.5 h-3.5" />
                              <span>
                                Open Event (No Minimum Required) • {regCount} /{" "}
                                {maxP} Registered
                              </span>
                            </Badge>
                          )}

                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            data-testid={`admin-toggle-registered-${item.slug}`}
                            onClick={() => handleToggleShowRegistered(item)}
                          >
                            {item.showRegisteredCount ? (
                              <>
                                <Eye className="w-3.5 h-3.5 text-emerald-500" />
                                <span>Registered Count Shown</span>
                              </>
                            ) : (
                              <>
                                <EyeOff className="w-3.5 h-3.5 text-slate-400" />
                                <span>Registered Count Hidden</span>
                              </>
                            )}
                          </Button>

                          {/* Download Participants CSV Button */}
                          <Button
                            type="button"
                            variant="secondary"
                            size="sm"
                            data-testid={`admin-download-participants-${item.slug}`}
                            onClick={() =>
                              handleDownloadEventParticipants(item.slug)
                            }
                          >
                            <Download className="w-3.5 h-3.5 text-brand-500" />
                            <span>Download Participants (CSV)</span>
                          </Button>
                        </div>
                      </div>

                      <div className="flex items-center gap-2">
                        <Input
                          type="number"
                          min={0}
                          data-testid={`admin-qty-input-${item.slug}`}
                          value={
                            qtyDrafts[item.slug] ?? String(item.quantity ?? 0)
                          }
                          onChange={(e) =>
                            setQtyDrafts({
                              ...qtyDrafts,
                              [item.slug]: e.target.value,
                            })
                          }
                          className="w-20 h-9 text-xs"
                        />
                        <Button
                          type="button"
                          variant="secondary"
                          size="sm"
                          data-testid={`admin-qty-save-${item.slug}`}
                          onClick={() => handleUpdateQuantity(item.slug, true)}
                        >
                          <Save className="w-3.5 h-3.5" />
                          <span>Set Qty</span>
                        </Button>
                        <Button
                          variant="destructive"
                          size="sm"
                          data-testid={`admin-delete-${item.slug}`}
                          onClick={() => handleRemoveItem(item.slug, true)}
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                          <span>Remove</span>
                        </Button>
                      </div>
                    </div>

                    {downloadedCsvPreview[item.slug] && (
                      <pre
                        data-testid={`admin-participants-csv-${item.slug}`}
                        className="p-3 rounded-xl bg-slate-900 text-emerald-300 text-[11px] font-mono overflow-x-auto"
                      >
                        {downloadedCsvPreview[item.slug]}
                      </pre>
                    )}
                  </div>
                );
              })}
            </CardContent>
          </Card>
        </div>
      )}

      {/* ===================================================================== */}
      {/* PAGE 3: METADATA, DELIVERY OPTIONS & PREMIUM CLASSES                  */}
      {/* ===================================================================== */}
      {activePage === "metadata" && (
        <div data-testid="admin-page-metadata" className="space-y-8">
          {/* Store Metadata & Delivery Options Card */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center justify-between text-lg">
                <span className="flex items-center gap-2">
                  <Settings className="w-5 h-5 text-brand-500" />
                  <span>
                    Store Metadata (Opening Hours, Phone, Email &amp; Delivery
                    Options)
                  </span>
                </span>
                {metaSaved && (
                  <span
                    data-testid="admin-metadata-saved-msg"
                    className="text-xs font-semibold text-emerald-500 flex items-center gap-1"
                  >
                    <CheckCircle2 className="w-4 h-4" />
                    Metadata &amp; delivery options saved in UTC!
                  </span>
                )}
              </CardTitle>
            </CardHeader>
            <CardContent>
              <form onSubmit={handleSaveMetadata} className="space-y-6">
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  <div>
                    <label className="block text-xs font-semibold mb-1">
                      Store Phone
                    </label>
                    <Input
                      data-testid="admin-meta-phone"
                      value={metaPhone}
                      onChange={(e) => setMetaPhone(e.target.value)}
                      required
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold mb-1">
                      Store Email
                    </label>
                    <Input
                      data-testid="admin-meta-email"
                      value={metaEmail}
                      onChange={(e) => setMetaEmail(e.target.value)}
                      required
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold mb-1">
                      Store Address
                    </label>
                    <Input
                      data-testid="admin-meta-address"
                      value={metaAddress}
                      onChange={(e) => setMetaAddress(e.target.value)}
                      required
                    />
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-semibold mb-1">
                      Opening Hours (English)
                    </label>
                    <Input
                      data-testid="admin-meta-hours"
                      value={metaHours}
                      onChange={(e) => setMetaHours(e.target.value)}
                      required
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold mb-1">
                      Opening Hours (Hebrew)
                    </label>
                    <Input
                      data-testid="admin-meta-hours-he"
                      value={metaHoursHe}
                      onChange={(e) => setMetaHoursHe(e.target.value)}
                    />
                  </div>
                </div>

                {/* Controllable Delivery Options & Expected Delivery Time Section */}
                <div
                  data-testid="admin-delivery-options-section"
                  className="p-4 rounded-2xl bg-slate-50 dark:bg-slate-900/60 border border-slate-200 dark:border-slate-800 space-y-4"
                >
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="flex items-center gap-2 font-bold text-sm">
                      <Truck className="w-4 h-4 text-brand-500" />
                      <span>
                        Controllable Delivery Options &amp; Estimated Delivery
                        Time (Added to Order Total)
                      </span>
                    </div>
                    <div className="flex items-center gap-2">
                      {deliverySaved && (
                        <span
                          data-testid="admin-delivery-saved-msg"
                          className="text-xs font-semibold text-emerald-500 flex items-center gap-1"
                        >
                          <CheckCircle2 className="w-4 h-4" />
                          <span>Delivery options saved!</span>
                        </span>
                      )}
                      <Button
                        type="button"
                        size="sm"
                        data-testid="admin-save-delivery-options-btn"
                        onClick={handleSaveDeliveryOptions}
                      >
                        <Save className="w-3.5 h-3.5" />
                        <span>Save Delivery Options</span>
                      </Button>
                    </div>
                  </div>

                  <div className="space-y-3">
                    {deliveryOptions.map((opt, idx) => {
                      const activeCount = deliveryOptions.filter(
                        (o) => o.active !== false
                      ).length;
                      const isOnlyActive =
                        opt.active !== false && activeCount <= 1;
                      const estDays = Math.max(
                        0,
                        Math.floor(
                          Number(
                            opt.estimatedDays ?? (opt.isStorePickup ? 0 : 3)
                          )
                        )
                      );
                      const expectedDateStr = formatExpectedDeliveryDate(
                        opt.expectedDeliveryAtUtc || estDays
                      );
                      return (
                        <div
                          key={opt.id}
                          data-testid={`admin-delivery-opt-${opt.id}`}
                          className="p-3 rounded-xl bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-xs space-y-2.5"
                        >
                          <div className="flex flex-wrap items-center justify-between gap-2">
                            <div className="flex flex-wrap items-center gap-2">
                              <label className="inline-flex items-center gap-1.5 font-bold cursor-pointer">
                                <input
                                  type="checkbox"
                                  data-testid={`admin-delivery-active-${opt.id}`}
                                  checked={opt.active !== false}
                                  disabled={isOnlyActive}
                                  onChange={(e) => {
                                    const next = [...deliveryOptions];
                                    next[idx] = {
                                      ...opt,
                                      active: e.target.checked,
                                    };
                                    setDeliveryOptions(next);
                                  }}
                                  aria-label={`Enable ${opt.label}`}
                                  className="rounded"
                                />
                                <span>{opt.label}</span>
                              </label>
                              <Badge
                                variant={
                                  opt.active !== false ? "emerald" : "default"
                                }
                                data-testid={`admin-delivery-status-${opt.id}`}
                              >
                                {opt.active !== false ? "Active" : "Disabled"}
                              </Badge>
                              {opt.isStorePickup && (
                                <Badge variant="emerald">Wait in Store</Badge>
                              )}
                              <Badge
                                variant="secondary"
                                data-testid={`admin-delivery-expected-date-${opt.id}`}
                              >
                                Expected: {expectedDateStr} ({estDays}d)
                              </Badge>
                            </div>

                            <div className="flex items-center gap-2">
                              <label className="inline-flex items-center gap-1 text-slate-600 dark:text-slate-300 font-semibold cursor-pointer">
                                <input
                                  type="checkbox"
                                  data-testid={`admin-delivery-pickup-${opt.id}`}
                                  checked={Boolean(opt.isStorePickup)}
                                  onChange={(e) => {
                                    const next = [...deliveryOptions];
                                    next[idx] = {
                                      ...opt,
                                      isStorePickup: e.target.checked,
                                    };
                                    setDeliveryOptions(next);
                                  }}
                                  className="rounded"
                                />
                                <span>Store Pickup</span>
                              </label>
                              <Button
                                type="button"
                                variant="destructive"
                                size="sm"
                                data-testid={`admin-delivery-remove-${opt.id}`}
                                disabled={deliveryOptions.length <= 1}
                                onClick={() =>
                                  handleRemoveDeliveryOption(opt.id)
                                }
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </Button>
                            </div>
                          </div>

                          <div className="grid grid-cols-1 sm:grid-cols-4 gap-2 items-center">
                            <Input
                              data-testid={`admin-delivery-label-${opt.id}`}
                              value={opt.label}
                              onChange={(e) => {
                                const next = [...deliveryOptions];
                                next[idx] = {
                                  ...opt,
                                  label: e.target.value,
                                };
                                setDeliveryOptions(next);
                              }}
                              placeholder="Label (EN)"
                              className="h-8 text-xs"
                            />
                            <Input
                              data-testid={`admin-delivery-label-he-${opt.id}`}
                              value={opt.label_he || ""}
                              onChange={(e) => {
                                const next = [...deliveryOptions];
                                next[idx] = {
                                  ...opt,
                                  label_he: e.target.value,
                                };
                                setDeliveryOptions(next);
                              }}
                              placeholder="Label (HE)"
                              className="h-8 text-xs"
                            />
                            <label className="flex items-center gap-1.5">
                              <span className="text-slate-500 font-semibold shrink-0">
                                Est. Days:
                              </span>
                              <Input
                                type="number"
                                min={0}
                                data-testid={`admin-delivery-days-${opt.id}`}
                                value={String(estDays)}
                                onChange={(e) => {
                                  const daysVal = Math.max(
                                    0,
                                    Math.floor(Number(e.target.value || 0))
                                  );
                                  const next = [...deliveryOptions];
                                  next[idx] = {
                                    ...opt,
                                    estimatedDays: daysVal,
                                  };
                                  setDeliveryOptions(
                                    normalizeDeliveryOptions(next)
                                  );
                                }}
                                className="h-8 text-xs"
                              />
                            </label>
                            <label className="flex items-center gap-1.5">
                              <span className="text-slate-500 font-semibold shrink-0">
                                Cost (₪):
                              </span>
                              <Input
                                type="number"
                                min={0}
                                data-testid={`admin-delivery-cost-${opt.id}`}
                                value={String(opt.cost.price)}
                                onChange={(e) => {
                                  const next = [...deliveryOptions];
                                  next[idx] = {
                                    ...opt,
                                    cost: {
                                      price: Math.max(
                                        0,
                                        Number(e.target.value)
                                      ),
                                      currencyId:
                                        opt.cost.currencyId || "ILS",
                                    },
                                  };
                                  setDeliveryOptions(next);
                                }}
                                className="h-8 text-xs"
                              />
                            </label>
                          </div>
                        </div>
                      );
                    })}
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-6 gap-2 items-end pt-2 border-t border-slate-200 dark:border-slate-800">
                    <Input
                      data-testid="admin-new-deliv-id"
                      placeholder="ID (e.g. express-shipping)"
                      {...deliveryOptionForm.register("id")}
                    />
                    <Input
                      data-testid="admin-new-deliv-label"
                      placeholder="Label (EN)"
                      {...deliveryOptionForm.register("label")}
                    />
                    <Input
                      data-testid="admin-new-deliv-label-he"
                      placeholder="Label (HE)"
                      {...deliveryOptionForm.register("labelHe")}
                    />
                    <Input
                      type="number"
                      min={0}
                      data-testid="admin-new-deliv-price"
                      placeholder="Cost (ILS)"
                      {...deliveryOptionForm.register("price")}
                    />
                    <Input
                      type="number"
                      min={0}
                      data-testid="admin-new-deliv-days"
                      placeholder="Est. Days"
                      {...deliveryOptionForm.register("estimatedDays")}
                    />
                    <div className="flex flex-col gap-1.5">
                      <label className="inline-flex items-center gap-1.5 text-xs font-semibold cursor-pointer">
                        <input
                          type="checkbox"
                          data-testid="admin-new-deliv-pickup"
                          className="rounded"
                          {...deliveryOptionForm.register("isStorePickup")}
                        />
                        <span>Store Pickup</span>
                      </label>
                      <Button
                        type="button"
                        variant="secondary"
                        data-testid="admin-add-delivery-opt-btn"
                        onClick={handleAddDeliveryOption}
                      >
                        <Plus className="w-3.5 h-3.5" />
                        <span>Add Option</span>
                      </Button>
                    </div>
                  </div>
                </div>

                {/* Controllable Payment Methods & Fees (Percentage + Constant) Section */}
                <div
                  data-testid="admin-payment-methods-section"
                  className="p-4 rounded-2xl bg-slate-50 dark:bg-slate-900/60 border border-slate-200 dark:border-slate-800 space-y-4"
                >
                  <div className="flex items-center gap-2 font-bold text-sm">
                    <CreditCard className="w-4 h-4 text-brand-500" />
                    <span>
                      Controllable Payment Methods &amp; Fees (Percentage % &amp;
                      Constant ₪)
                    </span>
                  </div>

                  <div className="space-y-2">
                    {paymentMethodsConfig.map((pmCfg, idx) => {
                      const activeCount = paymentMethodsConfig.filter(
                        (m) => m.active
                      ).length;
                      const isOnlyActive = pmCfg.active && activeCount <= 1;
                      return (
                        <div
                          key={pmCfg.type}
                          data-testid={`admin-payment-cfg-${pmCfg.type}`}
                          className="flex flex-wrap items-center justify-between gap-3 p-3 rounded-xl bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-xs"
                        >
                          <div className="flex items-center gap-3">
                            <label className="inline-flex items-center gap-2 font-bold cursor-pointer">
                              <input
                                type="checkbox"
                                data-testid={`admin-payment-active-${pmCfg.type}`}
                                checked={pmCfg.active}
                                disabled={isOnlyActive}
                                onChange={(e) => {
                                  const next = [...paymentMethodsConfig];
                                  next[idx] = {
                                    ...pmCfg,
                                    active: e.target.checked,
                                  };
                                  setPaymentMethodsConfig(next);
                                }}
                                aria-label={`Enable ${pmCfg.type}`}
                                className="rounded"
                              />
                              <span>
                                {t.payment.types[pmCfg.type] || pmCfg.type}
                              </span>
                            </label>
                            <Badge
                              variant={pmCfg.active ? "emerald" : "default"}
                              data-testid={`admin-payment-status-${pmCfg.type}`}
                            >
                              {pmCfg.active ? "Active" : "Disabled"}
                            </Badge>
                          </div>

                          <div className="flex flex-wrap items-center gap-3">
                            <label className="flex items-center gap-1.5">
                              <span className="text-slate-500 font-semibold">
                                Fee (%):
                              </span>
                              <Input
                                type="number"
                                min={0}
                                max={100}
                                step="0.1"
                                data-testid={`admin-payment-fee-percent-${pmCfg.type}`}
                                value={String(pmCfg.feePercent)}
                                onChange={(e) => {
                                  const next = [...paymentMethodsConfig];
                                  next[idx] = {
                                    ...pmCfg,
                                    feePercent: Math.min(
                                      100,
                                      Math.max(0, Number(e.target.value || 0))
                                    ),
                                  };
                                  setPaymentMethodsConfig(next);
                                }}
                                className="w-20 h-8 text-xs"
                              />
                            </label>

                            <label className="flex items-center gap-1.5">
                              <span className="text-slate-500 font-semibold">
                                Constant (₪):
                              </span>
                              <Input
                                type="number"
                                min={0}
                                step="0.5"
                                data-testid={`admin-payment-fee-constant-${pmCfg.type}`}
                                value={String(pmCfg.feeConstant.price)}
                                onChange={(e) => {
                                  const next = [...paymentMethodsConfig];
                                  next[idx] = {
                                    ...pmCfg,
                                    feeConstant: {
                                      price: Math.max(
                                        0,
                                        Number(e.target.value || 0)
                                      ),
                                      currencyId:
                                        pmCfg.feeConstant.currencyId || "ILS",
                                    },
                                  };
                                  setPaymentMethodsConfig(next);
                                }}
                                className="w-20 h-8 text-xs"
                              />
                            </label>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>

                {/* Controllable Supported Countries & ZIP Autocomplete */}
                <div
                  data-testid="admin-countries-section"
                  className="p-4 rounded-2xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-800 space-y-3"
                >
                  <div>
                    <h4 className="font-bold text-sm">
                      Controllable Supported Countries &amp; ZIP Autocomplete
                      (Geoapify)
                    </h4>
                    <p className="text-xs text-slate-500">
                      Control the closed list of active countries shown in
                      customer address forms and whether each country enables
                      the &quot;Fill Address from ZIP&quot; &amp; &quot;Find ZIP
                      from Address&quot; buttons.
                    </p>
                  </div>

                  <div className="space-y-2">
                    {supportedCountries.map((countryCfg, idx) => {
                      const activeCount = supportedCountries.filter(
                        (c) => c.active
                      ).length;
                      const isOnlyActive =
                        countryCfg.active && activeCount <= 1;
                      return (
                        <div
                          key={countryCfg.code}
                          data-testid={`admin-country-cfg-${countryCfg.code}`}
                          className="flex flex-wrap items-center justify-between gap-3 p-3 rounded-xl bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-xs"
                        >
                          <div className="flex items-center gap-3">
                            <label className="inline-flex items-center gap-2 font-bold cursor-pointer">
                              <input
                                type="checkbox"
                                data-testid={`admin-country-active-${countryCfg.code}`}
                                checked={countryCfg.active}
                                disabled={isOnlyActive}
                                onChange={(e) => {
                                  const next = [...supportedCountries];
                                  next[idx] = {
                                    ...countryCfg,
                                    active: e.target.checked,
                                  };
                                  setSupportedCountries(next);
                                }}
                                aria-label={`Enable country ${countryCfg.code}`}
                                className="rounded"
                              />
                              <span>
                                {countryCfg.name} ({countryCfg.name_he}) [
                                {countryCfg.code}]
                              </span>
                            </label>
                            <Badge
                              variant={
                                countryCfg.active ? "emerald" : "default"
                              }
                            >
                              {countryCfg.active ? "Active" : "Disabled"}
                            </Badge>
                          </div>

                          <label className="inline-flex items-center gap-2 font-semibold cursor-pointer">
                            <input
                              type="checkbox"
                              data-testid={`admin-country-zip-support-${countryCfg.code}`}
                              checked={countryCfg.supportsZipAutocomplete}
                              onChange={(e) => {
                                const next = [...supportedCountries];
                                next[idx] = {
                                  ...countryCfg,
                                  supportsZipAutocomplete: e.target.checked,
                                };
                                setSupportedCountries(next);
                              }}
                              aria-label={`Supports ZIP Autocomplete for ${countryCfg.code}`}
                              className="rounded"
                            />
                            <span>Supports ZIP Autocomplete</span>
                          </label>
                        </div>
                      );
                    })}
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-5 gap-2 pt-2 border-t border-slate-200 dark:border-slate-700 items-center">
                    <Input
                      data-testid="admin-new-country-code"
                      value={newCountryCode}
                      onChange={(e) => setNewCountryCode(e.target.value)}
                      placeholder="ISO Code (e.g. NL)"
                      maxLength={3}
                    />
                    <Input
                      data-testid="admin-new-country-name"
                      value={newCountryName}
                      onChange={(e) => setNewCountryName(e.target.value)}
                      placeholder="Country Name (EN)"
                    />
                    <Input
                      data-testid="admin-new-country-name-he"
                      value={newCountryNameHe}
                      onChange={(e) => setNewCountryNameHe(e.target.value)}
                      placeholder="Country Name (HE)"
                    />
                    <label className="inline-flex items-center gap-1.5 text-xs font-semibold cursor-pointer">
                      <input
                        type="checkbox"
                        data-testid="admin-new-country-supports-zip"
                        checked={newCountrySupportsZip}
                        onChange={(e) =>
                          setNewCountrySupportsZip(e.target.checked)
                        }
                      />
                      <span>Supports ZIP API</span>
                    </label>
                    <Button
                      type="button"
                      variant="secondary"
                      size="sm"
                      data-testid="admin-add-country-btn"
                      onClick={handleAddSupportedCountry}
                    >
                      <Plus className="w-3.5 h-3.5" />
                      <span>Add Country</span>
                    </Button>
                  </div>
                </div>

                <Button type="submit" data-testid="admin-save-metadata-btn">
                  <Save className="w-4 h-4" />
                  <span>Save Store Metadata &amp; Delivery Options</span>
                </Button>
              </form>
            </CardContent>
          </Card>

          {/* Configurable Premium Classes Card */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-lg">
                <Crown className="w-5 h-5 text-amber-500" />
                <span>
                  Configurable Premium Classes &amp; Discounts (1-Month Rolling
                  Points)
                </span>
              </CardTitle>
              <CardDescription>
                Configure points-reachable classes or Admin-only
                Special/Affiliate classes (not reachable by points).
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <form
                onSubmit={handleSavePremiumClass}
                className="grid grid-cols-1 sm:grid-cols-5 gap-3 items-end"
              >
                <Input
                  data-testid="admin-class-id"
                  value={clsId}
                  onChange={(e) => setClsId(e.target.value)}
                  placeholder="Class ID (e.g. platinum)"
                  required
                />
                <Input
                  data-testid="admin-class-name"
                  value={clsName}
                  onChange={(e) => setClsName(e.target.value)}
                  placeholder="Class Name (e.g. Platinum)"
                  required
                />
                <Input
                  type="number"
                  min={0}
                  max={100}
                  data-testid="admin-class-discount"
                  value={clsDiscount}
                  onChange={(e) => setClsDiscount(e.target.value)}
                  placeholder="Discount %"
                  required
                />
                {clsReachable ? (
                  <Input
                    type="number"
                    min={1}
                    data-testid="admin-class-min-points"
                    value={clsMinPoints}
                    onChange={(e) => setClsMinPoints(e.target.value)}
                    placeholder="1-Month Min Points"
                    required
                  />
                ) : (
                  <div className="text-xs text-amber-500 font-semibold py-2">
                    Special / Affiliate (Admin-Assigned Only)
                  </div>
                )}
                <div className="flex flex-col gap-2">
                  <label className="flex items-center gap-1.5 text-xs font-semibold cursor-pointer">
                    <input
                      type="checkbox"
                      data-testid="admin-class-reachable"
                      checked={clsReachable}
                      onChange={(e) => setClsReachable(e.target.checked)}
                    />
                    <span>Reachable by Points</span>
                  </label>
                  <Button
                    type="submit"
                    size="sm"
                    data-testid="admin-save-class-btn"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    <span>Save Class</span>
                  </Button>
                </div>
              </form>

              <div className="space-y-2">
                {premiumClasses.map((cls) => (
                  <div
                    key={cls.id}
                    data-testid={`admin-premium-class-${cls.id}`}
                    className="flex flex-wrap items-center justify-between gap-3 p-3 rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-800"
                  >
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-bold text-sm">{cls.name}</span>
                      <Badge variant="emerald">
                        {cls.discountPercent}% Discount
                      </Badge>
                      {cls.isPointsReachable ? (
                        <Badge variant="default">
                          Min Points (1 Month): {cls.minPoints}
                        </Badge>
                      ) : (
                        <Badge variant="amber">
                          Special / Affiliate (Admin-Assigned Only)
                        </Badge>
                      )}
                    </div>
                    <Button
                      variant="destructive"
                      size="sm"
                      onClick={() => handleDeletePremiumClass(cls.id)}
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                      <span>Remove</span>
                    </Button>
                  </div>
                ))}
              </div>

              {/* Assign / Remove User Special or Affiliate Class */}
              <div className="pt-4 border-t border-slate-200 dark:border-slate-800 space-y-3">
                <div className="flex items-center justify-between">
                  <h4 className="font-bold text-sm">
                    Assign or Remove User from Special / Affiliate Class
                  </h4>
                  {assignSaved && (
                    <span
                      data-testid="admin-assign-saved-msg"
                      className="text-xs font-semibold text-emerald-500 flex items-center gap-1"
                    >
                      <CheckCircle2 className="w-4 h-4" />
                      User class assignment updated!
                    </span>
                  )}
                </div>
                <form
                  onSubmit={handleAssignUserClass}
                  className="grid grid-cols-1 sm:grid-cols-3 gap-3"
                >
                  <Input
                    type="email"
                    data-testid="admin-assign-email"
                    value={assignEmail}
                    onChange={(e) => setAssignEmail(e.target.value)}
                    placeholder="User email (e.g. guest@local)"
                    required
                  />
                  <select
                    data-testid="admin-assign-class-select"
                    value={assignClassId}
                    onChange={(e) => setAssignClassId(e.target.value)}
                    className="h-10 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 px-3 text-xs font-semibold"
                  >
                    <option value="">
                      Remove Assignment (Use 1-Month Points)
                    </option>
                    {premiumClasses.map((cls) => (
                      <option key={cls.id} value={cls.id}>
                        {cls.name} ({cls.discountPercent}% discount)
                      </option>
                    ))}
                  </select>
                  <Button type="submit" data-testid="admin-assign-btn">
                    <Save className="w-4 h-4" />
                    <span>Apply User Class</span>
                  </Button>
                </form>
              </div>
            </CardContent>
          </Card>

          {/* Blog Posts Management (Only Admin can add/delete posts) */}
          <Card data-testid="admin-blog-card">
            <CardHeader>
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle className="flex items-center gap-2">
                    <Edit3 className="w-5 h-5 text-amber-500" />
                    <span>Store Blog Posts (Admin Only)</span>
                  </CardTitle>
                  <CardDescription>
                    Publish new blog articles to the public{" "}
                    <code className="font-mono">/blog</code> user page. Only
                    authenticated admins can create or delete posts.
                  </CardDescription>
                </div>
                {blogSavedMsg && (
                  <span
                    data-testid="admin-blog-saved-msg"
                    className="text-xs font-semibold text-emerald-500 flex items-center gap-1"
                  >
                    <CheckCircle2 className="w-4 h-4" />
                    {blogSavedMsg}
                  </span>
                )}
              </div>
            </CardHeader>
            <CardContent className="space-y-5">
              <form
                onSubmit={adminActionForm.handleSubmit(async () => {
                  if (!adminToken || !blogSlug.trim() || !blogTitle.trim()) return;
                  setBlogSavedMsg(null);
                  const res = await fetch("/api/blog", {
                    method: "POST",
                    headers: {
                      "Content-Type": "application/json",
                      "x-admin-token": adminToken,
                    },
                    body: JSON.stringify({
                      slug: blogSlug.trim(),
                      title: blogTitle.trim(),
                      title_he: blogTitleHe.trim() || blogTitle.trim(),
                      content: blogContent.trim(),
                      content_he: blogContentHe.trim() || blogContent.trim(),
                      imageUrl: blogImageUrl.trim() || undefined,
                      author: "Dockside Keep Admin",
                    }),
                  });
                  if (res.ok) {
                    setBlogSlug("");
                    setBlogTitle("");
                    setBlogTitleHe("");
                    setBlogContent("");
                    setBlogContentHe("");
                    setBlogImageUrl("");
                    setBlogSavedMsg("Blog post published!");
                    await loadDashboardData();
                  }
                })}
                className="space-y-3 p-4 rounded-xl bg-slate-50 dark:bg-slate-900/60 border border-slate-200 dark:border-slate-800"
              >
                <h4 className="font-bold text-sm">Publish New Blog Post</h4>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  <div>
                    <label className="block text-xs font-semibold mb-1">
                      Post Slug
                    </label>
                    <Input
                      data-testid="admin-blog-slug"
                      value={blogSlug}
                      onChange={(e) => setBlogSlug(e.target.value)}
                      placeholder="e.g. commander-deckbuilding-guide"
                      required
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold mb-1">
                      Title (English)
                    </label>
                    <Input
                      data-testid="admin-blog-title"
                      value={blogTitle}
                      onChange={(e) => setBlogTitle(e.target.value)}
                      placeholder="Post Title"
                      required
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold mb-1">
                      Title (Hebrew)
                    </label>
                    <Input
                      data-testid="admin-blog-title-he"
                      value={blogTitleHe}
                      onChange={(e) => setBlogTitleHe(e.target.value)}
                      placeholder="כותרת הפוסט"
                    />
                  </div>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-semibold mb-1">
                      Content (English)
                    </label>
                    <textarea
                      data-testid="admin-blog-content"
                      rows={3}
                      value={blogContent}
                      onChange={(e) => setBlogContent(e.target.value)}
                      placeholder="Write your blog article here..."
                      required
                      className="w-full rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-2.5 text-xs"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold mb-1">
                      Content (Hebrew)
                    </label>
                    <textarea
                      data-testid="admin-blog-content-he"
                      rows={3}
                      value={blogContentHe}
                      onChange={(e) => setBlogContentHe(e.target.value)}
                      placeholder="תוכן הפוסט בעברית..."
                      className="w-full rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-2.5 text-xs"
                    />
                  </div>
                </div>
                <div className="flex flex-wrap items-end gap-3">
                  <div className="flex-1 min-w-[220px]">
                    <label className="block text-xs font-semibold mb-1">
                      Image URL (Optional)
                    </label>
                    <Input
                      data-testid="admin-blog-image"
                      value={blogImageUrl}
                      onChange={(e) => setBlogImageUrl(e.target.value)}
                      placeholder="/images/mtg-commander.svg"
                    />
                  </div>
                  <Button type="submit" data-testid="admin-add-blog-btn">
                    <Plus className="w-4 h-4" />
                    <span>Publish Blog Post</span>
                  </Button>
                </div>
              </form>

              <div className="space-y-2.5">
                {blogPosts.map((post) => (
                  <div
                    key={post.slug}
                    data-testid={`admin-blog-row-${post.slug}`}
                    className="flex flex-wrap items-center justify-between gap-3 p-3.5 rounded-xl bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800"
                  >
                    <div>
                      <div className="font-bold text-sm">
                        {post.title}{" "}
                        {post.title_he ? `(${post.title_he})` : ""}
                      </div>
                      <div className="text-xs text-slate-500 font-mono">
                        Slug: {post.slug} • Published:{" "}
                        {String(post.createdAtUtc || post.publishedAtUtc || "").slice(0, 10)}
                      </div>
                    </div>
                    <Button
                      variant="destructive"
                      size="sm"
                      data-testid={`admin-delete-blog-${post.slug}`}
                      onClick={async () => {
                        if (!adminToken) return;
                        const res = await fetch(
                          `/api/blog?slug=${encodeURIComponent(post.slug)}`,
                          {
                            method: "DELETE",
                            headers: { "x-admin-token": adminToken },
                          }
                        );
                        if (res.ok) {
                          await loadDashboardData();
                        }
                      }}
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                      <span>Delete</span>
                    </Button>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>

          {/* Admin Team & Privileges Management (Owner Root Admin Only) */}
          {(!currentAdmin ||
            currentAdmin.role === "owner" ||
            currentAdmin.privileges.includes("manage_admins")) && (
            <Card data-testid="admin-team-card">
              <CardHeader>
                <div className="flex items-center justify-between">
                  <div>
                    <CardTitle className="flex items-center gap-2">
                      <ShieldAlert className="w-5 h-5 text-amber-500" />
                      <span>
                        Admin Levels &amp; Privileges Management (Root Owner
                        Only)
                      </span>
                    </CardTitle>
                    <CardDescription>
                      As the root <strong>Owner</strong> (Level 100), you can
                      create lower-privilege sub-admins (Manager, Editor,
                      Support) and configure their exact section privileges.
                    </CardDescription>
                  </div>
                  {subAdminSavedMsg && (
                    <span
                      data-testid="subadmin-saved-msg"
                      className="text-xs font-semibold text-emerald-500 flex items-center gap-1"
                    >
                      <CheckCircle2 className="w-4 h-4" />
                      {subAdminSavedMsg}
                    </span>
                  )}
                </div>
              </CardHeader>
              <CardContent className="space-y-5">
                {subAdminErrorMsg && (
                  <div className="p-3 rounded-xl bg-rose-500/10 border border-rose-500/30 text-rose-500 text-xs font-semibold">
                    {subAdminErrorMsg}
                  </div>
                )}

                <form
                  onSubmit={adminActionForm.handleSubmit(async () => {
                    if (!adminToken || !subAdminUsername.trim()) return;
                    setSubAdminSavedMsg(null);
                    setSubAdminErrorMsg(null);
                    const selectedPrivs = Object.entries(subAdminPrivs)
                      .filter(([, enabled]) => enabled)
                      .map(([k]) => k);
                    const res = await fetch("/api/admin", {
                      method: "PUT",
                      headers: {
                        "Content-Type": "application/json",
                        "x-admin-token": adminToken,
                      },
                      body: JSON.stringify({
                        username: subAdminUsername.trim(),
                        password: subAdminPassword.trim(),
                        role: subAdminRole,
                        privileges: selectedPrivs,
                      }),
                    });
                    const data = await res.json();
                    if (!res.ok) {
                      setSubAdminErrorMsg(
                        data.error || "Failed to save sub-admin"
                      );
                      return;
                    }
                    setSubAdminUsername("");
                    setSubAdminPassword("");
                    setSubAdminSavedMsg(
                      `Sub-admin '${data.subAdmin?.username}' saved!`
                    );
                    await loadDashboardData();
                  })}
                  className="space-y-4 p-4 rounded-xl bg-slate-50 dark:bg-slate-900/60 border border-slate-200 dark:border-slate-800"
                >
                  <h4 className="font-bold text-sm">
                    Add or Update Lower-Privilege Admin
                  </h4>
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                    <div>
                      <label className="block text-xs font-semibold mb-1">
                        Admin Username
                      </label>
                      <Input
                        data-testid="subadmin-username"
                        value={subAdminUsername}
                        onChange={(e) => setSubAdminUsername(e.target.value)}
                        placeholder="e.g. event_manager"
                        required
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-semibold mb-1">
                        Password
                      </label>
                      <Input
                        type="password"
                        data-testid="subadmin-password"
                        value={subAdminPassword}
                        onChange={(e) => setSubAdminPassword(e.target.value)}
                        placeholder="Password for sub-admin"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-semibold mb-1">
                        Admin Level / Role
                      </label>
                      <select
                        data-testid="subadmin-role"
                        value={subAdminRole}
                        onChange={(e) => {
                          const nextRole = e.target.value;
                          setSubAdminRole(nextRole);
                          if (nextRole === "manager") {
                            setSubAdminPrivs({
                              inventory: true,
                              events: true,
                              metadata: true,
                              blog: true,
                            });
                          } else if (nextRole === "editor") {
                            setSubAdminPrivs({
                              inventory: true,
                              events: true,
                              metadata: false,
                              blog: true,
                            });
                          } else {
                            setSubAdminPrivs({
                              inventory: false,
                              events: true,
                              metadata: false,
                              blog: false,
                            });
                          }
                        }}
                        className="w-full h-10 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 px-3 text-xs font-semibold"
                      >
                        <option value="manager">
                          Manager (Level 70 — Full Store Operations)
                        </option>
                        <option value="editor">
                          Editor (Level 50 — Inventory, Events &amp; Blog)
                        </option>
                        <option value="support">
                          Support / Event Staff (Level 30 — Events Only)
                        </option>
                      </select>
                    </div>
                  </div>

                  <div className="flex flex-wrap items-center justify-between gap-3 pt-1">
                    <div className="flex flex-wrap items-center gap-4 text-xs font-semibold">
                      <span className="text-slate-500">
                        Granted Privileges:
                      </span>
                      {(
                        [
                          ["inventory", "Inventory & CSV"],
                          ["events", "Events & Tickets"],
                          ["metadata", "Metadata & Loyalty"],
                          ["blog", "Blog Publishing"],
                        ] as const
                      ).map(([privKey, label]) => (
                        <label
                          key={privKey}
                          className="flex items-center gap-1.5 cursor-pointer"
                        >
                          <input
                            type="checkbox"
                            data-testid={`subadmin-priv-${privKey}`}
                            checked={Boolean(subAdminPrivs[privKey])}
                            onChange={(e) =>
                              setSubAdminPrivs((prev) => ({
                                ...prev,
                                [privKey]: e.target.checked,
                              }))
                            }
                            className="rounded border-slate-300"
                          />
                          <span>{label}</span>
                        </label>
                      ))}
                    </div>

                    <Button type="submit" data-testid="create-subadmin-btn">
                      <Plus className="w-4 h-4" />
                      <span>Save Sub-Admin</span>
                    </Button>
                  </div>
                </form>

                <div className="space-y-2.5">
                  {adminsList.map((adm) => (
                    <div
                      key={adm.username}
                      data-testid={`admin-account-row-${adm.username}`}
                      className="flex flex-wrap items-center justify-between gap-3 p-3.5 rounded-xl bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800"
                    >
                      <div className="flex flex-wrap items-center gap-2.5">
                        <span className="font-bold text-sm">{adm.username}</span>
                        <Badge
                          variant={adm.role === "owner" ? "amber" : "default"}
                        >
                          {adm.role.toUpperCase()} (Level {adm.level})
                        </Badge>
                        <Badge
                          variant="outline"
                          data-testid={`admin-auth0-badge-${adm.username}`}
                        >
                          Auth0 ({adm.auth0Sub || `auth0|admin|${adm.username}`})
                        </Badge>
                        <div className="flex flex-wrap items-center gap-1">
                          {(adm.privileges || []).map((p: string) => (
                            <span
                              key={p}
                              className="px-2 py-0.5 rounded-md bg-slate-200/70 dark:bg-slate-800 text-[11px] font-mono"
                            >
                              {p}
                            </span>
                          ))}
                        </div>
                      </div>
                      {adm.role === "owner" ? (
                        <Badge variant="outline">
                          <Lock className="w-3 h-3 mr-1" />
                          Root Owner (Protected)
                        </Badge>
                      ) : (
                        <Button
                          variant="destructive"
                          size="sm"
                          data-testid={`delete-subadmin-${adm.username}`}
                          onClick={async () => {
                            if (!adminToken) return;
                            const res = await fetch(
                              `/api/admin?username=${encodeURIComponent(
                                adm.username
                              )}`,
                              {
                                method: "DELETE",
                                headers: { "x-admin-token": adminToken },
                              }
                            );
                            if (res.ok) {
                              await loadDashboardData();
                            }
                          }}
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                          <span>Remove Admin</span>
                        </Button>
                      )}
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}
        </div>
      )}

      {/* ===================================================================== */}
      {/* IMMUTABLE ADMIN AUDIT / CHANGE LOGS (FROZEN RAW SNAPSHOTS)            */}
      {/* ===================================================================== */}
      <Card data-testid="admin-audit-logs-card">
        <CardHeader>
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div>
              <CardTitle className="flex items-center gap-2">
                <ShieldAlert className="w-5 h-5 text-brand-500" />
                <span>
                  Admin Audit &amp; Change Logs (Frozen Raw Value Snapshots)
                </span>
              </CardTitle>
              <CardDescription>
                Every admin action on changeable items records an immutable
                audit log row with deeply frozen (<code>Object.freeze</code>)
                before/after values. Total logs: {auditLogs.length}
              </CardDescription>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <select
                data-testid="audit-filter-type"
                value={auditFilterType}
                onChange={(e) => setAuditFilterType(e.target.value)}
                className="h-9 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 px-3 text-xs font-semibold"
              >
                <option value="all">All Entity Types</option>
                <option value="item">Store Items (item)</option>
                <option value="event">Events (event)</option>
                <option value="metadata">Metadata &amp; Delivery (metadata)</option>
                <option value="premium_class">
                  Loyalty Classes (premium_class)
                </option>
                <option value="user_premium_assignment">
                  User Class Assignments
                </option>
                <option value="blog_post">Blog Posts (blog_post)</option>
                <option value="admin_account">
                  Admin Accounts (admin_account)
                </option>
              </select>
              <Input
                data-testid="audit-search-input"
                value={auditSearchQuery}
                onChange={(e) => setAuditSearchQuery(e.target.value)}
                placeholder="Filter by slug, admin, summary..."
                className="h-9 w-56 text-xs"
              />
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <div
            data-testid="audit-logs-list"
            className="space-y-3 max-h-[520px] overflow-y-auto pr-1"
          >
            {auditLogs
              .filter((log) =>
                auditFilterType === "all"
                  ? true
                  : log.entityType === auditFilterType
              )
              .filter((log) => {
                if (!auditSearchQuery.trim()) return true;
                const q = auditSearchQuery.toLowerCase();
                return (
                  String(log.entityId || "")
                    .toLowerCase()
                    .includes(q) ||
                  String(log.adminUsername || "")
                    .toLowerCase()
                    .includes(q) ||
                  String(log.summary || "")
                    .toLowerCase()
                    .includes(q)
                );
              })
              .map((log) => (
                <div
                  key={log.id}
                  data-testid={`audit-log-row-${log.entityId}`}
                  className="p-3.5 rounded-xl bg-slate-50 dark:bg-slate-900/90 border border-slate-200 dark:border-slate-800 space-y-2"
                >
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="flex flex-wrap items-center gap-2">
                      <Badge
                        variant={
                          log.action === "delete"
                            ? "amber"
                            : log.action === "create" ||
                                log.action === "bulk-csv"
                              ? "emerald"
                              : "default"
                        }
                      >
                        {String(log.action).toUpperCase()}
                      </Badge>
                      <Badge variant="outline">
                        {log.entityType}: {log.entityId}
                      </Badge>
                      <span className="text-xs font-bold text-slate-800 dark:text-slate-200">
                        {log.summary}
                      </span>
                    </div>
                    <div className="text-xs text-slate-500 font-mono">
                      By <strong>{log.adminUsername}</strong> ({log.adminRole}) •{" "}
                      {log.createdAtUtc}
                    </div>
                  </div>
                  <pre
                    data-testid={`audit-log-raw-${log.entityId}`}
                    className="p-2.5 rounded-lg bg-slate-950 text-emerald-300 text-[11px] font-mono overflow-x-auto max-h-44"
                  >
                    {JSON.stringify(log.frozenData, null, 2)}
                  </pre>
                </div>
              ))}
            {auditLogs.length === 0 && (
              <p className="text-xs text-slate-500 py-4 text-center">
                No admin audit logs recorded yet.
              </p>
            )}
          </div>
        </CardContent>
      </Card>

      {/* ===================================================================== */}
      {/* OPENTELEMETRY -> SELF-HOSTED GRAFANA, LOKI & PROMETHEUS               */}
      {/* ===================================================================== */}
      <Card data-testid="admin-otel-card">
        <CardHeader>
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div>
              <CardTitle className="flex items-center gap-2">
                <Settings className="w-5 h-5 text-emerald-500" />
                <span>
                  OpenTelemetry Observability → Self-Hosted Grafana, Loki &amp;
                  Prometheus
                </span>
              </CardTitle>
              <CardDescription>
                Application metrics and structured W3C trace/span logs are
                exported via <code>@opentelemetry/api</code> to self-hosted{" "}
                <strong>Prometheus (:9090)</strong>,{" "}
                <strong>Loki (:3100)</strong>, and{" "}
                <strong>Grafana (:3001)</strong>.
              </CardDescription>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <a
                href="http://localhost:3001/d/dockside-keep-otel"
                target="_blank"
                rel="noopener noreferrer"
                data-testid="otel-grafana-link"
                className="px-3 py-1.5 rounded-xl bg-amber-500/15 text-amber-600 dark:text-amber-400 text-xs font-bold border border-amber-500/30 hover:bg-amber-500/25"
              >
                Open Self-Hosted Grafana (:3001)
              </a>
              <a
                href="http://localhost:9090"
                target="_blank"
                rel="noopener noreferrer"
                data-testid="otel-prometheus-link"
                className="px-3 py-1.5 rounded-xl bg-brand-500/15 text-brand-600 dark:text-brand-400 text-xs font-bold border border-brand-500/30 hover:bg-brand-500/25"
              >
                Open Prometheus (:9090)
              </a>
              <a
                href="/api/telemetry?format=prometheus"
                target="_blank"
                rel="noopener noreferrer"
                data-testid="otel-raw-metrics-link"
                className="px-3 py-1.5 rounded-xl bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 text-xs font-bold border border-emerald-500/30 hover:bg-emerald-500/25"
              >
                Raw Prometheus Feed
              </a>
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          {otelSnapshot && (
            <>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                <div className="p-3 rounded-xl bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800">
                  <div className="text-[11px] text-slate-500 font-semibold">
                    OTel Service Resource
                  </div>
                  <div
                    data-testid="otel-service-name"
                    className="text-sm font-extrabold font-mono mt-0.5"
                  >
                    {otelSnapshot.resource?.serviceName}
                  </div>
                </div>
                <div className="p-3 rounded-xl bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800">
                  <div className="text-[11px] text-slate-500 font-semibold">
                    Audit Logs Counter
                  </div>
                  <div
                    data-testid="otel-counter-audit"
                    className="text-lg font-extrabold text-amber-500 mt-0.5"
                  >
                    {otelSnapshot.counters?.dockside_admin_audit_logs_total ?? 0}
                  </div>
                </div>
                <div className="p-3 rounded-xl bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800">
                  <div className="text-[11px] text-slate-500 font-semibold">
                    HTTP Requests Counter
                  </div>
                  <div
                    data-testid="otel-counter-http"
                    className="text-lg font-extrabold text-brand-500 mt-0.5"
                  >
                    {otelSnapshot.counters?.dockside_http_requests_total ?? 0}
                  </div>
                </div>
                <div className="p-3 rounded-xl bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800">
                  <div className="text-[11px] text-slate-500 font-semibold">
                    Loki Push Endpoint
                  </div>
                  <div className="text-xs font-mono truncate mt-1">
                    {otelSnapshot.resource?.exporterTargets?.lokiPushEndpoint}
                  </div>
                </div>
              </div>

              <div
                data-testid="otel-logs-list"
                className="space-y-2 max-h-60 overflow-y-auto pr-1"
              >
                {(otelSnapshot.logs || []).slice(0, 15).map((entry: any) => (
                  <div
                    key={entry.id}
                    className="flex flex-wrap items-center justify-between gap-2 p-2.5 rounded-lg bg-slate-50 dark:bg-slate-900/70 border border-slate-200 dark:border-slate-800 text-xs"
                  >
                    <div className="flex flex-wrap items-center gap-2">
                      <Badge
                        variant={
                          entry.severityText === "ERROR" ? "amber" : "emerald"
                        }
                      >
                        {entry.severityText}
                      </Badge>
                      <span className="font-mono text-[11px] text-brand-500">
                        [{entry.category}]
                      </span>
                      <span className="font-semibold">{entry.body}</span>
                    </div>
                    <div className="text-[11px] text-slate-500 font-mono">
                      traceId={String(entry.traceId).slice(0, 12)}… •{" "}
                      {entry.timestampUtc}
                    </div>
                  </div>
                ))}
              </div>

              {/* Feature Usage Analytics & Error Investigation */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-2 border-t border-slate-200 dark:border-slate-800">
                <div
                  data-testid="otel-feature-usage-list"
                  className="p-3 rounded-xl bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 space-y-2"
                >
                  <div className="text-xs font-bold text-slate-700 dark:text-slate-300">
                    Feature Usage Metrics (dockside_feature_usage_total)
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    {Object.entries(otelSnapshot.featureUsage || {}).map(
                      ([feat, cnt]) => (
                        <Badge key={feat} variant="secondary">
                          {feat}: {String(cnt)}
                        </Badge>
                      )
                    )}
                  </div>
                </div>

                <div
                  data-testid="otel-error-investigations-list"
                  className="p-3 rounded-xl bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 space-y-2"
                >
                  <div className="text-xs font-bold text-slate-700 dark:text-slate-300">
                    Error Investigations (dockside_feature_errors_total)
                  </div>
                  <div className="space-y-1 text-[11px] font-mono">
                    {(otelSnapshot.errorInvestigations || [])
                      .slice(0, 5)
                      .map((err: any) => (
                        <div
                          key={err.id}
                          className="text-rose-500 truncate"
                        >
                          [{err.httpStatus}] {err.route}: {err.errorMessage}{" "}
                          (trace={String(err.traceId).slice(0, 8)})
                        </div>
                      ))}
                    {(otelSnapshot.errorInvestigations || []).length === 0 && (
                      <div className="text-slate-400">
                        0 errors captured in current window
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

export default function AdminPortalPage() {
  return (
    <Suspense fallback={<div className="p-12 text-center">Loading...</div>}>
      <AdminPortalContent />
    </Suspense>
  );
}
