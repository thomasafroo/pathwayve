import { z } from "zod";
const point = z.object({
  day: z.number().int().min(0).max(6).default(0),
  hour: z.number().int().min(0).max(23).default(0),
  minute: z.number().int().min(0).max(59).default(0),
  date: z
    .object({ year: z.number(), month: z.number(), day: z.number() })
    .optional(),
  truncated: z.boolean().optional(),
});
export const providerHoursSchema = z.object({
  periods: z
    .array(z.object({ open: point, close: point.optional() }))
    .default([]),
  weekdayDescriptions: z.array(z.string()).optional(),
});
export const openingHoursSchema = z.object({
  timeZone: z.string().optional(),
  regular: providerHoursSchema.optional(),
  current: providerHoursSchema.optional(),
  checkedAt: z.iso.datetime({ offset: true }),
  businessStatus: z.string().optional(),
});
export const providerHoursFields = {
  regularOpeningHours: providerHoursSchema.optional(),
  currentOpeningHours: providerHoursSchema.optional(),
  timeZone: z.object({ id: z.string() }).optional(),
  businessStatus: z.string().optional(),
};
export const hoursFieldMask =
  "regularOpeningHours,currentOpeningHours,timeZone,businessStatus";
export function readOpeningHours(place: {
  regularOpeningHours?: z.infer<typeof providerHoursSchema>;
  currentOpeningHours?: z.infer<typeof providerHoursSchema>;
  timeZone?: { id: string };
  businessStatus?: string;
}) {
  return openingHoursSchema.parse({
    regular: place.regularOpeningHours,
    current: place.currentOpeningHours,
    timeZone: place.timeZone?.id,
    businessStatus: place.businessStatus,
    checkedAt: new Date().toISOString(),
  });
}
