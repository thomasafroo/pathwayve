import { z } from "zod";

export const planningLocationSchema = z.object({
  tracking: z.boolean(),
  position: z
    .object({
      lat: z.number().min(-90).max(90),
      lng: z.number().min(-180).max(180),
      accuracy: z.number().nonnegative(),
      timestamp: z.number().nonnegative(),
    })
    .nullable(),
});
export type PlanningLocation = z.infer<typeof planningLocationSchema>;

export function usablePlanningLocation(value?: PlanningLocation | null) {
  const position = value?.position;
  if (!value?.tracking || !position) return null;
  const age = Date.now() - position.timestamp;
  return age >= -10000 && age <= 60000 ? position : null;
}
