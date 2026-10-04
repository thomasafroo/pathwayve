import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { OAuth2Client } from "google-auth-library";
import {
  beginGoogleConnection,
  completeGoogleConnection,
  openGoogleData,
  sealGoogleData,
  validateGoogleState,
} from "@/lib/server/google-calendar-auth";

const mocks = vi.hoisted(() => ({
  query: vi.fn(async () => ({ rows: [] })),
  jar: new Map<string, string>(),
  set: vi.fn(),
}));
vi.mock("@/lib/server/database", () => ({
  getDatabase: async () => ({ query: mocks.query }),
}));
vi.mock("@/lib/server/schedule-session", () => ({
  scheduleOwner: async () => "11111111-1111-4111-a111-111111111111",
}));
vi.mock("next/headers", () => ({
  cookies: async () => ({
    get: (name: string) => ({ value: mocks.jar.get(name) }),
    set: mocks.set,
  }),
}));
beforeEach(() => {
  vi.stubEnv("GOOGLE_CLIENT_ID", "test-client");
  vi.stubEnv("GOOGLE_CLIENT_SECRET", "test-client-secret");
  vi.stubEnv("BETTER_AUTH_URL", "http://localhost:3000");
  vi.stubEnv("BETTER_AUTH_SECRET", "s".repeat(32));
  vi.stubEnv("GOOGLE_CALENDAR_REDIRECT_URI", "");
  vi.stubEnv("GOOGLE_CALENDAR_TOKEN_SECRET", "");
  mocks.query.mockClear();
  mocks.set.mockClear();
  mocks.jar.clear();
  mocks.set.mockImplementation((name: string, value: string) =>
    mocks.jar.set(name, value),
  );
});
afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});
describe("Google OAuth boundaries", () => {
  it("encrypts tokens and rejects tampering or a different owner", () => {
    const sealed = sealGoogleData(
      { refresh_token: "private-token" },
      "tokens:one",
    );
    expect(sealed).not.toContain("private-token");
    expect(openGoogleData(sealed, "tokens:one")).toEqual({
      refresh_token: "private-token",
    });
    expect(() => openGoogleData(sealed, "tokens:two")).toThrow();
    expect(() => openGoogleData(`${sealed[0] === "A" ? "B" : "A"}${sealed.slice(1)}`, "tokens:one")).toThrow();
  });
  it("rejects missing, incorrect and expired OAuth state", () => {
    const pending = {
      state: "expected",
      verifier: "verifier",
      owner: "owner",
      expires: Date.now() + 60000,
    };
    expect(() => validateGoogleState(pending, null)).toThrow();
    expect(() => validateGoogleState(pending, "wrong")).toThrow();
    expect(() =>
      validateGoogleState({ ...pending, expires: 0 }, "expected"),
    ).toThrow();
    expect(() => validateGoogleState(pending, "expected")).not.toThrow();
  });
  it("builds a PKCE authorization request and an HTTP-only state cookie", async () => {
    const url = new URL(
      await beginGoogleConnection(
        new Request("http://localhost:3000/api/google-calendar/connect"),
      ),
    );
    expect(url.origin).toBe("https://accounts.google.com");
    expect(url.searchParams.get("code_challenge_method")).toBe("S256");
    expect(url.searchParams.get("access_type")).toBe("offline");
    expect(url.searchParams.get("scope")).toContain("calendar.events");
    expect(mocks.set.mock.calls[0][2]).toMatchObject({
      httpOnly: true,
      sameSite: "lax",
      maxAge: 600,
    });
  });
  it("never exchanges an authorization code without valid browser-bound state", async () => {
    const exchange = vi.spyOn(OAuth2Client.prototype, "getToken");
    await beginGoogleConnection(
      new Request("http://localhost:3000/api/google-calendar/connect"),
    );
    await expect(
      completeGoogleConnection(
        new Request(
          "http://localhost:3000/api/google-calendar/callback?code=code&state=invalid",
        ),
      ),
    ).rejects.toThrow("expired");
    expect(exchange).not.toHaveBeenCalled();
  });
  it("rejects a different app origin before creating an OAuth session", async () => {
    await expect(
      beginGoogleConnection(
        new Request("http://localhost:3101/api/google-calendar/connect"),
      ),
    ).rejects.toThrow("localhost:3000");
    expect(mocks.set).not.toHaveBeenCalled();
  });
});
