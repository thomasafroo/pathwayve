import { z } from "zod";
import { calendarSelectionSchema } from "@/types/calendar";
import { calendarEventsFile } from "@/lib/calendar";
import {
  disconnectGoogle,
  googleCalendarConfig,
  hasGoogleConnection,
} from "@/lib/server/google-calendar-auth";
import {
  exportGoogleEvents,
  listGoogleCalendars,
  loadGoogleEvents,
} from "@/lib/server/google-calendar";
import { AppError, handleApi, readJson } from "@/lib/server/http";
import { scheduleOwner } from "@/lib/server/schedule-session";
export const runtime = "nodejs";
export const maxDuration = 300;
export async function GET(request: Request) {
  return handleApi(async () => {
    try {
      googleCalendarConfig();
    } catch {
      return { configured: false, connected: false, calendars: [] };
    }
    const owner = await scheduleOwner();
    if (!(await hasGoogleConnection(owner)))
      return { configured: true, connected: false, calendars: [] };
    const params = new URL(request.url).searchParams;
    if (params.has("calendarId")) {
      const selection = calendarSelectionSchema.parse(
        Object.fromEntries(params),
      );
      const result = await loadGoogleEvents(owner, selection);
      return {
        ...result,
        ics: result.events.length ? calendarEventsFile(result.events) : null,
      };
    }
    return {
      configured: true,
      connected: true,
      calendars: await listGoogleCalendars(owner),
    };
  });
}
export async function POST(request: Request) {
  return handleApi(async () => {
    if (request.headers.get("origin") !== new URL(request.url).origin)
      throw new AppError("ORIGIN", "Export from this site.", 403);
    const input = z
      .object({
        calendarId: z.string().min(1).max(1024),
        ics: z.string().min(1).max(120000),
      })
      .parse(await readJson(request));
    return exportGoogleEvents(
      await scheduleOwner(),
      input.calendarId,
      input.ics,
    );
  });
}
export async function DELETE(request: Request) {
  return handleApi(async () => {
    if (request.headers.get("origin") !== new URL(request.url).origin)
      throw new AppError("ORIGIN", "Disconnect from this site.", 403);
    await disconnectGoogle(await scheduleOwner());
    return { disconnected: true };
  });
}
