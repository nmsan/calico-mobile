import React, { useState } from 'react';
import { LayoutChangeEvent, Pressable, StyleSheet, Text, View } from 'react-native';
import Svg, { Line, Rect } from 'react-native-svg';
import { dayOfMonth, dayOfWeek } from '../dates';
import { colors } from '../theme';
import type { SalesDay } from '../types';

const CHART_H = 150;
const LABEL_H = 22;
const LABEL_W = 28;
const TOP_PAD = 16; // room for the gridline label above the tallest bar

/** 1250 -> "1.3k", 48000 -> "48k", 1200000 -> "1.2M". */
export function compact(n: number) {
  const a = Math.abs(n);
  if (a >= 1e6) return `${+(n / 1e6).toFixed(a >= 1e7 ? 0 : 1)}M`;
  if (a >= 1e3) return `${+(n / 1e3).toFixed(a >= 1e4 ? 0 : 1)}k`;
  return String(Math.round(n));
}

/** A round number at or above `max` (1, 2 or 5 times a power of ten), so the gridline reads cleanly. */
function niceCeil(max: number) {
  if (max <= 0) return 1;
  const p = Math.pow(10, Math.floor(Math.log10(max)));
  const f = max / p;
  return (f <= 1 ? 1 : f <= 2 ? 2 : f <= 5 ? 5 : 10) * p;
}

/**
 * Bar chart of daily sales totals. Days after `today` are drawn as faint stubs and can't be tapped.
 * Week ranges label every day (M T W...); month ranges label the 1st and every 5th day.
 */
export function SalesChart({
  days,
  today,
  selected,
  onSelect,
}: {
  days: SalesDay[];
  today: string;
  selected: string | null;
  onSelect: (date: string) => void;
}) {
  const [width, setWidth] = useState(0);
  const onLayout = (e: LayoutChangeEvent) => setWidth(e.nativeEvent.layout.width);

  const n = days.length || 1;
  const dense = n > 10;
  const top = Math.max(0, ...days.map((d) => d.total));
  const max = niceCeil(top);
  const slot = width / n;
  const barW = Math.max(3, Math.min(dense ? slot * 0.62 : slot * 0.56, 34));
  const plotH = CHART_H - TOP_PAD;

  return (
    <View onLayout={onLayout} accessibilityRole="image" accessibilityLabel={`Sales chart, ${days.length} days`}>
      {width > 0 ? (
        <>
          <Svg width={width} height={CHART_H}>
            <Line x1={0} x2={width} y1={TOP_PAD} y2={TOP_PAD} stroke={colors.line} strokeDasharray="3 4" />
            <Line x1={0} x2={width} y1={CHART_H - 0.5} y2={CHART_H - 0.5} stroke={colors.line} />
            {days.map((d, i) => {
              const future = d.date > today;
              const h = future || d.total <= 0 ? 2 : Math.max(3, (d.total / max) * plotH);
              const x = i * slot + (slot - barW) / 2;
              const on = d.date === selected;
              const fill = future ? colors.shell : d.total <= 0 ? colors.line : on ? colors.rust : d.date === today ? colors.terra : colors.sand;
              return <Rect key={d.date} x={x} y={CHART_H - h} width={barW} height={h} rx={Math.min(4, barW / 2)} fill={fill} />;
            })}
          </Svg>
          {top > 0 ? <Text style={s.gridLabel}>{compact(max)}</Text> : null}
          {/* Tap targets cover the whole column, not just the bar, so short bars are easy to hit. */}
          <View style={[StyleSheet.absoluteFill, { flexDirection: 'row' }]}>
            {days.map((d) => (
              <Pressable
                key={d.date}
                style={{ flex: 1 }}
                disabled={d.date > today}
                onPress={() => onSelect(d.date)}
                accessibilityRole="button"
                accessibilityLabel={`${dayOfWeek(d.date)} ${dayOfMonth(d.date)}, ${Math.round(d.total)} rupees`}
              />
            ))}
          </View>
        </>
      ) : (
        <View style={{ height: CHART_H }} />
      )}
      {/* Labels are centred on their column with a fixed width, so "25" fits under a narrow month bar. */}
      <View style={{ height: LABEL_H }}>
        {width > 0
          ? days.map((d, i) => {
              const dom = dayOfMonth(d.date);
              if (dense && dom !== 1 && dom % 5 !== 0 && d.date !== selected) return null;
              const isToday = d.date === today;
              const on = d.date === selected;
              return (
                <Text
                  key={d.date}
                  numberOfLines={1}
                  style={[
                    s.axis,
                    { left: i * slot + slot / 2 - LABEL_W / 2 },
                    isToday && { color: colors.rust, fontWeight: '700' },
                    on && { color: colors.ink, fontWeight: '700' },
                  ]}
                >
                  {dense ? String(dom) : dayOfWeek(d.date).slice(0, 1)}
                </Text>
              );
            })
          : null}
      </View>
    </View>
  );
}

const s = StyleSheet.create({
  gridLabel: { position: 'absolute', right: 0, top: 0, fontSize: 10, color: colors.muted, fontVariant: ['tabular-nums'] },
  axis: { position: 'absolute', bottom: 0, width: LABEL_W, textAlign: 'center', fontSize: 11, color: colors.muted, fontVariant: ['tabular-nums'] },
});
