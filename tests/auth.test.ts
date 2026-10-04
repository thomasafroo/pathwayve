import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { createHmac, randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import { PGlite } from "@electric-sql/pglite";
import { CompiledQuery, Kysely } from "kysely";
import { pgliteDialect } from "@/lib/server/pglite-dialect";
import { createAuth } from "@/lib/server/auth";
import type { Database } from "@/lib/server/database";
import { GET, POST } from "@/app/api/schedules/route";
import { GET as read } from "@/app/api/schedules/[id]/route";
import { ownedSnapshot } from "@/lib/schedule-snapshot";
import { planTrip } from "@/lib/planner";
import { exampleRequest } from "@/lib/fixtures";
import { createWorkspace } from "@/lib/trip-workspace";
import type { SaveRequest } from "@/types/schedule";

let auth: ReturnType<typeof createAuth>;
let database: Database;
let db: Kysely<Record<string, never>>;
let requestHeaders = new Headers();
let aliceCookie: string, bobCookie: string, aliceId: string;
let payload: SaveRequest;
const secret = "test-only-secret-with-at-least-32-characters";
vi.mock("next/headers", () => ({ headers: async () => requestHeaders }));
vi.mock("@/lib/server/database", () => ({ getDatabase: async () => database }));
vi.mock("@/lib/server/auth", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/server/auth")>()),
  authConfigured: () => true,
  getAuth: async () => auth,
}));
const request = (value: unknown, origin = "http://localhost:3000") =>
  new Request("http://localhost:3000/api/schedules", {
    method: "POST",
    headers: { origin, "Content-Type": "application/json" },
    body: JSON.stringify(value),
  });
const useCookie = (cookie = "") => {
  requestHeaders = new Headers({ cookie });
};

beforeAll(async () => {
  vi.stubEnv("MAPS_DATA_MODE", "demo");
  const client = await PGlite.create();
  for (const file of ["001_schedules.sql", "002_auth.sql"])
    await client.exec(await readFile(`db/migrations/${file}`, "utf8"));
  db = new Kysely({ dialect: pgliteDialect(client) });
  database = {
    authDb: db,
    query: (sql, params = []) =>
      db.executeQuery(CompiledQuery.raw(sql, params)),
    transaction: (work) =>
      db.transaction().execute((tx) =>
        work({
          query: (sql, params = []) =>
            tx.executeQuery(CompiledQuery.raw(sql, params)),
        }),
      ),
  };
  auth = createAuth(db, {
    secret,
    baseURL: "http://localhost:3000",
    clientId: "test-google-client",
    clientSecret: "test-google-secret",
  });
  const ctx = await auth.$context;
  async function account(name: string) {
    const user = await ctx.internalAdapter.createUser(
      {
        name,
        email: `${name}@example.com`,
        emailVerified: true,
      },
      { method: "oauth", oauth: { providerId: "google" } },
    );
    await ctx.internalAdapter.createAccount({
      userId: user.id,
      providerId: "google",
      accountId: `google-${name}`,
    });
    const session = await ctx.internalAdapter.createSession(user.id, false);
    const signature = createHmac("sha256", secret)
      .update(session.token)
      .digest("base64");
    return {
      id: user.id,
      cookie: `better-auth.session_token=${encodeURIComponent(`${session.token}.${signature}`)}`,
    };
  }
  const alice = await account("alice"),
    bob = await account("bob");
  aliceId = alice.id;
  aliceCookie = alice.cookie;
  bobCookie = bob.cookie;
  payload = {
    requestId: randomUUID(),
    document: null,
    workspace: createWorkspace(await planTrip(exampleRequest())),
  };
}, 30000);
afterAll(async () => {
  await db?.destroy();
  vi.unstubAllEnvs();
});

