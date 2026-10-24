import type { Metadata } from "next";
import { STORE_CONTACT } from "@/lib/i18n";
import { formatPhone } from "@/lib/address";

export const SITE_URL = (
  process.env.NEXT_PUBLIC_SITE_URL || "https://docksidekeep.co.il"
).replace(/\/+$/, "");

export const SITE_NAME = "Dockside Keep";

export type SeoPageKey =
  | "home"
  | "events"
  | "blog"
  | "contact"
  | "privacy"
  | "cart"
  | "account"
  | "login"
  | "admin";

export interface PageSeoEntry {
  key: SeoPageKey;
  path: string;
  title: string; // Strictly < 60 characters
  description: string; // Strictly 150-160 characters
  canonicalUrl: string; // Absolute URL without query parameters
  indexable: boolean;
}

export const PAGE_SEO_CONFIG: Record<SeoPageKey, PageSeoEntry> = {
  home: {
    key: "home",
    path: "/",
    // 50 chars (< 60)
    title: "Dockside Keep | Board Games, TCG & Events in Haifa",
    // 158 chars (150-160)
    description:
      "Shop strategy board games, trading card game boosters, and accessories at Dockside Keep in Haifa. Enjoy fast local delivery, pre-orders, and member discounts.",
    canonicalUrl: `${SITE_URL}/`,
    indexable: true,
  },
  events: {
    key: "events",
    path: "/events",
    // 49 chars (< 60)
    title: "Tournament Schedule & Live Events | Dockside Keep",
    // 156 chars (150-160)
    description:
      "Register for weekly Trading Card Game tournaments, board game nights, and prerelease events at Dockside Keep in Haifa. Reserve your table seat online today.",
    canonicalUrl: `${SITE_URL}/events`,
    indexable: true,
  },
  blog: {
    key: "blog",
    path: "/blog",
    // 50 chars (< 60)
    title: "Community News & Strategy Articles | Dockside Keep",
    // 154 chars (150-160)
    description:
      "Read official announcements, tournament reports, board game strategy guides, and upcoming release news from the Dockside Keep tabletop community in Haifa.",
    canonicalUrl: `${SITE_URL}/blog`,
    indexable: true,
  },
  contact: {
    key: "contact",
    path: "/contact",
    // 47 chars (< 60)
    title: "Visit & Contact Our Haifa Store | Dockside Keep",
    // 155 chars (150-160)
    description:
      "Find opening hours, harbor directions, phone details, and community links for Dockside Keep in Haifa. Reach out to our team for event or product inquiries.",
    canonicalUrl: `${SITE_URL}/contact`,
    indexable: true,
  },
  privacy: {
    key: "privacy",
    path: "/privacy",
    // 50 chars (< 60)
    title: "Privacy Policy, GDPR & CCPA Rights | Dockside Keep",
    // 155 chars (150-160)
    description:
      "Read the Dockside Keep Privacy Policy covering EU GDPR, California CCPA, and Israeli Privacy Law Amendment 13 rights, cookie consent, and data portability.",
    canonicalUrl: `${SITE_URL}/privacy`,
    indexable: true,
  },
  cart: {
    key: "cart",
    path: "/cart",
    // 45 chars (< 60)
    title: "Your Shopping Cart & Checkout | Dockside Keep",
    // 160 chars (150-160)
    description:
      "Review your selected board games, trading card boosters, and pre-order items at Dockside Keep. Choose Haifa store pickup or fast tracked shipping across Israel.",
    canonicalUrl: `${SITE_URL}/cart`,
    indexable: false,
  },
  account: {
    key: "account",
    path: "/account",
    // 50 chars (< 60)
    title: "Member Account, Orders & Addresses | Dockside Keep",
    // 154 chars (150-160)
    description:
      "Manage your Dockside Keep member profile, VIP discount tier, billing details, saved shipping addresses, and past board game or event ticket order history.",
    canonicalUrl: `${SITE_URL}/account`,
    indexable: false,
  },
  login: {
    key: "login",
    path: "/login",
    // 45 chars (< 60)
    title: "Member Sign In & Registration | Dockside Keep",
    // 155 chars (150-160)
    description:
      "Sign in to your Dockside Keep account or register a new member profile in seconds to track orders, save shipping addresses, and unlock VIP store discounts.",
    canonicalUrl: `${SITE_URL}/login`,
    indexable: false,
  },
  admin: {
    key: "admin",
    path: "/admin",
    // 43 chars (< 60)
    title: "Store Administration Portal | Dockside Keep",
    // 157 chars (150-160)
    description:
      "Authorized Dockside Keep administration portal for managing catalog inventory, pre-order pricing, event schedules, community blog posts, and audit telemetry.",
    canonicalUrl: `${SITE_URL}/admin`,
    indexable: false,
  },
};

