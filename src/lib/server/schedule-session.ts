import "server-only";
import { headers } from "next/headers";
import { authConfigured, getAuth } from "./auth";
import { AppError } from "./http";

// Ownership always comes from the authenticated server session.
export async function scheduleOwner(): Promise<string> {
  if (!authConfigured())
    throw new AppError(
      "UNAUTHENTICATED",
      "Sign in to save and view your schedules.",
      401,
    );
  const session = await (
    await getAuth()
  ).api.getSession({ headers: await headers() });
  if (!session)
    throw new AppError(
      "UNAUTHENTICATED",
      "Sign in to save and view your schedules.",
      401,
    );
  return session.user.id;
}
export function checkOrigin(request: Request) {
  const origin = request.headers.get("origin");
  // Next may normalize the internal URL hostname; Host identifies the browser-facing site.
  const site = new URL(request.url);
  const host = request.headers.get("host");
  if (host) site.host = host;
  if (
    (origin && origin !== site.origin) ||
    request.headers.get("sec-fetch-site") === "cross-site"
  )
    throw new AppError(
      "ORIGIN",
      "Use the planner on this site to save schedules.",
      403,
    );
}