describe("account-owned schedules", () => {
  it("rejects unauthenticated list, save and read requests", async () => {
    useCookie();
    expect((await GET()).status).toBe(401);
    expect((await POST(request(payload))).status).toBe(401);
    expect(
      (
        await read(request({}), {
          params: Promise.resolve({ id: randomUUID() }),
        })
      ).status,
    ).toBe(401);
  });
  it("saves the exact manual workspace, ignores supplied ownership, and isolates users", async () => {
    useCookie(aliceCookie);
    const response = await POST(request({ ...payload, user_id: randomUUID() }));
    expect(response.status).toBe(200);
    const saved = await response.json();
    expect(saved.document.schedules[0].user_id).toBe(aliceId);
    expect(saved.workspace).toEqual(payload.workspace);
    const id = saved.document.schedules[0].id;
    expect(
      (await (await GET()).json()).map((s: { id: string }) => s.id),
    ).toContain(id);
    const reread = await read(request({}), { params: Promise.resolve({ id }) });
    expect((await reread.json()).workspace).toEqual(payload.workspace);
    const duplicate = await POST(request(payload));
    expect((await duplicate.json()).document.schedules[0].id).toBe(id);
    useCookie(bobCookie);
    expect(await (await GET()).json()).toEqual([]);
    expect(
      (await read(request({}), { params: Promise.resolve({ id }) })).status,
    ).toBe(404);
  });
  it("replaces owner and IDs on a submitted generated schedule", async () => {
    const document = ownedSnapshot(payload, randomUUID());
    useCookie(aliceCookie);
    const response = await POST(
      request({ requestId: randomUUID(), document, workspace: null }),
    );
    expect(response.status).toBe(200);
    const saved = await response.json();
    expect(saved.document.schedules[0].user_id).toBe(aliceId);
    expect(saved.document.schedules[0].id).not.toBe(document.schedules[0].id);
  });
  it("blocks cross-origin saves and malformed payloads", async () => {
    useCookie(aliceCookie);
    expect(
      (await POST(request(payload, "https://attacker.example"))).status,
    ).toBe(403);
    expect(
      (
        await POST(
          request({ requestId: randomUUID(), workspace: {}, document: null }),
        )
      ).status,
    ).toBe(400);
  });
  it("rejects expired and revoked sessions", async () => {
    await database.query(
      'UPDATE auth_sessions SET "expiresAt" = now() - interval \'1 hour\' WHERE "userId" = $1',
      [aliceId],
    );
    useCookie(aliceCookie);
    expect((await GET()).status).toBe(401);
    useCookie(bobCookie);
    const response = await auth.handler(
      new Request("http://localhost:3000/api/auth/sign-out", {
        method: "POST",
        headers: {
          cookie: bobCookie,
          origin: "http://localhost:3000",
          "Content-Type": "application/json",
        },
        body: "{}",
      }),
    );
    expect(response.status).toBe(200);
    expect((await GET()).status).toBe(401);
  });
  it("builds Google OAuth with state, PKCE and the configured callback", async () => {
    const response = await auth.handler(
      new Request("http://localhost:3000/api/auth/sign-in/social", {
        method: "POST",
        headers: {
          origin: "http://localhost:3000",
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          provider: "google",
          callbackURL: "http://localhost:3000/?auth=complete",
          disableRedirect: true,
        }),
      }),
    );
    expect(response.status).toBe(200);
    const url = new URL((await response.json()).url);
    expect(url.hostname).toBe("accounts.google.com");
    expect(url.searchParams.get("redirect_uri")).toBe(
      "http://localhost:3000/api/auth/callback/google",
    );
    expect(url.searchParams.get("state")).toBeTruthy();
    expect(url.searchParams.get("code_challenge")).toBeTruthy();
    expect(url.searchParams.get("scope")).toContain("openid");
  });
  it("serializes concurrent local transactions and enforces the user foreign key", async () => {
    await expect(
      database.query(
        "INSERT INTO pathwayve.schedules (id, user_id, request_id, name, origin_place_id, destination_place_id, starts_at, ends_at, time_zone, transportation, preferences, version, created_at, updated_at) VALUES ($1,$2,$3,'Test','a','b',now(),now()+interval '1 hour','UTC','walking','{}',1,now(),now())",
        [randomUUID(), randomUUID(), randomUUID()],
      ),
    ).rejects.toThrow();
    await Promise.all([
      database.transaction(async (tx) => {
        await tx.query("SELECT 1");
        await new Promise((resolve) => setTimeout(resolve, 20));
        await tx.query("SELECT 2");
      }),
      database.query("SELECT 3"),
    ]);
  });
});
