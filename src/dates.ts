/**
 * Calendar helpers on plain YYYY-MM-DD strings. The maths runs in UTC so daylight-saving
 * changes on the phone can never skip or repeat a day. Weeks start on Monday.
 */

export type Period = 'day' | 'week' | 'month';

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const MON3 = MONTHS.map((m) => m.slice(0, 3));
const DOW3 = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

function parse(iso: string) {
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d));
}
function fmt(d: Date) {
  return d.toISOString().slice(0, 10);
}

export function addDays(iso: string, n: number) {
  const d = parse(iso);
  d.setUTCDate(d.getUTCDate() + n);
  return fmt(d);
}

/** Every date from `from` to `to`, inclusive. */
export function eachDay(from: string, to: string) {
  const out: string[] = [];
  for (let d = from; d <= to; d = addDays(d, 1)) out.push(d);
  return out;
}

/** Days from `from` to `to`, counting both ends (0 when `to` is before `from`). */
export function dayCount(from: string, to: string) {
  return to < from ? 0 : Math.round((parse(to).getTime() - parse(from).getTime()) / 86400000) + 1;
}

export function weekStart(iso: string) {
  const dow = parse(iso).getUTCDay(); // 0 = Sunday
  return addDays(iso, -((dow + 6) % 7));
}

export function monthStart(iso: string) {
  return `${iso.slice(0, 7)}-01`;
}

export function monthEnd(iso: string) {
  const d = parse(monthStart(iso));
  d.setUTCMonth(d.getUTCMonth() + 1);
  d.setUTCDate(0);
  return fmt(d);
}

/** First and last day of the period that contains `anchor`. */
export function rangeOf(period: Period, anchor: string) {
  if (period === 'day') return { from: anchor, to: anchor };
  if (period === 'week') {
    const from = weekStart(anchor);
    return { from, to: addDays(from, 6) };
  }
  return { from: monthStart(anchor), to: monthEnd(anchor) };
}

/** The anchor of the period `by` steps away (by = -1 is the previous one). */
export function shiftPeriod(period: Period, anchor: string, by: number) {
  if (period === 'day') return addDays(anchor, by);
  if (period === 'week') return addDays(weekStart(anchor), 7 * by);
  const d = parse(monthStart(anchor));
  d.setUTCMonth(d.getUTCMonth() + by);
  return fmt(d);
}

export function dayOfWeek(iso: string) {
  return DOW3[parse(iso).getUTCDay()];
}

export function dayOfMonth(iso: string) {
  return Number(iso.slice(8, 10));
}

/** "21 Nov", or "21 Nov 2025" when the year differs from `today`. */
export function shortDate(iso: string, today: string) {
  const [y, m, d] = iso.split('-');
  return `${Number(d)} ${MON3[Number(m) - 1]}${y === today.slice(0, 4) ? '' : ` ${y}`}`;
}

/** "November 2026" from YYYY-MM or YYYY-MM-DD. */
export function monthLabel(iso: string) {
  const [y, m] = iso.split('-').map(Number);
  return `${MONTHS[m - 1]} ${y}`;
}

/** YYYY-MM for a JS Date in the phone's time zone. */
export function monthStr(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

/** Title for the period header: "Today", "This week", "17–23 Nov", "November 2026"... */
export function periodTitle(period: Period, anchor: string, today: string) {
  if (period === 'day') {
    if (anchor === today) return 'Today';
    if (anchor === addDays(today, -1)) return 'Yesterday';
    return `${dayOfWeek(anchor)} ${shortDate(anchor, today)}`;
  }
  if (period === 'week') {
    const { from } = rangeOf('week', anchor);
    const thisWeek = weekStart(today);
    if (from === thisWeek) return 'This week';
    if (from === addDays(thisWeek, -7)) return 'Last week';
    return weekRange(anchor, today);
  }
  if (monthStart(anchor) === monthStart(today)) return 'This month';
  return monthLabel(anchor);
}

/** Subtitle with the actual dates: "17–23 Nov", "28 Nov – 4 Dec", "November 2026". */
export function periodSubtitle(period: Period, anchor: string, today: string) {
  if (period === 'day') return `${dayOfWeek(anchor)} ${shortDate(anchor, anchor)} ${anchor.slice(0, 4)}`;
  if (period === 'week') return weekRange(anchor, today);
  return monthLabel(anchor);
}

function weekRange(anchor: string, today: string) {
  const { from, to } = rangeOf('week', anchor);
  const sameMonth = from.slice(0, 7) === to.slice(0, 7);
  const end = shortDate(to, today);
  return sameMonth ? `${dayOfMonth(from)}–${end}` : `${shortDate(from, today)} – ${end}`;
}
