import "server-only";
import { betterAuth } from "better-auth";
import type { Kysely } from "kysely";
import { getDatabase } from "./database";
import { AppError } from "./http";

export function createAuth(
  database: Kysely<Record<string, never>>,
  config: {
    secret: string;
    baseURL: string;
    clientId: string;
    clientSecret: string;
  },
) {
  return betterAuth({
    database: { db: database, type: "postgres" },
    secret: config.secret,
    baseURL: config.baseURL,
    socialProviders: {
      google: {
        clientId: config.clientId,
        clientSecret: config.clientSecret,
        prompt: "select_account",
      },
    },
    user: { modelName: "auth_users" },
    session: { modelName: "auth_sessions", cookieCache: { enabled: false } },
    account: {
      modelName: "auth_accounts",
      encryptOAuthTokens: true,
      accountLinking: { enabled: false },
    },
    verification: { modelName: "auth_verifications" },
    advanced: { database: { generateId: "uuid" } },
  });
}

export function authConfigured() {
  return !!(
    process.env.GOOGLE_CLIENT_ID &&
    process.env.GOOGLE_CLIENT_SECRET &&
    process.env.BETTER_AUTH_SECRET &&
    process.env.BETTER_AUTH_URL
  );
}

let instance: Promise<ReturnType<typeof createAuth>> | undefined;
export async function getAuth() {
  if (!authConfigured())
    throw new AppError(
      "AUTH_CONFIGURATION",
      "Google sign-in is not configured yet. Add the Google OAuth credentials and auth settings on the server.",
      503,
    );
  instance ??= getDatabase()
    .then((database) => {
      if (!database.authDb)
        throw new Error("Authentication database unavailable.");
      return createAuth(database.authDb, {
        secret: process.env.BETTER_AUTH_SECRET!,
        baseURL: process.env.BETTER_AUTH_URL!,
        clientId: process.env.GOOGLE_CLIENT_ID!,
        clientSecret: process.env.GOOGLE_CLIENT_SECRET!,
      });
    })
    .catch((error) => {
      instance = undefined;
      throw error;
    });
  return instance;
}
