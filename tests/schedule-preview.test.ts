import { beforeEach, expect, it, vi } from "vitest";
import { randomUUID } from "node:crypto";
import { AppError } from "@/lib/server/http";

const { generateSchedule, scheduleOwner } = vi.hoisted(() => ({
  generateSchedule: vi.fn(),
  scheduleOwner: vi.fn(),
}));
vi.mock("@/lib/schedule-gemini", () => ({ generateSchedule }));
vi.mock("@/lib/server/schedule-session", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/server/schedule-session")>()),
  scheduleOwner,
}));
import { POST } from "@/app/api/schedules/preview/route";

const preview = (body: Record<string, unknown>) =>
  POST(
    new Request("http://localhost:3000/api/schedules/preview", {
      method: "POST",
      headers: {
        origin: "http://localhost:3000",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        prompt: "Plan a coffee stop downtown",
        timeZone: "America/Vancouver",
        requestId: randomUUID(),
        ...body,
      }),
    }),
  );

beforeEach(() => {
  generateSchedule.mockReset();
  scheduleOwner.mockReset();
  scheduleOwner.mockRejectedValue(
    new AppError(
      "UNAUTHENTICATED",
      "Sign in to save and view your schedules.",
      401,
    ),
  );
});

it("lets signed-out users chat without a calendar", async () => {
  generateSchedule.mockResolvedValue({
    clarification: "Where are you starting from?",
    schedules: [],
    schedule_items: [],
  });
  const response = await preview({});
  expect(response.status).toBe(200);
  expect(await response.json()).toEqual({
    clarification: "Where are you starting from?",
  });
  expect(scheduleOwner).not.toHaveBeenCalled();
});

it("still requires sign-in to plan around Google Calendar", async () => {
  const response = await preview({
    googleCalendar: {
      calendarId: "primary",
      startDate: "2030-10-04",
      endDate: "2030-10-04",
    },
  });
  expect(response.status).toBe(401);
  expect(generateSchedule).not.toHaveBeenCalled();
});
