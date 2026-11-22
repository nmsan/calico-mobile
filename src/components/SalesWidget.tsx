import { Ionicons } from '@expo/vector-icons';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Animated, PanResponder, Pressable, StyleSheet, Text, View } from 'react-native';
import { addDays, dayCount, dayOfWeek, Period, periodSubtitle, periodTitle, rangeOf, shiftPeriod, shortDate } from '../dates';
import { cachedToday, clearSalesCache, ensureDays, readDays, readLines } from '../salesCache';
import { colors } from '../theme';
import type { Sale, SalesDay } from '../types';
import { Badge, Card, Divider, ErrorText, Hero, moneyShort, Segmented, SectionLabel, tap, today as deviceToday, ui } from '../ui';
import { SalesChart } from './SalesChart';

const SWIPE_MIN = 50;

/** The days a view needs: the period itself plus the one before it, for the comparison. */
function neededRange(period: Period, anchor: string) {
  const cur = rangeOf(period, anchor);
  if (period === 'day') return { from: addDays(anchor, -7), to: anchor };
  return { from: rangeOf(period, shiftPeriod(period, anchor, -1)).from, to: cur.to };
}

function sum(days: SalesDay[], from: string, to: string) {
  return days.filter((d) => d.date >= from && d.date <= to).reduce((a, d) => a + d.total, 0);
}

/**
 * The comparison for the header: this period against the previous one. While the period is still
 * running, only the days so far are compared with the same number of days at the start of the last one.
 */
function comparison(period: Period, anchor: string, today: string, days: SalesDay[]) {
  if (period === 'day') {
    const prev = addDays(anchor, -7);
    return { cur: sum(days, anchor, anchor), prev: sum(days, prev, prev), when: `last ${dayOfWeek(prev)}` };
  }
  const cur = rangeOf(period, anchor);
  const prev = rangeOf(period, shiftPeriod(period, anchor, -1));
  const running = today >= cur.from && today <= cur.to;
  const unit = period === 'week' ? 'week' : 'month';
  if (!running) return { cur: sum(days, cur.from, cur.to), prev: sum(days, prev.from, prev.to), when: `the ${unit} before` };
  const elapsed = dayCount(cur.from, today);
  const prevTo = addDays(prev.from, Math.min(elapsed, dayCount(prev.from, prev.to)) - 1);
  return { cur: sum(days, cur.from, today), prev: sum(days, prev.from, prevTo), when: `this time last ${unit}` };
}

