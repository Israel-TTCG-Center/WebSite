import type { MetadataRoute } from "next";
import { SITE_NAME } from "@/lib/seo";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: `${SITE_NAME} — Board Games, TCGs & Tournaments`,
    short_name: SITE_NAME,
    description:
      "Shop strategy board games, trading card games, pre-orders, and weekly tournaments at Dockside Keep in Haifa.",
    start_url: "/",
    display: "standalone",
    background_color: "#0f172a",
    theme_color: "#0f766e",
    icons: [
      {
        src: "/icon.svg?v=2",
        sizes: "any",
        type: "image/svg+xml",
      },
      {
        src: "/store-icon.svg?v=2",
        sizes: "any",
        type: "image/svg+xml",
      },
      {
        src: "/favicon.ico?v=2",
        sizes: "32x32",
        type: "image/x-icon",
      },
      {
        src: "/apple-icon",
        sizes: "180x180",
        type: "image/png",
      },
    ],
  };
}
