import { z } from "zod";

export const NonEmptyStringSchema = z.string().trim().min(1);
export const IdentifierSchema = NonEmptyStringSchema;

const ISO_DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/u;
const ISO_DATE_TIME_PATTERN =
  /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/u;

function isValidCalendarDate(value: string): boolean {
  const [yearText, monthText, dayText] = value.split("-");
  const year = Number(yearText);
  const month = Number(monthText);
  const day = Number(dayText);
  const date = new Date(0);

  date.setUTCHours(0, 0, 0, 0);
  date.setUTCFullYear(year, month - 1, day);

  return (
    date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day
  );
}

export const IsoTemporalSchema = z.string().refine((value) => {
  if (ISO_DATE_PATTERN.test(value)) {
    return isValidCalendarDate(value);
  }

  return (
    ISO_DATE_TIME_PATTERN.test(value) &&
    isValidCalendarDate(value.slice(0, 10)) &&
    !Number.isNaN(Date.parse(value))
  );
}, "Expected an ISO 8601 date or timezone-qualified date-time");

export type IsoTemporal = z.infer<typeof IsoTemporalSchema>;
