// Dates: one place, so every screen prints them the same way.
// UI strings follow the browser's locale; pass a locale (e.g. "en-US") for text sent to the coach.

/** Local noon on that day (avoids time-zone edge cases when formatting or diffing days). */
export const parseISO = (iso: string) => { const [y, m, d] = iso.split("-").map(Number); return new Date(y, m - 1, d, 12); };
export const toISO = (d: Date) => { const x = new Date(d); x.setHours(12); return x.toISOString().slice(0, 10); };

export const shortDate = (iso: string, locale?: string) => parseISO(iso).toLocaleDateString(locale, { month: "short", day: "numeric" });     // Nov 27
export const weekday = (iso: string, locale?: string) => parseISO(iso).toLocaleDateString(locale, { weekday: "short" });                   // Thu
export const dayHeading = (iso: string, locale?: string) => parseISO(iso).toLocaleDateString(locale, { weekday: "long", month: "short", day: "numeric" }); // Thursday, Nov 27
export const longDate = (iso: string, locale?: string) => parseISO(iso).toLocaleDateString(locale, { weekday: "long", month: "long", day: "numeric" });  // Thursday, November 27
export const dateWithYear = (iso: string, locale?: string) => parseISO(iso).toLocaleDateString(locale, { month: "short", day: "numeric", year: "numeric" });
/** A full timestamp (e.g. created_at) as "Nov 27, 2026". */
export const stampDate = (ts: string, locale?: string) => new Date(ts).toLocaleDateString(locale, { month: "short", day: "numeric", year: "numeric" });
export const dateRange = (a: string, b: string) => `${shortDate(a)} - ${shortDate(b)}`;
export const daysBetween = (a: string, b: string) => Math.round((+parseISO(b) - +parseISO(a)) / 86400000);
