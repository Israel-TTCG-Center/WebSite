"use client";

import React, { useEffect, useState } from "react";
import { ArrowRight, BookOpen, Calendar, User } from "lucide-react";
import { useLanguage } from "@/context/LanguageContext";
import type { BlogPost } from "@/app/api/blog/route";
import { buildBlogPostingJsonLd } from "@/lib/seo";
import { AppLink } from "@/components/ui/app-link";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardHeader,
  CardDescription,
  CardContent,
  CardFooter,
} from "@/components/ui/card";
import { LocalizedTime } from "@/components/ui/localized-time";
import { PageHeader } from "@/components/ui/page-header";
import { PaginationBar } from "@/components/ui/pagination-bar";
import { SeoJsonLd } from "@/components/ui/seo-json-ld";

export default function BlogPage() {
  const { locale, t } = useLanguage();
  const [posts, setPosts] = useState<BlogPost[]>([]);
  const [loading, setLoading] = useState(true);
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(9);
  const [totalItems, setTotalItems] = useState(0);
  const [totalPages, setTotalPages] = useState(1);

  useEffect(() => {
    setLoading(true);
    fetch(`/api/blog?page=${currentPage}&pageSize=${pageSize}`)
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (data?.posts) {
          setPosts(data.posts);
        }
        if (data?.pagination) {
          setTotalItems(Number(data.pagination.totalItems || 0));
          setTotalPages(Math.max(1, Number(data.pagination.totalPages || 1)));
        } else if (data?.posts) {
          setTotalItems(data.posts.length);
          setTotalPages(1);
        }
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [currentPage, pageSize]);

  const startIndex = totalItems === 0 ? 0 : (currentPage - 1) * pageSize + 1;
  const endIndex = Math.min(totalItems, currentPage * pageSize);

  const blogJsonLd = posts.map((post) =>
    buildBlogPostingJsonLd({
      slug: post.slug,
      title: post.title,
      content: post.content,
      createdAtUtc: post.createdAtUtc,
      author: post.author,
    })
  );

  return (
    <div
      data-testid="blog-page"
      className="max-w-5xl mx-auto px-4 py-10 space-y-10"
    >
      {posts.length > 0 && (
        <SeoJsonLd data={blogJsonLd} data-testid="jsonld-blog" />
      )}

      {/* Blog Hero */}
      <PageHeader
        variant="indigo"
        headingId="blog-heading"
        titleTestId="blog-title"
        title={t.blogPage.title}
        subtitle={t.blogPage.subtitle}
        badgeIcon={<BookOpen className="w-3.5 h-3.5" aria-hidden="true" />}
        badgeText={t.blogPage.badge}
      />

      {/* Blog Posts List (Read-only for users; each post card is clickable to view the full post) */}
      <section aria-label="Published community articles">
        {!loading && posts.length === 0 ? (
          <div
            role="status"
            aria-live="polite"
            data-testid="blog-empty-state"
            className="p-12 rounded-2xl border border-dashed border-slate-300 dark:border-slate-800 text-center text-slate-500 dark:text-slate-400"
          >
            {t.blogPage.empty}
          </div>
        ) : (
          <div data-testid="blog-posts-list" className="space-y-6">
            {posts.map((post) => {
              const postTitle =
                locale === "he" && post.title_he ? post.title_he : post.title;
              const postBody =
                locale === "he" && post.content_he
                  ? post.content_he
                  : post.content;

              return (
                <article
                  key={post.slug}
                  aria-labelledby={`blog-post-title-${post.slug}`}
                >
                  <AppLink
                    href={`/blog/${post.slug}`}
                    data-testid={`blog-post-link-${post.slug}`}
                    className="block group focus:outline-none focus:ring-2 focus:ring-brand-500 rounded-2xl"
                  >
                    <Card
                      data-testid={`blog-post-${post.slug}`}
                      className="overflow-hidden hover:border-brand-500/60 hover:shadow-xl transition cursor-pointer"
                    >
                      {post.imageUrl && (
                        <div className="w-full h-56 bg-slate-100 dark:bg-slate-900 overflow-hidden border-b border-slate-200/60 dark:border-slate-800">
                          <img
                            src={post.imageUrl}
                            alt={postTitle}
                            loading="lazy"
                            decoding="async"
                            data-testid={`blog-img-${post.slug}`}
                            className="w-full h-full object-cover group-hover:scale-105 transition duration-500"
                          />
                        </div>
                      )}

                      <CardHeader>
                        <div className="flex flex-wrap items-center gap-2 mb-1">
                          <Badge variant="secondary">
                            <User
                              className="w-3.5 h-3.5 text-brand-500"
                              aria-hidden="true"
                            />
                            <span>
                              {t.blogPage.publishedBy}: {post.author}
                            </span>
                          </Badge>
                          <Badge variant="default">
                            <Calendar
                              className="w-3.5 h-3.5 text-emerald-500"
                              aria-hidden="true"
                            />
                            <LocalizedTime value={post.createdAtUtc} />
                          </Badge>
                        </div>
                        <h2
                          id={`blog-post-title-${post.slug}`}
                          data-testid={`blog-post-title-${post.slug}`}
                          className="text-2xl font-extrabold tracking-tight group-hover:text-brand-500 transition"
                        >
                          {postTitle}
                        </h2>
                      </CardHeader>

                      <CardContent>
                        <CardDescription
                          data-testid={`blog-post-content-${post.slug}`}
                          className="text-sm md:text-base text-slate-700 dark:text-slate-300 whitespace-pre-line leading-relaxed line-clamp-4"
                        >
                          {postBody}
                        </CardDescription>
                      </CardContent>

                      <CardFooter className="pt-0">
                        <span
                          data-testid={`blog-read-more-${post.slug}`}
                          className="inline-flex items-center gap-1.5 text-sm font-bold text-brand-600 dark:text-brand-400 group-hover:underline"
                        >
                          <span>{t.blogPage.readFullPost}</span>
                          <ArrowRight className="w-4 h-4" aria-hidden="true" />
                        </span>
                      </CardFooter>
                    </Card>
                  </AppLink>
                </article>
              );
            })}
          </div>
        )}

        <PaginationBar
          prefix="blog"
          currentPage={currentPage}
          totalPages={totalPages}
          totalItems={totalItems}
          startIndex={startIndex}
          endIndex={endIndex}
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
