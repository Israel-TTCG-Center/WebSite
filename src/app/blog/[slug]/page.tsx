import React from "react";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getBlogPostBySlug } from "@/lib/mongodb";
import BlogPostDetailClient from "@/components/BlogPostDetailClient";
import { buildBlogPostingJsonLd, buildBlogPostMetadata } from "@/lib/seo";
import { SeoJsonLd } from "@/components/ui/seo-json-ld";

export const dynamic = "force-dynamic";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const post = await getBlogPostBySlug(slug);
  if (!post) {
    return buildBlogPostMetadata({
      slug,
      title: "Article Not Found",
      content:
        "Read official store news, tournament recaps, strategy guides, and new release announcements from the Dockside Keep team in Haifa.",
    });
  }
  return buildBlogPostMetadata({
    slug: post.slug,
    title: post.title,
    content: post.content,
    author: post.author,
  });
}

export default async function BlogPostDetailPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const post = await getBlogPostBySlug(slug);

  if (!post) {
    notFound();
  }

  const blogPostJsonLd = buildBlogPostingJsonLd({
    slug: post.slug,
    title: post.title,
    content: post.content,
    createdAtUtc: post.createdAtUtc,
    author: post.author,
  });

  return (
    <>
      <SeoJsonLd data={blogPostJsonLd} data-testid="jsonld-blog-post" />
      <BlogPostDetailClient post={post} />
    </>
  );
}
