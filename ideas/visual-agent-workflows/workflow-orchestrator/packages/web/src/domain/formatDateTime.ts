// An ISO time as the viewer's local date and time, e.g. "12 Oct 2026, 08:15";
// "—" for an empty or unreadable value.
export function formatDateTime(iso: string, locale?: string, timeZone?: string): string {
  const date = new Date(iso);
  if (!iso || Number.isNaN(date.getTime())) return "—";
  return new Intl.DateTimeFormat(locale, { dateStyle: "medium", timeStyle: "short", ...(timeZone ? { timeZone } : {}) }).format(date);
}
