import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { scheduleIntent } from "./fixtures/schedule";
import { generateSchedule, quotaDetails } from "@/lib/schedule-gemini";

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
it.each(["fresh", "disabled", "stale"])(
  "sends only usable location to Gemini (%s)",
  async (state) => {
    generateContent.mockResolvedValue({
      text: JSON.stringify(scheduleIntent()),
    });
    const position = {
      lat: 49.26,
      lng: -123.25,
      accuracy: 20,
      timestamp: Date.now() - (state === "stale" ? 120000 : 0),
    };
    await generateSchedule({
      ...request,
      liveLocation: { tracking: state !== "disabled", position },
    });
    const contents = JSON.parse(generateContent.mock.calls[0][0].contents);
    expect(contents.current_location.tracking_enabled).toBe(
      state !== "disabled",
    );
    expect(contents.current_location.position).toEqual(
      state === "fresh" ? position : null,
    );
  },
);
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
it("logs which quota a 429 exhausted without logging the prompt", async () => {
  const body = {
    error: {
      code: 429,
      status: "RESOURCE_EXHAUSTED",
      details: [
        {
          "@type": "type.googleapis.com/google.rpc.QuotaFailure",
          violations: [
            {
              quotaMetric:
                "generativelanguage.googleapis.com/generate_content_free_tier_requests",
              quotaId: "GenerateRequestsPerDayPerProjectPerModel-FreeTier",
              quotaDimensions: { location: "global", model: "test-model" },
              quotaValue: "20",
            },
          ],
        },
        {
          "@type": "type.googleapis.com/google.rpc.RetryInfo",
          retryDelay: "34s",
        },
      ],
    },
  };
  const error = Object.assign(new Error(JSON.stringify(body)), {
    status: 429,
  });
  const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
  generateContent.mockRejectedValue(error);
  await expect(generateSchedule(request)).rejects.toMatchObject({
    code: "AI_QUOTA",
  });
  expect(warn).toHaveBeenCalledWith(
    "Gemini quota exceeded",
    expect.objectContaining({
      violations: [
        expect.objectContaining({
          quotaId: "GenerateRequestsPerDayPerProjectPerModel-FreeTier",
          quotaValue: "20",
          model: "test-model",
        }),
      ],
      retryDelay: "34s",
    }),
  );
  expect(JSON.stringify(warn.mock.calls)).not.toContain(request.prompt);
  expect(quotaDetails({ status: 429 })).toEqual({
    violations: [],
    retryDelay: undefined,
  });
  warn.mockRestore();
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

it("sends sidebar constraints separately and requires route-vs-specific classification", async () => {
  generateContent.mockResolvedValue({ text: JSON.stringify(scheduleIntent()) });
  const { planningConstraintsSchema } =
    await import("@/types/planning-constraints");
  const constraints = planningConstraintsSchema.parse({
    origin: null,
    destination: null,
    transportation: "transit",
    selectedStops: [],
    timeZone: "America/Vancouver",
    routingPriority: "less_walking",
    budget: "any",
    activities: [],
    interestTags: [],
    preferences: "",
  });
  await generateSchedule({ ...request, constraints });
  const call = generateContent.mock.calls[0][0];
  expect(JSON.parse(call.contents).required_sidebar_constraints).toEqual(
    constraints,
  );
  expect(
    call.config.responseJsonSchema.properties.schedule_items.items.required,
  ).toContain("location_scope");
  expect(call.config.systemInstruction).toContain(
    "required_sidebar_constraints take priority",
  );
});

async function editConstraints() {
  const { planningConstraintsSchema } =
    await import("@/types/planning-constraints");
  return planningConstraintsSchema.parse({
    origin: null,
    destination: null,
    transportation: "transit",
    timeZone: "America/Vancouver",
    selectedStops: [
      {
        id: "fleur",
        name: "La Fleur d’Oranger",
        category: "coffee",
        location: { lat: 49.2, lng: -123.1 },
        durationMinutes: 30,
        locked: false,
        priority: "optional",
      },
      {
        id: "lima",
        name: "LIMA CAFE DESSERT & COFFEE SHOP",
        category: "coffee",
        location: { lat: 49.2, lng: -123.12 },
        durationMinutes: 30,
        locked: false,
        priority: "optional",
      },
      {
        id: "kestrel",
        name: "Kestrel Books",
        category: "bookstore",
        location: { lat: 49.2, lng: -123.13 },
        durationMinutes: 45,
        locked: false,
        priority: "required",
      },
    ],
    routingPriority: "fastest",
    budget: "any",
    activities: [],
    interestTags: [],
    preferences: "",
  });
}
const removeFleur = {
  clarification: null,
  decisions: [
    { stop_id: "fleur", action: "remove", reason: "User rejects this cafe." },
    { stop_id: "lima", action: "keep", reason: "Unrelated optional choice." },
    { stop_id: "kestrel", action: "keep", reason: "Required bookstore." },
  ],
};
it.each([
  "Remove L Fleurr",
  "I actually don't want La Fluer d'Oranger, give me a place near Brekka and Kestrel",
  "La Fleur is inconvenient; find a closer coffee shop",
])(
  "applies interpreted rejection even when itinerary generation omits removal IDs: %s",
  async (prompt) => {
    const constraints = await editConstraints();
    generateContent
      .mockResolvedValueOnce({ text: JSON.stringify(removeFleur) })
      .mockResolvedValueOnce({
        text: JSON.stringify({ ...scheduleIntent(), removed_stop_ids: [] }),
      });
    const result = await generateSchedule({ ...request, prompt, constraints });
    expect(result.removed_stop_ids).toEqual(["fleur"]);
    expect(
      JSON.parse(generateContent.mock.calls[1][0].contents)
        .confirmed_removed_stop_ids,
    ).toEqual(["fleur"]);
    const { enforceScheduleConstraints } =
      await import("@/lib/schedule-constraints");
    const enforced = enforceScheduleConstraints(result, constraints);
    expect(
      enforced.schedule_items
        .filter((item) => item.selected_stop_id)
        .map((item) => item.selected_stop_id),
    ).toEqual(["lima", "kestrel"]);
  },
);
it("asks for clarification instead of claiming a protected stop was removed", async () => {
  const constraints = await editConstraints();
  constraints.selectedStops[0].priority = "required";
  generateContent.mockResolvedValueOnce({ text: JSON.stringify(removeFleur) });
  const result = await generateSchedule({
    ...request,
    constraints,
    prompt: "Remove Fleur",
  });
  expect(result.clarification).toContain("uncheck Required");
  expect(generateContent).toHaveBeenCalledTimes(1);
});
it("rejects incomplete edit decisions instead of silently saving a no-op", async () => {
  generateContent.mockResolvedValueOnce({
    text: JSON.stringify({ clarification: null, decisions: [] }),
  });
  await expect(
    generateSchedule({ ...request, constraints: await editConstraints() }),
  ).rejects.toMatchObject({ code: "INCOMPLETE_STOP_EDITS" });
});
it("keeps unrelated optional stops despite conflicting removals from the itinerary stage", async () => {
  generateContent
    .mockResolvedValueOnce({
      text: JSON.stringify({
        ...removeFleur,
        decisions: removeFleur.decisions.map((item) => ({
          ...item,
          action: "keep",
        })),
      }),
    })
    .mockResolvedValueOnce({
      text: JSON.stringify({ ...scheduleIntent(), removed_stop_ids: ["lima"] }),
    });
  const result = await generateSchedule({
    ...request,
    constraints: await editConstraints(),
    prompt: "Don't remove La Fleur, add a cake shop",
  });
  expect(result.removed_stop_ids).toEqual([]);
});

it.each([false, true])(
  "uses sidebar rejection in the edit pass (required=%s)",
  async (required) => {
    const constraints = await editConstraints();
    constraints.selectedStops[0].name = "Purebread bakery";
    constraints.selectedStops[0].priority = required ? "required" : "optional";
    constraints.preferences = "I don't like purebread bakery";
    constraints.activities = ["bookstore"];
    constraints.interestTags = ["Libraries"];
    constraints.budget = "budget";
    constraints.suggestionMode = "manual";
    generateContent
      .mockResolvedValueOnce({ text: JSON.stringify(removeFleur) })
      .mockResolvedValueOnce({ text: JSON.stringify(scheduleIntent()) });
    const result = await generateSchedule({
      ...request,
      constraints,
      prompt: "Adapt to my new preferences on the side",
    });
    const editInput = JSON.parse(generateContent.mock.calls[0][0].contents);
    expect(editInput.current_sidebar_preferences).toEqual({
      notes: "I don't like purebread bakery",
      activities: ["bookstore"],
      interests: ["Libraries"],
      budget: "budget",
      suggestion_mode: "manual",
      routing_priority: "fastest",
    });
    if (required) {
      expect(result.clarification).toContain("Purebread bakery");
      expect(result.clarification).toContain("uncheck Required");
      expect(generateContent).toHaveBeenCalledTimes(1);
    } else {
      expect(result.removed_stop_ids).toEqual(["fleur"]);
      const planningInput = JSON.parse(
        generateContent.mock.calls[1][0].contents,
      );
      expect(planningInput.required_sidebar_constraints).toEqual(constraints);
      const { enforceScheduleConstraints } =
        await import("@/lib/schedule-constraints");
      const plan = enforceScheduleConstraints(result, constraints);
      expect(
        plan.schedule_items.some((item) => item.selected_stop_id === "fleur"),
      ).toBe(false);
      expect(
        plan.schedule_items.some((item) => item.selected_stop_id === "lima"),
      ).toBe(true);
      expect(plan.schedules[0].preferences.notes).toContain(
        constraints.preferences,
      );
      expect(plan.schedules[0].preferences.budget).toBe("budget");
    }
  },
);

it("repairs invalid sequence output once instead of failing an otherwise usable request", async () => {
  const invalid = scheduleIntent();
  invalid.schedule_items.push({ ...invalid.schedule_items[0] });
  generateContent
    .mockResolvedValueOnce({ text: JSON.stringify(invalid) })
    .mockResolvedValueOnce({ text: JSON.stringify(scheduleIntent()) });
  const result = await generateSchedule(request);
  expect(result.schedule_items).toHaveLength(1);
  expect(generateContent).toHaveBeenCalledTimes(2);
  expect(
    JSON.parse(generateContent.mock.calls[1][0].contents).validation_feedback,
  ).toContain("Duplicate sequence");
});
