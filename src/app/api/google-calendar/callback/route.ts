import {
  completeGoogleConnection,
  googleCalendarConfig,
} from "@/lib/server/google-calendar-auth";
import { AppError } from "@/lib/server/http";
import { randomBytes } from "node:crypto";
export const runtime = "nodejs";
export async function GET(request: Request) {
  const origin = googleCalendarConfig().origin;
  let result = "connected";
  try {
    await completeGoogleConnection(request);
  } catch (error) {
    result =
      error instanceof AppError ? error.code : "GOOGLE_CONNECTION_FAILED";
  }
  const nonce = randomBytes(16).toString("base64");
  return new Response(
    `<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>Google Calendar</title><body><h1>${result === "connected" ? "Google Calendar connected" : "Google Calendar connection failed"}</h1><p>${result === "connected" ? "You can close this window and return to PathWayve." : "Return to PathWayve and connect again. Check your Google consent permissions and OAuth redirect configuration."}</p><a href="/">Return to PathWayve</a><script nonce="${nonce}">if(window.opener){window.opener.postMessage({type:"pathwayve-google",result:${JSON.stringify(result)}},${JSON.stringify(origin)});window.close();}</script></body></html>`,
    {
      status: 200,
      headers: {
        "Content-Type": "text/html; charset=utf-8",
        "Content-Security-Policy": `default-src 'none'; script-src 'nonce-${nonce}'; base-uri 'none'; frame-ancestors 'none'`,
        "Cache-Control": "no-store",
        "Referrer-Policy": "no-referrer",
      },
    },
  );
}
