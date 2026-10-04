import { promptRequestSchema } from "@/types/schedule";
import { generateSchedule } from "@/lib/schedule-gemini";
import { materializeSchedule } from "@/lib/schedule-planning";
import {
  findByRequest,
  listSchedules,
  readSchedule,
  saveSchedule,
} from "@/lib/schedule-repository";
import { getDatabase } from "@/lib/server/database";
import { checkOrigin, scheduleOwner } from "@/lib/server/schedule-session";
import { AppError, handleApi, readJson } from "@/lib/server/http";
import { loadGoogleEvents } from "@/lib/server/google-calendar";
export const runtime = "nodejs";
export const maxDuration = 300;
export async function GET() {
  return handleApi(async () =>
    listSchedules(await getDatabase(), await scheduleOwner()),
  );
}
export async function POST(request: Request) {
  return handleApi(async () => {
    checkOrigin(request);
    const input = promptRequestSchema.parse(await readJson(request));
    const owner = await scheduleOwner(),
      db = await getDatabase();
    // Check connectivity/schema before spending on model or Maps calls.
    const previous = await findByRequest(db, owner, input.requestId);
    if (previous)
      return {
        document: await readSchedule(db, owner, previous),
        workspace: null,
      };
    const calendar = input.googleCalendar
      ? await loadGoogleEvents(owner, input.googleCalendar)
      : null;
    const draft = await generateSchedule(input, calendar?.events);
    if (draft.clarification) return { clarification: draft.clarification };
    if (
      calendar &&
      (Date.parse(draft.schedules[0].starts_at) <
        Date.parse(calendar.range.start) ||
        Date.parse(draft.schedules[0].ends_at) > Date.parse(calendar.range.end))
    )
      throw new AppError(
        "CALENDAR_RANGE",
        "The requested schedule is outside the imported calendar dates. Change the calendar date range and try again.",
        422,
      );
    const saved = await materializeSchedule(draft, owner, calendar?.events);
    try {
      await saveSchedule(db, saved.document, input.requestId);
    } catch {
      const concurrent = await findByRequest(db, owner, input.requestId);
      if (concurrent)
        return {
          document: await readSchedule(db, owner, concurrent),
          workspace: null,
        };
      throw new AppError(
        "SAVE_FAILED",
        "The schedule could not be saved. Retry this prompt; no partial schedule was committed.",
        503,
      );
    }
    return saved;
  });
}
