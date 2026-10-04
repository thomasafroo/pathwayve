import { expect, it } from "vitest";
import { mergePreferenceNotes } from "@/lib/preference-notes";
import { enforceScheduleConstraints } from "@/lib/schedule-constraints";
import { scheduleIntent } from "./fixtures/schedule";

it("cleans repeated notes and remains stable across model echoes", () => {
  let notes = "I don't like purebread bakery";
  for (let i = 0; i < 5; i++) notes = mergePreferenceNotes(notes, notes);
  expect(notes).toBe("I don't like purebread bakery");
  expect(mergePreferenceNotes(Array(5).fill(notes).join("\n"))).toBe(notes);
});
it("deduplicates casing, whitespace and apostrophes while preserving distinct preferences", () => {
  expect(
    mergePreferenceNotes(
      "I don't like purebread bakery",
      "  I DON’T like  purebread bakery\r\nQuiet cafes\nVegetarian food",
    ),
  ).toBe("I don't like purebread bakery\nQuiet cafes\nVegetarian food");
});
it("normalizes model-only notes even without sidebar constraints", () => {
  const draft = scheduleIntent();
  draft.schedules[0].preferences.notes = "Quiet cafes\nQuiet cafes";
  expect(enforceScheduleConstraints(draft).schedules[0].preferences.notes).toBe(
    "Quiet cafes",
  );
});
