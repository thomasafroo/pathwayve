import { expect, it } from "vitest";
import { scopedPlaceQuery } from "@/lib/place-scope";
it("keeps generic route discovery and time qualifiers distinct from geography", () => {
  for (const text of [
    "Breakfast along the way",
    "Coffee near the route",
    "Breakfast in the morning",
    "Coffee",
    "Coffee near me",
  ])
    expect(scopedPlaceQuery(text, text)).toBeNull();
  expect(scopedPlaceQuery("No Frills near UBC", "No Frills")).toBe(
    "No Frills near UBC",
  );
  expect(
    scopedPlaceQuery("Movie theater", "movie theater in downtown Vancouver"),
  ).toBe("movie theater in downtown Vancouver");
  expect(scopedPlaceQuery("Bookstore in Victoria", "bookstore")).toBe(
    "Bookstore in Victoria",
  );
});
