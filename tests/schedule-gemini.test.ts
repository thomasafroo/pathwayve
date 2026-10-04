import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { scheduleIntent } from "./fixtures/schedule";
import { generateSchedule } from "@/lib/schedule-gemini";

const { generateContent } = vi.hoisted(() => ({ generateContent: vi.fn() }));
vi.mock("node:timers/promises", () => ({
  setTimeout: vi.fn().mockResolvedValue(undefined),
}));
vi.mock("@google/genai", () => ({
  GoogleGenAI: class {
    models = { generateContent };
  },
}));
const request = {
  prompt: "Coffee tomorrow from SFU to downtown",
  timeZone: "America/Vancouver",
  requestId: "11111111-1111-4111-8111-111111111111",
};
beforeEach(() => {
  vi.stubEnv("GEMINI_API_KEY", "unit-test-only");
  generateContent.mockReset();
});
afterEach(() => vi.unstubAllEnvs());
it("reports exhausted SDK timeouts separately from invalid JSON", async () => {
  generateContent.mockRejectedValue(new DOMException("Aborted", "AbortError"));
  await expect(generateSchedule(request)).rejects.toMatchObject({
    code: "AI_TIMEOUT",
    status: 504,
  });
  expect(generateContent).toHaveBeenCalledTimes(2);
});
it("recovers from a temporary overload with one identical retry", async () => {
  generateContent
    .mockRejectedValueOnce({ status: 503 })
    .mockResolvedValueOnce({ text: JSON.stringify(scheduleIntent()) });
  expect((await generateSchedule(request)).schedule_items).toHaveLength(1);
  expect(generateContent).toHaveBeenCalledTimes(2);
  expect(generateContent.mock.calls[0][0]).toEqual(
    generateContent.mock.calls[1][0],
  );
});
it.each([503, 504])("bounds retries for provider status %s", async (status) => {
  generateContent.mockRejectedValue({ status });
  await expect(generateSchedule(request)).rejects.toMatchObject({
    code: "AI_UNAVAILABLE",
    status: 503,
  });
  expect(generateContent).toHaveBeenCalledTimes(2);
});
it("reports quota separately without repeatedly spending requests", async () => {
  generateContent.mockRejectedValue({ status: 429 });
  await expect(generateSchedule(request)).rejects.toMatchObject({
    code: "AI_QUOTA",
    status: 429,
  });
  expect(generateContent).toHaveBeenCalledTimes(1);
});
it("requests JSON constrained by the shared schema and parses it", async () => {
  generateContent.mockResolvedValue({ text: JSON.stringify(scheduleIntent()) });
  const draft = await generateSchedule(request);
  expect(draft.schedule_items).toHaveLength(1);
  expect(generateContent.mock.calls[0][0].config).toMatchObject({
    responseMimeType: "application/json",
    responseJsonSchema: { type: "object" },
  });
});
it("rejects invalid or contradictory model JSON", async () => {
  generateContent.mockResolvedValue({ text: "not JSON" });
  await expect(generateSchedule(request)).rejects.toMatchObject({
    code: "AI_SCHEDULE_ERROR",
  });
  const draft = scheduleIntent();
  draft.schedule_items[0].duration_minutes = -5;
  generateContent.mockResolvedValue({ text: JSON.stringify(draft) });
  await expect(generateSchedule(request)).rejects.toMatchObject({
    code: "AI_SCHEDULE_ERROR",
  });
});
it("returns missing-key configuration without calling Gemini", async () => {
  vi.stubEnv("GEMINI_API_KEY", "");
  await expect(generateSchedule(request)).rejects.toMatchObject({
    code: "CONFIGURATION",
  });
  expect(generateContent).not.toHaveBeenCalled();
});
