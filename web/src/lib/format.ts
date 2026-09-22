const dateFormatter = new Intl.DateTimeFormat(undefined, { month: "short", day: "numeric", year: "numeric" });
const timeFormatter = new Intl.DateTimeFormat(undefined, { hour: "numeric", minute: "2-digit" });

function isValidDate(d: Date): boolean {
  return !Number.isNaN(d.getTime());
}

/** Guards against malformed/legacy records missing a real start or end
 * date, rather than throwing and taking the whole list down. */
export function formatSessionTitle(startDateIso: string, endDateIso: string): string {
  const start = new Date(startDateIso);
  const end = new Date(endDateIso);
  if (!isValidDate(start) || !isValidDate(end)) {
    return "Unknown time (missing start/end date)";
  }
  return `${dateFormatter.format(start)} · ${timeFormatter.format(start)}–${timeFormatter.format(end)}`;
}

/** e.g. 95 -> "1m 35s", 27*60 -> "27m" */
export function formatDuration(totalSeconds: number): string {
  const seconds = Math.round(totalSeconds);
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const secs = seconds % 60;

  if (hours > 0) return `${hours}h ${minutes}m`;
  if (minutes > 0) return secs > 0 && minutes < 5 ? `${minutes}m ${secs}s` : `${minutes}m`;
  return `${secs}s`;
}

export function formatBpm(value: number | null): string {
  return value === null ? "—" : `${Math.round(value)} bpm`;
}

export function formatPercent(value: number | null): string {
  return value === null ? "—" : `${value.toFixed(1)}%`;
}
