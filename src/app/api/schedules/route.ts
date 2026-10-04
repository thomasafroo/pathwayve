import { promptRequestSchema } from "@/types/schedule";
import { generateSchedule } from "@/lib/schedule-gemini";
import { materializeSchedule } from "@/lib/schedule-planning";
import { listSchedules } from "@/lib/schedule-repository";
import { getDatabase } from "@/lib/server/database";
import { checkOrigin, scheduleOwner } from "@/lib/server/schedule-session";
import { handleApi, readJson } from "@/lib/server/http";
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
    const owner = await scheduleOwner();
    const draft = await generateSchedule(input);
    if (draft.clarification) return { clarification: draft.clarification };
    return materializeSchedule(draft, owner, input.constraints);
  });
}