/**
 * Normalizes any title string to strictly under 60 characters (max 59 chars).
 */
export function clampSeoTitle(rawTitle: string, suffix = " | Dockside Keep"): string {
  const clean = rawTitle.replace(/\s+/g, " ").trim();
  const full = clean.endsWith(suffix) ? clean : `${clean}${suffix}`;
  if (full.length < 60) {
    return full;
  }
  const maxBaseLen = Math.max(10, 59 - suffix.length - 1);
  return `${clean.slice(0, maxBaseLen).trimEnd()}…${suffix}`;
}

/**
 * Normalizes any meta description into the strict 150-160 character SEO window.
 */
export function clampSeoDescription(rawDescription: string, fallbackContext = ""): string {
  const filler =
    " Available at Dockside Keep in Haifa with fast Israel delivery, in-store pickup, pre-order specials, and member loyalty discounts on tabletop games.";
  let text = `${rawDescription} ${fallbackContext}`
    .replace(/\s+/g, " ")
    .trim();

  if (text.length < 150) {
    text = `${text}${filler}`.replace(/\s+/g, " ").trim();
  }
  if (text.length > 160) {
    text = `${text.slice(0, 156).trimEnd()}...`;
  }
  while (text.length < 150) {
    text = `${text} Shop Dockside Keep Haifa.`;
    if (text.length > 160) {
      text = text.slice(0, 158).trimEnd() + ".";
    }
  }
  return text;
}

/**
 * Builds Next.js Metadata object for a static route key.
 */
export function buildPageMetadata(pageKey: SeoPageKey): Metadata {
  const entry = PAGE_SEO_CONFIG[pageKey];
  return {
    applicationName: SITE_NAME,
    title: entry.title,
    description: entry.description,
    alternates: {
      canonical: entry.canonicalUrl,
    },
    robots: {
      index: entry.indexable,
      follow: entry.indexable,
    },
    openGraph: {
      type: "website",
      siteName: SITE_NAME,
      title: entry.title,
      description: entry.description,
      url: entry.canonicalUrl,
      locale: "en_IL",
      alternateLocale: ["he_IL"],
    },
    twitter: {
      card: "summary_large_image",
      title: entry.title,
      description: entry.description,
    },
  };
}

/**
 * Builds Next.js Metadata for a dynamic product detail page (`/items/[slug]`),
 * guaranteeing title < 60 chars, description 150-160 chars, and an absolute canonical URL.
 */
export function buildProductMetadata(item: {
  slug: string;
  title: string;
  description?: string;
  category?: string;
  priceNis?: number;
}): Metadata {
  const canonicalUrl = `${SITE_URL}/items/${encodeURIComponent(item.slug)}`;
  const title = clampSeoTitle(item.title, " | Dockside Keep");
  const contextSuffix = [
    item.category ? `Category: ${item.category}.` : "",
    typeof item.priceNis === "number" ? `Order online for ₪${item.priceNis}.` : "",
  ]
    .filter(Boolean)
    .join(" ");
  const description = clampSeoDescription(
    item.description || `${item.title} tabletop product at Dockside Keep in Haifa.`,
    contextSuffix
  );

  return {
    applicationName: SITE_NAME,
    title,
    description,
    alternates: {
      canonical: canonicalUrl,
    },
    robots: {
      index: true,
      follow: true,
    },
    openGraph: {
      type: "website",
      siteName: SITE_NAME,
      title,
      description,
      url: canonicalUrl,
      locale: "en_IL",
      alternateLocale: ["he_IL"],
    },
    twitter: {
      card: "summary_large_image",
      title,
      description,
    },
  };
}

/**
 * Schema.org JSON-LD for the physical Haifa HobbyShop / LocalBusiness.
 */
export function buildStoreJsonLd() {
  return {
    "@context": "https://schema.org",
    "@type": "HobbyShop",
    "@id": `${SITE_URL}/#store`,
    name: SITE_NAME,
    url: `${SITE_URL}/`,
    logo: `${SITE_URL}/icon.svg`,
    telephone: formatPhone(STORE_CONTACT.phone),
    email: STORE_CONTACT.email,
    priceRange: "₪₪",
    address: {
      "@type": "PostalAddress",
      streetAddress: "Hertz 3",
      addressLocality: "Haifa",
      addressCountry: "IL",
    },
    sameAs: [
      STORE_CONTACT.instagram,
      STORE_CONTACT.facebook,
      STORE_CONTACT.geekguild,
      STORE_CONTACT.mydecklist,
    ],
  };
}

/**
 * Schema.org JSON-LD for an individual Product (`Product` + `Offer`).
 */
