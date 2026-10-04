import { afterEach, beforeEach, expect, it, vi } from "vitest";
import type { GoogleGenAI } from "@google/genai";
import {
  confirms,
  groundPlaces,
  groundingMode,
  parseVerdict,
} from "@/lib/maps-grounding";
import type { CandidatePlace } from "@/types/trip";

const place = (id: string, name: string): CandidatePlace => ({
  id,
  name,
  category: "coffee",
  location: { lat: 49.28, lng: -123.11 },
  address: `${name} St, Vancouver`,
});
const quiet = place("ChIJquiet", "Quiet Beans");
const busy = place("ChIJbusy", "Busy Brew");
const unknown = place("ChIJunknown", "Mystery Cafe");

// Replies are keyed by the place name in each single-place prompt.
function fakeAi(replies: Record<string, string>, chunkList: unknown[]) {
  const generateContent = vi.fn(async (request: { contents: string }) => {
    const name = Object.keys(replies).find((key) =>
      request.contents.includes(`"${key}"`),
    );
    return {
      text: name ? replies[name] : "",
      candidates: [{ groundingMetadata: { groundingChunks: chunkList } }],
    };
  });
  return {
    ai: { models: { generateContent } } as unknown as GoogleGenAI,
    generateContent,
  };
}
const chunks = [
  {
    maps: {
      placeId: "places/ChIJquiet",
      title: "Quiet Beans - Google Maps",
      uri: "https://maps.google.com/?cid=1",
      text: "**Attributes:** Popular for: good for working on laptop. Amenities: free Wi-Fi. Atmosphere: quiet, cozy.",
    },
  },
  {
    maps: {
      placeId: "ChIJquiet",
      title: "Review of Quiet Beans - Google Maps",
      uri: "https://www.google.com/maps/reviews/1",
      text: "Calm spot with plenty of tables. (2026-05-01)",
    },
  },
  {
    maps: {
      placeId: "ChIJbusy",
      title: "Busy Brew - Google Maps",
      uri: "https://maps.google.com/?cid=2",
      text: "Atmosphere: trendy. Crowd: tourists.",
    },
  },
];
const input = {
  want: "Work for an hour (coffee shop)",
  requirements: ["quiet", "wifi"] as ("quiet" | "wifi")[],
  near: quiet.location,
  candidates: [quiet, busy, unknown],
};

beforeEach(() => {
  vi.stubEnv("MAPS_DATA_MODE", "live");
  vi.stubEnv("GEMINI_API_KEY", "test-key");
});
afterEach(() => vi.unstubAllEnvs());

it("turns grounded verdicts into insights with Google Maps sources", async () => {
  const { ai, generateContent } = fakeAi(
    {
      "Quiet Beans": `SUMMARY: A calm café that reviewers use for laptop work [1.1].
FIT: 9
HIGHLIGHTS: Good for working on laptop; Free Wi-Fi
CONCERNS: none
quiet: yes — "Atmosphere: quiet, cozy"
wifi: yes — "free Wi-Fi"`,
      "Busy Brew": `**SUMMARY:** Trendy and usually full of tourists.
**FIT:** 3
**HIGHLIGHTS:**
**CONCERNS:** Likely noisy.
quiet: no — "Crowd: tourists"
wifi: unknown — "none"`,
      "Mystery Cafe": "SUMMARY: Lovely.\nFIT: 10\nHIGHLIGHTS: Everything",
    },
    chunks,
  );
  const insights = await groundPlaces(input, ai);
  const request = generateContent.mock.calls[0][0] as never as {
    contents: string;
    config: {
      tools: unknown;
      toolConfig: { retrievalConfig: { latLng: unknown } };
      responseMimeType?: string;
    };
  };
  expect(request.contents).toContain('Look up "Quiet Beans" at Quiet Beans St');
  expect(request.contents).toContain("Requirements to check: quiet, wifi");
  expect(request.config.tools).toEqual([{ googleMaps: {} }]);
  expect(request.config.toolConfig.retrievalConfig.latLng).toEqual({
    latitude: quiet.location.lat,
    longitude: quiet.location.lng,
  });
  expect(request.config.responseMimeType).toBeUndefined();
  expect(insights.get(quiet.id)).toMatchObject({
    fit: 9,
    summary: "A calm café that reviewers use for laptop work.",
    highlights: ["Good for working on laptop", "Free Wi-Fi"],
    verified: ["quiet", "wifi"],
    checkedFor: input.want,
    sources: [
      {
        kind: "place",
        title: "Quiet Beans",
        uri: "https://maps.google.com/?cid=1",
      },
      {
        kind: "review",
        uri: "https://www.google.com/maps/reviews/1",
        excerpt: "Calm spot with plenty of tables. (2026-05-01)",
      },
    ],
  });
  expect(insights.get(quiet.id)).not.toHaveProperty("concerns");
  expect(insights.get(busy.id)).toMatchObject({
    fit: 3,
    highlights: [],
    verified: [],
    concerns: "Likely noisy.",
  });
  // No Google Maps data came back for this place, so nothing is claimed about
  // it, even after one retry.
  expect(insights.has(unknown.id)).toBe(false);
  expect(
    generateContent.mock.calls.filter(([call]) =>
      call.contents.includes('"Mystery Cafe"'),
    ),
  ).toHaveLength(2);
});

