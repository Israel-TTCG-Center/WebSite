import { NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { getBlogPostBySlug, getPaginatedBlogPosts } from "@/lib/store";
import {
  resolveAdminSessionFromRequest,
  hasAdminPrivilege,
  recordAdminAuditLog,
} from "@/lib/admin";
import { recordErrorInvestigation, recordFeatureUsage } from "@/lib/otel";
import { nowUtcIso } from "@/lib/premium";

export interface BlogPost {
  _id?: string;
  slug: string;
  title: string;
  title_he?: string;
  content: string;
  content_he?: string;
  imageUrl?: string;
  author: string;
  createdAtUtc: string;
  updatedAtUtc: string;
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const slugParam = searchParams.get("slug");
  if (slugParam) {
    const post = await getBlogPostBySlug(slugParam);
    if (!post) {
      return NextResponse.json({ error: "Blog post not found" }, { status: 404 });
    }
    return NextResponse.json({ post });
  }

  const page = searchParams.get("page") ? Number(searchParams.get("page")) : 1;
  const pageSize = searchParams.get("pageSize")
    ? Number(searchParams.get("pageSize"))
    : 6;

  const { posts, pagination } = await getPaginatedBlogPosts({ page, pageSize });
  return NextResponse.json({ posts, pagination });
}

export async function POST(request: Request) {
  // Only an Admin with 'blog' privilege is allowed to add blog posts!
  const session = await resolveAdminSessionFromRequest(request, await getDb());
  if (!session) {
    const db = await getDb();
    await recordErrorInvestigation(db, {
      route: "/api/blog",
      httpStatus: 401,
      error: "Unauthorized non-admin attempt to POST blog post",
    });
    return NextResponse.json(
      { error: "Unauthorized admin — only admins can add blog posts" },
      { status: 401 }
    );
  }
  if (!hasAdminPrivilege(session, "blog")) {
    const db = await getDb();
    await recordErrorInvestigation(db, {
      route: "/api/blog",
      httpStatus: 403,
      error: `Forbidden: Admin '${session.username}' (${session.role}) lacks 'blog' privilege`,
    });
    return NextResponse.json(
      { error: "Forbidden: Missing 'blog' admin privilege" },
      { status: 403 }
    );
  }

  const body = await request.json();
  const { slug, title, title_he, content, content_he, imageUrl, author } = body;

  if (!slug || !title || !content) {
    return NextResponse.json(
      { error: "slug, title, and content are required" },
      { status: 400 }
    );
  }

  const db = await getDb();
  if (!db) {
    return NextResponse.json(
      { error: "Database connection unavailable" },
      { status: 503 }
    );
  }

  const existingBefore = await db
    .collection("blog_posts")
    .findOne({ slug: String(slug).trim() });

  const nowUtc = nowUtcIso();
  const postDoc: BlogPost = {
    slug: String(slug).trim(),
    title: String(title).trim(),
    title_he: String(title_he || title).trim(),
    content: String(content).trim(),
    content_he: String(content_he || content).trim(),
    imageUrl: String(imageUrl || "").trim(),
    author: String(author || session.username || "Dockside Keep Staff").trim(),
    createdAtUtc: nowUtc,
    updatedAtUtc: nowUtc,
  };

  await db
    .collection("blog_posts")
    .updateOne({ slug: postDoc.slug }, { $set: postDoc }, { upsert: true });

  await recordAdminAuditLog(db, {
    session,
    entityType: "blog_post",
    entityId: postDoc.slug,
    action: existingBefore ? "update" : "create",
    summary: `${existingBefore ? "Updated" : "Published"} blog post '${postDoc.title}' (${postDoc.slug})`,
    before: existingBefore,
    after: postDoc,
  });
  await recordFeatureUsage(db, "blog_post_publish", {
    slug: postDoc.slug,
    author: postDoc.author,
  });

  return NextResponse.json({ ok: true, post: postDoc });
}

export async function DELETE(request: Request) {
  const session = await resolveAdminSessionFromRequest(request, await getDb());
  if (!session) {
    return NextResponse.json({ error: "Unauthorized admin" }, { status: 401 });
  }
  if (!hasAdminPrivilege(session, "blog")) {
    return NextResponse.json(
      { error: "Forbidden: Missing 'blog' admin privilege" },
      { status: 403 }
    );
  }

  const { searchParams } = new URL(request.url);
  const slug = searchParams.get("slug");
  if (!slug) {
    return NextResponse.json({ error: "slug is required" }, { status: 400 });
  }

  const db = await getDb();
  if (!db) {
    return NextResponse.json(
      { error: "Database connection unavailable" },
      { status: 503 }
    );
  }

  const existingBefore = await db.collection("blog_posts").findOne({ slug });
  await db.collection("blog_posts").deleteOne({ slug });

  await recordAdminAuditLog(db, {
    session,
    entityType: "blog_post",
    entityId: slug,
    action: "delete",
    summary: `Deleted blog post '${slug}'`,
    before: existingBefore,
    after: null,
  });

  return NextResponse.json({ ok: true, deletedSlug: slug });
}