export function buildProductJsonLd(item: {
  slug: string;
  title: string;
  description?: string;
  imageUrl?: string;
  category?: string;
  priceNis: number;
  currency?: string;
  quantity?: number;
  availabilityMode?: "available" | "pre_order" | "OutOfStock";
}) {
  const url = `${SITE_URL}/items/${encodeURIComponent(item.slug)}`;
  let availability = "https://schema.org/InStock";
  if (item.availabilityMode === "pre_order") {
    availability = "https://schema.org/PreOrder";
  } else if ((item.quantity ?? 1) <= 0 || item.availabilityMode === "OutOfStock") {
    availability = "https://schema.org/OutOfStock";
  }

  return {
    "@context": "https://schema.org",
    "@type": "Product",
    sku: item.slug,
    name: item.title,
    description: item.description || item.title,
    image: item.imageUrl
      ? item.imageUrl.startsWith("http")
        ? item.imageUrl
        : `${SITE_URL}${item.imageUrl}`
      : `${SITE_URL}/icon.svg`,
    category: item.category || "Board Games & TCG",
    brand: {
      "@type": "Brand",
      name: SITE_NAME,
    },
    offers: {
      "@type": "Offer",
      url,
      priceCurrency: item.currency || "ILS",
      price: item.priceNis,
      availability,
      seller: {
        "@type": "Organization",
        name: SITE_NAME,
      },
    },
  };
}

/**
 * Schema.org JSON-LD for a Tournament / Live Event.
 */
export function buildEventJsonLd(event: {
  slug: string;
  title: string;
  description?: string;
  eventDate?: string;
  priceNis?: number;
}) {
  return {
    "@context": "https://schema.org",
    "@type": "Event",
    name: event.title,
    description: event.description || event.title,
    startDate: event.eventDate || new Date().toISOString(),
    eventAttendanceMode: "https://schema.org/OfflineEventAttendanceMode",
    eventStatus: "https://schema.org/EventScheduled",
    location: {
      "@type": "Place",
      name: SITE_NAME,
      address: {
        "@type": "PostalAddress",
        streetAddress: "Hertz 3",
        addressLocality: "Haifa",
        addressCountry: "IL",
      },
    },
    offers: {
      "@type": "Offer",
      url: `${SITE_URL}/events`,
      priceCurrency: "ILS",
      price: event.priceNis ?? 0,
      availability: "https://schema.org/InStock",
    },
  };
}

/**
 * Build dynamic SEO metadata for an individual `/blog/[slug]` article page.
 * Guarantees:
 * - Title < 60 chars
 * - Description 150-160 chars
 * - Absolute canonical URL (`https://docksidekeep.co.il/blog/<slug>`)
 */
export function buildBlogPostMetadata(post: {
  slug: string;
  title: string;
  content?: string;
  author?: string;
}): Metadata {
  const canonicalUrl = `${SITE_URL}/blog/${encodeURIComponent(post.slug)}`;
  const title = clampSeoTitle(post.title, " | Dockside Keep");
  const contextSuffix = post.author
    ? `Published by ${post.author} at Dockside Keep in Haifa.`
    : "Read the full community article at Dockside Keep in Haifa.";
  const description = clampSeoDescription(
    post.content || `${post.title} — community blog article at Dockside Keep in Haifa.`,
    contextSuffix
  );

  return {
    applicationName: SITE_NAME,
    title,
    description,
    alternates: {
      canonical: canonicalUrl,
    },
    robots: {
      index: true,
      follow: true,
    },
    openGraph: {
      type: "article",
      siteName: SITE_NAME,
      title,
      description,
      url: canonicalUrl,
      locale: "en_IL",
      alternateLocale: ["he_IL"],
    },
    twitter: {
      card: "summary_large_image",
      title,
      description,
    },
  };
}

/**
 * Schema.org JSON-LD for a Community Blog Post (`BlogPosting`).
 */
export function buildBlogPostingJsonLd(post: {
  slug: string;
  title: string;
  content: string;
  createdAtUtc?: string;
  author?: string;
}) {
  return {
    "@context": "https://schema.org",
    "@type": "BlogPosting",
    headline: post.title,
    articleBody: post.content,
    datePublished: post.createdAtUtc || new Date().toISOString(),
    author: {
      "@type": "Organization",
      name: post.author || SITE_NAME,
    },
    publisher: {
      "@type": "Organization",
      name: SITE_NAME,
      logo: {
        "@type": "ImageObject",
        url: `${SITE_URL}/icon.svg`,
      },
    },
    mainEntityOfPage: {
      "@type": "WebPage",
      "@id": `${SITE_URL}/blog/${encodeURIComponent(post.slug)}`,
    },
  };
}