export function SalesWidget({ refreshToken, onLoadingChange }: { refreshToken: number; onLoadingChange?: (loading: boolean) => void }) {
  const [period, setPeriod] = useState<Period>('day');
  const [anchor, setAnchor] = useState(() => cachedToday() ?? deviceToday());
  const [today, setToday] = useState(() => cachedToday() ?? deviceToday());
  const [selected, setSelected] = useState<string | null>(null);
  // Outcome of the last load, tagged with what it was for; anything else on screen is still loading.
  const [result, setResult] = useState<{ key: string; error: string | null } | null>(null);
  const [followToday, setFollowToday] = useState(true); // until the user moves away, keep the view on the server's today
  const lastToken = useRef(refreshToken);

  const range = rangeOf(period, anchor);
  const need = neededRange(period, anchor);
  const atLatest = range.to >= today;
  const key = `${period}|${anchor}|${refreshToken}`;
  const loading = result?.key !== key;
  const error = result?.key === key ? result.error : null;

  useEffect(() => {
    // Home screen focus or pull-to-refresh: drop everything and load the current view again.
    if (lastToken.current !== refreshToken) {
      lastToken.current = refreshToken;
      clearSalesCache();
    }
    let live = true;
    const withLines = period === 'day';
    ensureDays(need.from, need.to, withLines)
      .then(() => {
        if (!live) return;
        const t = cachedToday();
        if (t) {
          setToday(t);
          const r = rangeOf(period, anchor);
          if (followToday && !(r.from <= t && r.to >= t)) setAnchor(t);
        }
        setResult({ key, error: null });
        // Fetch the period before in the background so swiping back is instant.
        const back = neededRange(period, shiftPeriod(period, anchor, -1));
        ensureDays(back.from, back.to, withLines).catch(() => {});
      })
      .catch((e) => {
        if (live) setResult({ key, error: e instanceof Error ? e.message : String(e) });
      });
    return () => {
      live = false;
    };
  }, [period, anchor, refreshToken, need.from, need.to, key, followToday]);

  useEffect(() => onLoadingChange?.(loading), [loading, onLoadingChange]);

  const move = useCallback(
    (by: number) => {
      const next = shiftPeriod(period, anchor, by);
      if (by > 0 && rangeOf(period, next).from > today) return;
      tap();
      setFollowToday(false);
      setSelected(null);
      setAnchor(next);
    },
    [period, anchor, today]
  );

  function changePeriod(p: Period) {
    setSelected(null);
    // Keep looking at the same stretch of time: the selected/anchor day, but never a future one.
    setAnchor((a) => (a > today ? today : a));
    setPeriod(p);
  }

  function onBar(date: string) {
    tap();
    if (selected === date) {
      // Second tap on the same bar opens that day.
      setFollowToday(false);
      setSelected(null);
      setAnchor(date);
      setPeriod('day');
    } else setSelected(date);
  }

  // Swipe left/right to move between periods. Only claims clearly horizontal drags,
  // so the screen's vertical scroll keeps working.
  const [dx] = useState(() => new Animated.Value(0));
  const pan = useMemo(
    () =>
      PanResponder.create({
        onMoveShouldSetPanResponder: (_, g) => Math.abs(g.dx) > 12 && Math.abs(g.dx) > Math.abs(g.dy) * 1.5,
        onPanResponderMove: (_, g) => dx.setValue(g.dx < 0 && atLatest ? g.dx / 4 : g.dx * 0.6),
        onPanResponderRelease: (_, g) => {
          if (g.dx <= -SWIPE_MIN && !atLatest) move(1);
          else if (g.dx >= SWIPE_MIN) move(-1);
          Animated.spring(dx, { toValue: 0, useNativeDriver: true, bounciness: 4 }).start();
        },
        onPanResponderTerminate: () => Animated.spring(dx, { toValue: 0, useNativeDriver: true }).start(),
      }),
    [dx, move, atLatest]
  );

  const title = periodTitle(period, anchor, today);
  const subtitle = periodSubtitle(period, anchor, today);
  const allDays = readDays(need.from, need.to);
  const shown = allDays?.filter((d) => d.date >= range.from && d.date <= range.to) ?? null;
  const cmp = allDays ? comparison(period, anchor, today, allDays) : null;
  const sel = selected ? shown?.find((d) => d.date === selected) : undefined;
  const items = shown?.reduce((a, d) => a + d.qty, 0) ?? 0;
  const owed = shown?.reduce((a, d) => a + d.balance, 0) ?? 0;
  const dayLines = period === 'day' ? readLines(anchor) : null;

  return (
    <Card>
      <View style={[ui.between, { marginBottom: 12 }]}>
        <SectionLabel>Sales</SectionLabel>
        <Segmented<Period>
          value={period}
          onChange={changePeriod}
          style={{ width: 200 }}
          options={[
            { value: 'day', label: 'Day' },
            { value: 'week', label: 'Week' },
            { value: 'month', label: 'Month' },
          ]}
        />
      </View>

      <View style={ui.between}>
        <Pressable onPress={() => move(-1)} hitSlop={10} style={w.arrow} accessibilityRole="button" accessibilityLabel={`Previous ${period}`}>
          <Ionicons name="chevron-back" size={18} color={colors.ink} />
        </Pressable>
        <View style={{ alignItems: 'center', flex: 1 }}>
          <Text style={w.title}>{title}</Text>
          {!subtitle.startsWith(title) ? <Text style={w.subtitle}>{subtitle}</Text> : null}
        </View>
        <Pressable
          onPress={() => move(1)}
          hitSlop={10}
          disabled={atLatest}
          style={[w.arrow, atLatest && { opacity: 0.3 }]}
          accessibilityRole="button"
          accessibilityLabel={`Next ${period}`}
          accessibilityState={{ disabled: atLatest }}
        >
          <Ionicons name="chevron-forward" size={18} color={colors.ink} />
        </Pressable>
      </View>

      <Animated.View {...pan.panHandlers} style={{ transform: [{ translateX: dx }], opacity: loading && !shown ? 0.5 : 1 }}>
        <View style={{ marginTop: 14, minHeight: 64 }}>
          {sel ? (
            <>
              <Text style={ui.muted}>
                {dayOfWeek(sel.date)} {shortDate(sel.date, today)} · tap again to open
              </Text>
              <Hero size={30}>{moneyShort(sel.total)}</Hero>
              <Text style={w.meta}>
                {sel.qty} {sel.qty === 1 ? 'item' : 'items'}
                {sel.balance > 0 ? ` · ${moneyShort(sel.balance)} owed` : ''}
              </Text>
            </>
          ) : shown && cmp ? (
            <>
              <Hero size={30}>{moneyShort(cmp.cur)}</Hero>
              <Change cur={cmp.cur} prev={cmp.prev} when={cmp.when} />
            </>
          ) : (
            <View style={w.skeleton} />
          )}
        </View>

        {period === 'day' ? (
          <DayLines lines={dayLines} />
        ) : (
          <View style={{ marginTop: 14 }}>
            {shown ? <SalesChart days={shown} today={today} selected={selected} onSelect={onBar} /> : <View style={{ height: 172 }} />}
          </View>
        )}
      </Animated.View>

      {shown && period !== 'day' ? (
        <Text style={[w.meta, { marginTop: 10 }]}>
          {items} {items === 1 ? 'item' : 'items'} sold{owed > 0 ? ` · ${moneyShort(owed)} still owed` : ''}
        </Text>
      ) : null}
      <ErrorText message={error} />
    </Card>
  );
}

