import "server-only";
import {
  createCipheriv,
  createDecipheriv,
  createHash,
  randomBytes,
  timingSafeEqual,
} from "node:crypto";
import { cookies } from "next/headers";
import {
  CodeChallengeMethod,
  OAuth2Client,
  type Credentials,
} from "google-auth-library";
import { getDatabase } from "./database";
import { AppError } from "./http";
import { scheduleOwner } from "./schedule-session";

const scopes = [
  "https://www.googleapis.com/auth/calendar.events",
  "https://www.googleapis.com/auth/calendar.calendarlist.readonly",
];
const stateCookie = "pathwayve_google_oauth";

export function googleCalendarConfig() {
  const clientId = process.env.GOOGLE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
  const secret =
    process.env.GOOGLE_CALENDAR_TOKEN_SECRET || process.env.BETTER_AUTH_SECRET;
  const base = process.env.BETTER_AUTH_URL || process.env.APP_URL;
  const redirectUri =
    process.env.GOOGLE_CALENDAR_REDIRECT_URI ||
    (base && new URL("/api/google-calendar/callback", base).href);
  if (
    !clientId ||
    !clientSecret ||
    !secret ||
    secret.length < 32 ||
    !redirectUri
  )
    throw new AppError(
      "GOOGLE_CONFIGURATION",
      "Google Calendar is not configured. Set the Google client credentials, app URL and a token secret of at least 32 characters.",
      503,
    );
  const url = new URL(redirectUri);
  if (
    url.protocol !== "https:" &&
    !(
      url.protocol === "http:" &&
      ["localhost", "127.0.0.1"].includes(url.hostname)
    )
  )
    throw new AppError(
      "GOOGLE_CONFIGURATION",
      "Google Calendar requires HTTPS outside localhost.",
      503,
    );
  return { clientId, clientSecret, secret, redirectUri, origin: url.origin };
}

