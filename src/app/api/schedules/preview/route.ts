import { randomUUID } from "node:crypto";
import { promptRequestSchema } from "@/types/schedule";
import { generateSchedule } from "@/lib/schedule-gemini";
import { materializeSchedule } from "@/lib/schedule-planning";
import { checkOrigin } from "@/lib/server/schedule-session";
import { handleApi, readJson } from "@/lib/server/http";
export const runtime = "nodejs";
export const maxDuration = 300;
export async function POST(request: Request) {
  return handleApi(async () => {
    checkOrigin(request);
    const draft = await generateSchedule(
      promptRequestSchema.parse(await readJson(request)),
    );
    if (draft.clarification) return { clarification: draft.clarification };
    return materializeSchedule(draft, randomUUID());
  });
}
