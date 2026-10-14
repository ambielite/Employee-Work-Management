export const mins = (ms: number) => Math.max(0, Math.floor(ms / 60000));

const DEFAULT_TIMEZONE = "Asia/Kolkata";

type ZonedParts = {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
};

/**
 * Get date/time parts for a Date in a specific IANA timezone.
 *
 * Example:
 * Asia/Kolkata
 * Asia/Dubai
 * Europe/London
 * America/New_York
 */
function getZonedParts(date: Date, timeZone = DEFAULT_TIMEZONE): ZonedParts {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(date);

  const values: Record<string, number> = {};

  for (const part of parts) {
    if (
      part.type === "year" ||
      part.type === "month" ||
      part.type === "day" ||
      part.type === "hour" ||
      part.type === "minute"
    ) {
      values[part.type] = Number(part.value);
    }
  }

  return {
    year: values.year,
    month: values.month,
    day: values.day,
    hour: values.hour,
    minute: values.minute,
  };
}

/**
 * Convert a wall-clock date/time from a named timezone
 * into the corresponding JavaScript Date/UTC instant.
 *
 * This prevents attendance scheduling from depending
 * on the timezone configured on the backend server.
 */
function zonedPartsToDate(
  parts: ZonedParts,
  timeZone = DEFAULT_TIMEZONE,
): Date {
  const utcGuess = new Date(
    Date.UTC(
      parts.year,
      parts.month - 1,
      parts.day,
      parts.hour,
      parts.minute,
      0,
      0,
    ),
  );

  const actual = getZonedParts(utcGuess, timeZone);

  const actualAsUtc = Date.UTC(
    actual.year,
    actual.month - 1,
    actual.day,
    actual.hour,
    actual.minute,
    0,
    0,
  );

  const targetAsUtc = Date.UTC(
    parts.year,
    parts.month - 1,
    parts.day,
    parts.hour,
    parts.minute,
    0,
    0,
  );

  return new Date(utcGuess.getTime() + (targetAsUtc - actualAsUtc));
}

/**
 * Existing dayKey helper.
 *
 * Kept for compatibility with existing code that
 * intentionally depends on the server's local timezone.
 */
export const dayKey = (d = new Date()) =>
  new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));

/**
 * Get the calendar date for a Date using the
 * configured company timezone.
 *
 * The returned Date represents midnight of that
 * company-local calendar date in UTC form.
 */
export const dayKeyInTimeZone = (
  d = new Date(),
  timeZone = DEFAULT_TIMEZONE,
) => {
  const parts = getZonedParts(d, timeZone);

  return new Date(Date.UTC(parts.year, parts.month - 1, parts.day));
};

/**
 * Get weekday name using the configured company timezone.
 *
 * Example:
 * Monday
 * Tuesday
 * Saturday
 * Sunday
 */
export const weekdayInTimeZone = (
  d = new Date(),
  timeZone = DEFAULT_TIMEZONE,
) =>
  new Intl.DateTimeFormat("en-US", {
    timeZone,
    weekday: "long",
  }).format(d);

/**
 * Existing atTime helper.
 *
 * Kept unchanged for compatibility with existing
 * functionality that uses the server's local timezone.
 */
export const atTime = (date: Date, hhmm: string) => {
  const [h, m] = hhmm.split(":").map(Number);

  const x = new Date(date);

  x.setHours(h, m, 0, 0);

  return x;
};

/**
 * Create a scheduled Date using the company's
 * configured timezone.
 *
 * Example:
 *
 * current date in Asia/Kolkata
 * startTime = "09:30"
 *
 * returns the correct UTC instant representing
 * 09:30 Asia/Kolkata.
 */
export const atTimeInTimeZone = (
  date: Date,
  hhmm: string,
  timeZone = DEFAULT_TIMEZONE,
) => {
  const [hour, minute] = hhmm.split(":").map(Number);

  if (
    !Number.isInteger(hour) ||
    !Number.isInteger(minute) ||
    hour < 0 ||
    hour > 23 ||
    minute < 0 ||
    minute > 59
  ) {
    throw new Error(`Invalid time value: ${hhmm}`);
  }

  const parts = getZonedParts(date, timeZone);

  return zonedPartsToDate(
    {
      year: parts.year,
      month: parts.month,
      day: parts.day,
      hour,
      minute,
    },
    timeZone,
  );
};

/**
 * Calculate total minutes from interval rows.
 *
 * Open intervals use the supplied current time.
 */
export function sumIntervals(
  rows: {
    startedAt: Date;
    endedAt: Date | null;
  }[],
  now = new Date(),
) {
  return rows.reduce(
    (total, row) =>
      total + mins((row.endedAt ?? now).getTime() - row.startedAt.getTime()),
    0,
  );
}
