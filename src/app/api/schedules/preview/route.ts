import { randomUUID } from "node:crypto";
import { promptRequestSchema } from "@/types/schedule";
import { generateSchedule } from "@/lib/schedule-gemini";
import { materializeSchedule } from "@/lib/schedule-planning";
import { loadGoogleEvents } from "@/lib/server/google-calendar";
import { checkOrigin, scheduleOwner } from "@/lib/server/schedule-session";
import { AppError, handleApi, readJson } from "@/lib/server/http";
export const runtime = "nodejs";
export const maxDuration = 300;
export async function POST(request: Request) {
  return handleApi(async () => {
    checkOrigin(request);
    const input = promptRequestSchema.parse(await readJson(request));
    const owner = await scheduleOwner();
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
    return materializeSchedule(
      draft,
      randomUUID(),
      input.constraints,
      calendar?.events,
    );
  });
}
