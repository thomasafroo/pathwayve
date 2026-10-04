import { z } from "zod";

export const calendarSelectionSchema = z
  .object({
    calendarId: z.string().min(1).max(1024),
    startDate: z.iso.date(),
    endDate: z.iso.date(),
  })
  .refine((value) => {
    const days =
      (Date.parse(value.endDate) - Date.parse(value.startDate)) / 86400000;
    return days >= 0 && days < 31;
  }, "Choose a range of up to 31 days.");
export type CalendarSelection = z.infer<typeof calendarSelectionSchema>;
export type GoogleCalendarSummary = {
  id: string;
  summary: string;
  timeZone: string;
  accessRole: string;
  primary?: boolean;
};
export const calendarEventSchema = z.object({
  uid: z.string(),
  title: z.string(),
  location: z.string(),
  start: z.iso.datetime({ offset: true }),
  end: z.iso.datetime({ offset: true }),
  allDay: z.boolean(),
  dateStart: z.iso.date().optional(),
  dateEnd: z.iso.date().optional(),
  busy: z.boolean(),
});
export type CalendarEvent = z.infer<typeof calendarEventSchema>;
