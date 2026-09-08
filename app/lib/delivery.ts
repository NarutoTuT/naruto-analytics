import { localDate } from "./analytics-core";
export function dueDate(now: Date, timezone: string, time: string) {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: timezone,
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).format(now);
  return parts >= time ? localDate(now, timezone) : null;
}
