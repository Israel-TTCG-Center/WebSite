import type { Db } from "@/lib/db";
import { hashPasswordScrypt, isScryptHash } from "@/lib/auth-security";
import { nowUtcIso } from "@/lib/premium";

export { maybeSweepExpiredHolds } from "@/lib/store";

/**
 * One-time (per process) bootstrap.
 *
 * IMPORTANT: Never delete or wipe any tables on startup or update, and never fill
 * dummy/mock/initial items, events, or classes into the database. Only ensure the
 * root owner admin account exists.
 */
export async function bootstrapDb(db: Db): Promise<void> {
  const nowUtc = nowUtcIso();
  const adminsCol = db.collection("admins");
  const defaultAdminUser = process.env.ADMIN_USERNAME || "admin";
  const existingRootAdmin = await adminsCol.findOne({
    username: defaultAdminUser,
  });
  // Never create a root admin with a well-known default password in production.
  if (
    !process.env.ADMIN_PASSWORD &&
    process.env.NODE_ENV === "production" &&
    !existingRootAdmin
  ) {
    console.warn(
      "ADMIN_PASSWORD is not set: skipping root admin creation. Set ADMIN_USERNAME / ADMIN_PASSWORD."
    );
    return;
  }
  const defaultAdminPass = process.env.ADMIN_PASSWORD || "dockside-admin-2026";
  const rootVerifier =
    existingRootAdmin?.passwordHash &&
    isScryptHash(existingRootAdmin.passwordHash)
      ? existingRootAdmin.passwordHash
      : hashPasswordScrypt(existingRootAdmin?.password || defaultAdminPass);
  await adminsCol.updateOne(
    { username: defaultAdminUser },
    {
      $set: {
        role: "owner",
        level: 100,
        authProvider: "authjs-credentials",
        passwordHash: rootVerifier,
        privileges: ["inventory", "events", "metadata", "blog", "manage_admins"],
      },
      $unset: { password: "" },
      $setOnInsert: { username: defaultAdminUser, createdAtUtc: nowUtc },
    },
    { upsert: true }
  );
}
