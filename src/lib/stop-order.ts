import { AppError } from "./server/http";

/** Compare bounded complete journeys; the evaluator must use actual timed routes. */
export async function optimizeStopOrder<T, R extends { arrival: number }>(
  items: T[],
  fixed: (item: T) => boolean,
  evaluate: (order: T[]) => Promise<R | null>,
) {
  const free = items.map((_, i) => i).filter((i) => !fixed(items[i]));
  const candidates = new Map<string, T[]>();
  function add(indices: number[]) {
    const order = [...items];
    free.forEach((slot, i) => {
      order[slot] = items[indices[i]];
    });
    candidates.set(indices.join(","), order);
  }
  add(free);
  add([...free].reverse());
  if (free.length <= 3) {
    function permute(prefix: number[], remaining: number[]) {
      if (!remaining.length) add(prefix);
      remaining.forEach((value) =>
        permute(
          [...prefix, value],
          remaining.filter((v) => v !== value),
        ),
      );
    }
    permute([], free);
  } else {
    // Evaluate relocation moves, bounded to avoid factorial provider requests.
    for (let from = 0; from < free.length && candidates.size < 12; from++) {
      for (let to = 0; to < free.length && candidates.size < 12; to++) {
        const moved = [...free];
        moved.splice(to, 0, moved.splice(from, 1)[0]);
        add(moved);
      }
    }
  }
  let best: { order: T[]; result: R } | null = null;
  for (const order of candidates.values()) {
    try {
      const result = await evaluate(order);
      if (result && (!best || result.arrival < best.result.arrival))
        best = { order, result };
    } catch (error) {
      if (!(error instanceof AppError && error.code === "NO_ROUTE"))
        throw error;
    }
  }
  return {
    order: best?.order ?? items,
    result: best?.result ?? null,
    evaluated: candidates.size,
  };
}
