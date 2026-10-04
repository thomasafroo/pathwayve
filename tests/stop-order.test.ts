import { expect, it } from "vitest";
import { optimizeStopOrder } from "@/lib/stop-order";
import { AppError } from "@/lib/server/http";
it("keeps locked positions and finds the faster reversed free sequence", async () => {
  const result = await optimizeStopOrder(
    [0, 1, 2],
    (i) => i === 1,
    async (order) => ({ arrival: order[0] === 2 ? 10 : 50 }),
  );
  expect(result.order).toEqual([2, 1, 0]);
});
it("retains original order on ties and skips unavailable journeys", async () => {
  const result = await optimizeStopOrder(
    [0, 1, 2],
    () => false,
    async (order) => {
      if (order[0] === 2) throw new AppError("NO_ROUTE", "Unavailable");
      return { arrival: 10 };
    },
  );
  expect(result.order).toEqual([0, 1, 2]);
  expect(result.evaluated).toBe(6);
});
it("bounds six-stop comparisons and propagates provider failures", async () => {
  const result = await optimizeStopOrder(
    [0, 1, 2, 3, 4, 5],
    () => false,
    async () => null,
  );
  expect(result.evaluated).toBeLessThanOrEqual(12);
  expect(result.result).toBeNull();
  await expect(
    optimizeStopOrder(
      [0, 1],
      () => false,
      async () => {
        throw new Error("Quota exceeded");
      },
    ),
  ).rejects.toThrow("Quota exceeded");
});
