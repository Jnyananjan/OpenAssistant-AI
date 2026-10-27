// src/shared/time.ts

/**
 * Format a Date or ISO UTC string into a human-readable local string for the given timezone.
 */
export function formatLocalTime(
  dateOrIso: Date | string,
  timeZone: string = 'Asia/Kolkata',
  options: Intl.DateTimeFormatOptions = {
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
    timeZoneName: 'short',
  }
): string {
  const date = typeof dateOrIso === 'string' ? new Date(dateOrIso) : dateOrIso;
  try {
    return new Intl.DateTimeFormat('en-US', { ...options, timeZone }).format(date);
  } catch {
    // Fallback to UTC if timezone is invalid
    return new Intl.DateTimeFormat('en-US', { ...options, timeZone: 'UTC' }).format(date);
  }
}

/**
 * Format date + time for full display, e.g. "Tomorrow at 6:00 PM IST" or "Mon, Oct 26, 6:00 PM IST"
 */
export function formatLocalDateTime(
  dateOrIso: Date | string,
  timeZone: string = 'Asia/Kolkata'
): string {
  const date = typeof dateOrIso === 'string' ? new Date(dateOrIso) : dateOrIso;
  try {
    return new Intl.DateTimeFormat('en-US', {
      weekday: 'short',
      month: 'short',
      day: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
      hour12: true,
      timeZoneName: 'short',
      timeZone,
    }).format(date);
  } catch {
    return new Intl.DateTimeFormat('en-US', {
      weekday: 'short',
      month: 'short',
      day: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
      hour12: true,
      timeZoneName: 'short',
      timeZone: 'UTC',
    }).format(date);
  }
}

/**
 * Converts a local ISO string (e.g. "2026-10-26T18:00:00") and an IANA timezone into a UTC Date.
 * Handles daylight saving and fixed offsets reliably using Intl.DateTimeFormat.
 */
export function parseLocalToUtc(localIsoString: string, timeZone: string = 'Asia/Kolkata'): Date {
  // If it already has Z or an offset (+05:30), parse directly
  if (localIsoString.endsWith('Z') || /[+-]\d{2}:\d{2}$/.test(localIsoString)) {
    return new Date(localIsoString);
  }

  // Parse YYYY-MM-DDTHH:mm:ss components
  const parts = localIsoString.split(/[-T:.]/);
  if (parts.length < 5) {
    throw new Error(`Invalid local ISO string format: ${localIsoString}`);
  }

  const year = parseInt(parts[0], 10);
  const month = parseInt(parts[1], 10);
  const day = parseInt(parts[2], 10);
  const hour = parseInt(parts[3], 10);
  const minute = parseInt(parts[4], 10);
  const second = parts[5] ? parseInt(parts[5], 10) : 0;

  // Assume initial UTC guess
  const utcGuess = new Date(Date.UTC(year, month - 1, day, hour, minute, second));

  // Determine timezone offset difference for the target timezone around this time
  const formatter = new Intl.DateTimeFormat('en-US', {
    timeZone,
    year: 'numeric',
    month: 'numeric',
    day: 'numeric',
    hour: 'numeric',
    minute: 'numeric',
    second: 'numeric',
    hour12: false,
  });

  const formattedParts = formatter.formatToParts(utcGuess);
  const partMap: Record<string, number> = {};
  for (const part of formattedParts) {
    if (part.type !== 'literal') {
      partMap[part.type] = parseInt(part.value, 10);
    }
  }

  // Formatted parts in target timezone for the guess
  const tzHour = partMap.hour === 24 ? 0 : partMap.hour;
  const targetTimeInTz = Date.UTC(
    partMap.year,
    partMap.month - 1,
    partMap.day,
    tzHour,
    partMap.minute,
    partMap.second
  );

  // Offset in milliseconds between UTC guess and target timezone representation
  const offsetMs = targetTimeInTz - utcGuess.getTime();

  // The actual UTC date is utcGuess - offsetMs
  return new Date(utcGuess.getTime() - offsetMs);
}