it("verifies amenities only from un-negated quotes in the place's own data", () => {
  const data =
    "amenities: free wi-fi. atmosphere: not quiet. dining options: seating, no table service";
  expect(confirms("wifi", "Free Wi-Fi", data)).toBe(true);
  expect(confirms("seating", "dining options: seating", data)).toBe(true);
  expect(confirms("quiet", "quiet", data)).toBe(false);
  expect(confirms("wifi", "Fast free wifi everywhere", data)).toBe(false);
  expect(confirms("quiet", "Amenities: free Wi-Fi", data)).toBe(false);
  expect(confirms("wifi", "no wi-fi", "amenities: no wi-fi")).toBe(false);
});

it("ignores unparsable replies", async () => {
  const { ai } = fakeAi({ "Quiet Beans": "Sorry, I can't help." }, chunks);
  expect((await groundPlaces(input, ai)).size).toBe(0);
});

it("parses labelled verdicts", () => {
  expect(
    parseVerdict(`SUMMARY: Good.
FIT: 7/10
HIGHLIGHTS: A; B
CONCERNS: None.
seating: yes — “large communal table”
wifi: no — "no wifi"`),
  ).toEqual({
    summary: "Good.",
    fit: 7,
    highlights: ["A", " B"],
    claims: { seating: "large communal table" },
  });
  expect(parseVerdict("FIT: 12\nSUMMARY: x")).toBeNull();
});

it("uses each place's own purpose and requirements when given", async () => {
  const { ai, generateContent } = fakeAi(
    {
      "Quiet Beans": `SUMMARY: Fine for a quick stop.
FIT: 7
HIGHLIGHTS: Free Wi-Fi
CONCERNS: none
wifi: yes — "Amenities: free Wi-Fi"
quiet: yes — "Atmosphere: quiet"`,
    },
    chunks,
  );
  const insights = await groundPlaces(
    {
      ...input,
      candidates: [quiet],
      perPlace: new Map([
        [quiet.id, { want: "Answer emails", requirements: ["wifi"] }],
      ]),
    },
    ai,
  );
  const sent = (generateContent.mock.calls[0][0] as { contents: string })
    .contents;
  expect(sent).toContain("Traveller wants: Answer emails");
  expect(sent).toContain("Requirements to check: wifi");
  expect(insights.get(quiet.id)).toMatchObject({
    checkedFor: "Answer emails",
    verified: ["wifi"],
  });
});

it("is on only with live Maps data and a Gemini key unless disabled", () => {
  vi.stubEnv("MAPS_GROUNDING", "");
  expect(groundingMode()).toBe("live");
  vi.stubEnv("MAPS_GROUNDING", "off");
  expect(groundingMode()).toBe("off");
  vi.stubEnv("MAPS_GROUNDING", "");
  vi.stubEnv("MAPS_DATA_MODE", "demo");
  expect(groundingMode()).toBe("off");
});
