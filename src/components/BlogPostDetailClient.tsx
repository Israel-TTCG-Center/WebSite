"use client";

import React from "react";
import { ArrowLeft, BookOpen, Calendar, User } from "lucide-react";
import { useLanguage } from "@/context/LanguageContext";
import type { StoredBlogPost } from "@/lib/mongodb";
import { AppLink } from "@/components/ui/app-link";
import { Badge } from "@/components/ui/badge";
import { LocalizedTime } from "@/components/ui/localized-time";
import { PageHeader } from "@/components/ui/page-header";

export default function BlogPostDetailClient({
  post,
}: {
  post: StoredBlogPost;
}) {
  const { locale, t } = useLanguage();
  const postTitle =
    locale === "he" && post.title_he ? post.title_he : post.title;
  const postBody =
    locale === "he" && post.content_he ? post.content_he : post.content;

  return (
    <article
      data-testid="blog-post-detail"
      aria-labelledby="blog-detail-heading"
      className="max-w-4xl mx-auto px-4 py-10 space-y-8"
    >
      <nav aria-label="Breadcrumb">
        <AppLink
          href="/blog"
          data-testid="back-to-blog"
          className="inline-flex items-center gap-2 text-sm font-semibold text-brand-600 dark:text-brand-400 hover:underline"
        >
          <ArrowLeft className="w-4 h-4" aria-hidden="true" />
          <span>{t.blogPage.backToBlog}</span>
        </AppLink>
      </nav>

      <div className="rounded-3xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900/80 shadow-xl overflow-hidden">
        {post.imageUrl && (
          <div className="w-full h-72 md:h-96 bg-slate-100 dark:bg-slate-950 overflow-hidden border-b border-slate-200/60 dark:border-slate-800">
            <img
              src={post.imageUrl}
              alt={postTitle}
              data-testid="blog-detail-image"
              className="w-full h-full object-cover"
            />
          </div>
        )}

        <div className="p-8 md:p-12 space-y-6">
          <div className="flex flex-wrap items-center gap-2">
            <Badge className="bg-brand-500/15 border-brand-500/30 text-brand-600 dark:text-brand-400">
              <BookOpen className="w-3.5 h-3.5" aria-hidden="true" />
              <span>{t.blogPage.badge}</span>
            </Badge>
            <Badge variant="secondary">
              <User
                className="w-3.5 h-3.5 text-brand-500"
                aria-hidden="true"
              />
              <span data-testid="blog-detail-author">
                {t.blogPage.publishedBy}: {post.author}
              </span>
            </Badge>
            <Badge variant="default">
              <Calendar
                className="w-3.5 h-3.5 text-emerald-500"
                aria-hidden="true"
              />
              <LocalizedTime
                value={post.createdAtUtc}
                data-testid="blog-detail-date"
              />
            </Badge>
          </div>

          <PageHeader
            variant="plain"
            headingId="blog-detail-heading"
            titleTestId="blog-detail-title"
            title={postTitle}
            className="border-b border-slate-200 dark:border-slate-800 pb-6"
          />

          <div
            data-testid="blog-detail-content"
            className="text-base md:text-lg text-slate-700 dark:text-slate-200 whitespace-pre-line leading-relaxed space-y-4"
          >
            {postBody}
          </div>
        </div>
      </div>
    </article>
  );
}
