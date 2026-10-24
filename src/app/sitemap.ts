import type { MetadataRoute } from "next";
import { getAllItems, getPaginatedBlogPosts } from "@/lib/store";
import { SITE_URL } from "@/lib/seo";

export const dynamic = "force-dynamic";

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const now = new Date();
  const baseRoutes: MetadataRoute.Sitemap = [
    {
      url: SITE_URL,
      lastModified: now,
      changeFrequency: "daily",
      priority: 1,
    },
    {
      url: `${SITE_URL}/events`,
      lastModified: now,
      changeFrequency: "daily",
      priority: 0.9,
    },
    {
      url: `${SITE_URL}/blog`,
      lastModified: now,
      changeFrequency: "weekly",
      priority: 0.8,
    },
    {
      url: `${SITE_URL}/contact`,
      lastModified: now,
      changeFrequency: "monthly",
      priority: 0.7,
    },
    {
      url: `${SITE_URL}/privacy`,
      lastModified: now,
      changeFrequency: "monthly",
      priority: 0.6,
    },
  ];

  const [items, blogResult] = await Promise.all([
    getAllItems(undefined, false),
    getPaginatedBlogPosts({ page: 1, pageSize: 50 }),
  ]);

  const itemRoutes: MetadataRoute.Sitemap = items.map((item) => ({
    url: `${SITE_URL}/items/${encodeURIComponent(item.slug)}`,
    lastModified: item.updatedAtUtc ? new Date(item.updatedAtUtc) : now,
    changeFrequency: "daily",
    priority: 0.8,
  }));

  const blogRoutes: MetadataRoute.Sitemap = blogResult.posts.map((post) => ({
    url: `${SITE_URL}/blog/${encodeURIComponent(post.slug)}`,
    lastModified: post.updatedAtUtc ? new Date(post.updatedAtUtc) : now,
    changeFrequency: "weekly",
    priority: 0.7,
  }));

  return [...baseRoutes, ...itemRoutes, ...blogRoutes];
}
