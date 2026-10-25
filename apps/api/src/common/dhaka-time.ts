const DHAKA_OFFSET_MS = 6 * 3600_000;

/** First instant (UTC) of the Asia/Dhaka calendar month containing `now`, shifted by `monthsAhead`. */
export function dhakaMonthStart(now = new Date(), monthsAhead = 0): Date {
  const local = new Date(now.getTime() + DHAKA_OFFSET_MS);
  const startLocal = Date.UTC(local.getUTCFullYear(), local.getUTCMonth() + monthsAhead, 1);
  return new Date(startLocal - DHAKA_OFFSET_MS);
}
