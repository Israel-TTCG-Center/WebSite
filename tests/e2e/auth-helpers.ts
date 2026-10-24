import { expect, type APIRequestContext } from "@playwright/test";

/**
 * Signs the given API request context in through the Auth.js credentials endpoint,
 * the same way the login forms do. The session cookie is kept on the context.
 */
export async function signInWithCredentials(
  request: APIRequestContext,
  provider: "admin" | "customer",
  fields: Record<string, string>
): Promise<boolean> {
  const csrfRes = await request.get("/api/auth/csrf");
  expect(csrfRes.ok()).toBe(true);
  const { csrfToken } = await csrfRes.json();
  const res = await request.post(`/api/auth/callback/${provider}`, {
    form: { ...fields, csrfToken, json: "true" },
  });
  const sessionRes = await request.get("/api/auth/session");
  const session = await sessionRes.json();
  return res.ok() && Boolean(session?.user);
}

export async function signOutApi(request: APIRequestContext): Promise<void> {
  const csrfRes = await request.get("/api/auth/csrf");
  const { csrfToken } = await csrfRes.json();
  await request.post("/api/auth/signout", { form: { csrfToken, json: "true" } });
}
