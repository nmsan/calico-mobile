import { api } from './api';
import { eachDay } from './dates';
import type { Sale, SalesDay } from './types';

/**
 * In-memory store of daily sales totals (and, for days opened in the Day view, their sale lines).
 * Each Apps Script call takes 1–3 seconds, so periods already seen are served from here and
 * only missing days are asked for. The Home screen clears it on focus and on pull-to-refresh.
 */
const days = new Map<string, SalesDay>();
const lines = new Map<string, Sale[]>();
let serverToday: string | null = null;
let generation = 0; // bumped by clear(), so a request that was in flight can't refill a cleared cache
const inflight = new Map<string, Promise<void>>();

export function clearSalesCache() {
  days.clear();
  lines.clear();
  inflight.clear();
  generation++;
}

export function cachedToday() {
  return serverToday;
}

export function readDays(from: string, to: string): SalesDay[] | null {
  const out: SalesDay[] = [];
  for (const d of eachDay(from, to)) {
    const x = days.get(d);
    if (!x) return null;
    out.push(x);
  }
  return out;
}

export function readLines(date: string): Sale[] | null {
  return lines.get(date) ?? null;
}

/** Make sure every day from `from` to `to` is cached (with sale lines when `withLines`). */
export async function ensureDays(from: string, to: string, withLines = false) {
  const all = eachDay(from, to);
  const missing = all.filter((d) => !days.has(d) || (withLines && !lines.has(d)));
  if (!missing.length) return;
  // Only ask for the span that is actually missing.
  const a = missing[0];
  const b = missing[missing.length - 1];
  const key = `${a}|${b}|${withLines ? 1 : 0}`;
  let p = inflight.get(key);
  if (!p) {
    const gen = generation;
    p = api
      .salesDaily(a, b, withLines)
      .then((r) => {
        if (gen !== generation) return;
        serverToday = r.today;
        r.days.forEach((d) => days.set(d.date, d));
        if (withLines) {
          const byDate = new Map<string, Sale[]>(eachDay(a, b).map((d) => [d, []]));
          (r.lines ?? []).forEach((s) => byDate.get(s.date)?.push(s));
          byDate.forEach((v, k) => lines.set(k, v));
        }
      })
      .finally(() => inflight.delete(key));
    inflight.set(key, p);
  }
  await p;
}