/** "▲ 12% vs this time last week", or a plain note when the earlier period had no sales. */
function Change({ cur, prev, when }: { cur: number; prev: number; when: string }) {
  if (cur === 0 && prev === 0) return <Text style={w.meta}>No sales</Text>;
  if (prev === 0) return <Text style={w.meta}>No sales {when}</Text>;
  const ratio = (cur - prev) / prev;
  if (Math.abs(ratio) < 0.005) return <Text style={w.meta}>Same as {when}</Text>;
  const up = ratio > 0;
  const color = up ? colors.ok : colors.owed;
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
      <Ionicons name={up ? 'caret-up' : 'caret-down'} size={12} color={color} />
      <Text style={[w.meta, { color, fontWeight: '600' }]}>{Math.abs(Math.round(ratio * 100))}%</Text>
      <Text style={w.meta}>vs {when}</Text>
    </View>
  );
}

/** The day's sale lines, newest first. */
function DayLines({ lines }: { lines: Sale[] | null }) {
  if (!lines) return <View style={{ height: 80 }} />;
  if (!lines.length)
    return (
      <View style={{ alignItems: 'center', paddingVertical: 22, gap: 6 }}>
        <Ionicons name="leaf-outline" size={22} color={colors.terra} />
        <Text style={ui.muted}>No sales on this day</Text>
      </View>
    );
  const qty = lines.reduce((a, s) => a + s.qty, 0);
  const owed = lines.reduce((a, s) => a + s.balance, 0);
  return (
    <View style={{ marginTop: 8 }}>
      <Text style={[w.meta, { marginBottom: 6 }]}>
        {qty} {qty === 1 ? 'item' : 'items'} sold{owed > 0 ? ` · ${moneyShort(owed)} still owed` : ''}
      </Text>
      {lines.map((s, i) => (
        <View key={s.row}>
          {i > 0 ? <Divider /> : null}
          <View style={[ui.between, { paddingVertical: 10, gap: 12 }]}>
            <View style={{ flex: 1 }}>
              <Text style={{ fontSize: 15, color: colors.ink, fontWeight: '500' }} numberOfLines={1}>
                {s.customerName || 'Walk-in'}
              </Text>
              <Text style={{ fontSize: 13, color: colors.muted, marginTop: 2 }} numberOfLines={1}>
                {s.itemName}
                {s.variant ? ` · ${s.variant}` : ''} × {s.qty}
              </Text>
            </View>
            <View style={{ alignItems: 'flex-end', gap: 4 }}>
              <Text style={[ui.num, { fontSize: 15, fontWeight: '600', color: colors.ink }]}>{moneyShort(s.total)}</Text>
              {s.status ? <Badge text={s.status} /> : null}
            </View>
          </View>
        </View>
      ))}
    </View>
  );
}

const w = StyleSheet.create({
  arrow: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.line,
    alignItems: 'center',
    justifyContent: 'center',
  },
  title: { fontSize: 16, fontWeight: '600', color: colors.ink },
  subtitle: { fontSize: 12, color: colors.muted, marginTop: 1 },
  meta: { fontSize: 13, color: colors.ink2 },
  skeleton: { height: 36, width: 140, borderRadius: 8, backgroundColor: colors.shell, marginTop: 4 },
});