export function sealGoogleData(value: unknown, purpose: string) {
  const key = createHash("sha256")
    .update(googleCalendarConfig().secret)
    .digest();
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  cipher.setAAD(Buffer.from(purpose));
  const encrypted = Buffer.concat([
    cipher.update(JSON.stringify(value), "utf8"),
    cipher.final(),
  ]);
  return Buffer.concat([iv, cipher.getAuthTag(), encrypted]).toString(
    "base64url",
  );
}
export function openGoogleData<T>(value: string, purpose: string): T {
  const key = createHash("sha256")
    .update(googleCalendarConfig().secret)
    .digest();
  const data = Buffer.from(value, "base64url");
  const decipher = createDecipheriv("aes-256-gcm", key, data.subarray(0, 12));
  decipher.setAAD(Buffer.from(purpose));
  decipher.setAuthTag(data.subarray(12, 28));
  return JSON.parse(
    Buffer.concat([
      decipher.update(data.subarray(28)),
      decipher.final(),
    ]).toString("utf8"),
  ) as T;
}
function client() {
  const config = googleCalendarConfig();
  return new OAuth2Client({
    clientId: config.clientId,
    clientSecret: config.clientSecret,
    redirectUri: config.redirectUri,
    transporterOptions: { timeout: 20000, retry: false },
  });
}
type Pending = {
  state: string;
  verifier: string;
  owner: string;
  expires: number;
};
export function validateGoogleState(pending: Pending, state: string | null) {
  const left = Buffer.from(pending.state);
  const right = Buffer.from(state || "");
  if (
    pending.expires < Date.now() ||
    left.length !== right.length ||
    !timingSafeEqual(left, right)
  )
    throw new AppError(
      "GOOGLE_STATE",
      "Google connection expired. Connect again.",
      400,
    );
}
export async function beginGoogleConnection(request: Request) {
  const config = googleCalendarConfig();
  if (new URL(request.url).origin !== config.origin)
    throw new AppError(
      "GOOGLE_ORIGIN",
      `Open PathWayve at ${config.origin} to connect Google Calendar.`,
      400,
    );
  const owner = await scheduleOwner();
  // Verify storage is ready before sending the user through consent.
  await (
    await getDatabase()
  ).query(
    "SELECT owner_id FROM pathwayve.google_calendar_connections WHERE owner_id=$1",
    [owner],
  );
  const auth = client();
  const { codeVerifier, codeChallenge } =
    await auth.generateCodeVerifierAsync();
  const state = randomBytes(32).toString("base64url");
  (await cookies()).set(
    stateCookie,
    sealGoogleData(
      { state, verifier: codeVerifier, owner, expires: Date.now() + 600000 },
      "oauth-state",
    ),
    {
      httpOnly: true,
      sameSite: "lax",
      secure: config.origin.startsWith("https:"),
      path: "/api/google-calendar",
      maxAge: 600,
    },
  );
  return auth.generateAuthUrl({
    access_type: "offline",
    prompt: "consent",
    scope: scopes,
    state,
    code_challenge: codeChallenge,
    code_challenge_method: CodeChallengeMethod.S256,
  });
}
export async function saveGoogleTokens(owner: string, tokens: Credentials) {
  await (
    await getDatabase()
  ).query(
    "INSERT INTO pathwayve.google_calendar_connections (owner_id,encrypted_tokens) VALUES ($1,$2) ON CONFLICT (owner_id) DO UPDATE SET encrypted_tokens=EXCLUDED.encrypted_tokens,updated_at=now()",
    [owner, sealGoogleData(tokens, `tokens:${owner}`)],
  );
}
export async function completeGoogleConnection(request: Request) {
  const jar = await cookies();
  const sealed = jar.get(stateCookie)?.value;
  jar.set(stateCookie, "", { path: "/api/google-calendar", maxAge: 0 });
  if (!sealed)
    throw new AppError(
      "GOOGLE_STATE",
      "Google connection expired. Connect again.",
    );
  const pending = openGoogleData<Pending>(sealed, "oauth-state");
  const params = new URL(request.url).searchParams;
  validateGoogleState(pending, params.get("state"));
  if (params.has("error"))
    throw new AppError(
      "GOOGLE_DENIED",
      "Google Calendar access was not granted.",
    );
  const code = params.get("code");
  if (!code)
    throw new AppError("GOOGLE_STATE", "Missing Google authorization code.");
  const auth = client();
  const { tokens } = await auth.getToken({
    code,
    codeVerifier: pending.verifier,
  });
  if (
    !tokens.access_token ||
    !tokens.refresh_token ||
    !scopes.every((scope) => tokens.scope?.split(" ").includes(scope))
  )
    throw new AppError(
      "GOOGLE_SCOPES",
      "Grant both calendar permissions when connecting Google.",
    );
  await saveGoogleTokens(pending.owner, tokens);
}
export async function hasGoogleConnection(owner: string) {
  const result = await (
    await getDatabase()
  ).query(
    "SELECT owner_id FROM pathwayve.google_calendar_connections WHERE owner_id=$1",
    [owner],
  );
  return result.rows.length > 0;
}
export async function googleAccessToken(owner: string, forceRefresh = false) {
  const result = await (
    await getDatabase()
  ).query<{ encrypted_tokens: string }>(
    "SELECT encrypted_tokens FROM pathwayve.google_calendar_connections WHERE owner_id=$1",
    [owner],
  );
  if (!result.rows[0])
    throw new AppError("GOOGLE_CONNECT", "Connect Google Calendar first.", 401);
  try {
    const auth = client();
    const stored = openGoogleData<Credentials>(
      result.rows[0].encrypted_tokens,
      `tokens:${owner}`,
    );
    auth.setCredentials(stored);
    if (forceRefresh) await auth.refreshAccessToken();
    const { token } = await auth.getAccessToken();
    if (!token) throw new Error("Missing token");
    if (auth.credentials.access_token !== stored.access_token)
      await saveGoogleTokens(owner, { ...stored, ...auth.credentials });
    return token;
  } catch {
    throw new AppError(
      "GOOGLE_RECONNECT",
      "Google Calendar access expired or was revoked. Connect again.",
      401,
    );
  }
}
export async function disconnectGoogle(owner: string) {
  await (
    await getDatabase()
  ).query(
    "DELETE FROM pathwayve.google_calendar_connections WHERE owner_id=$1",
    [owner],
  );
  (await cookies()).set(stateCookie, "", {
    path: "/api/google-calendar",
    maxAge: 0,
  });
}
