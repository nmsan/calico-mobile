import { Ionicons } from '@expo/vector-icons';
import { useNavigation, useRoute, type RouteProp } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import React, { useMemo } from 'react';
import { Pressable, RefreshControl, ScrollView, Text, View } from 'react-native';
import { api } from '../api';
import { ItemThumb } from '../components/ItemPhoto';
import { toInvoices, type Invoice } from '../invoices';
import type { StockStackParams } from '../navigation';
import { useItemThumbs } from '../photos';
import { colors } from '../theme';
import type { ItemEvent, ItemHistory } from '../types';
import { Card, Empty, ErrorText, Loading, Screen, SectionLabel, money, moneyShort, prettyDate, tap, ui, useLoader } from '../ui';

type IconName = React.ComponentProps<typeof Ionicons>['name'];

type Entry = {
  key: string;
  date: string; // YYYY-MM-DD, or '' for "before history"
  time: string;
  icon: IconName;
  tint: string;
  title: string;
  lines: string[];
  change: number | null;
  stockAfter: number | null;
  invoice?: Invoice;
};

const EVENT_LOOK: Record<string, { icon: IconName; tint: string; title: string }> = {
  Created: { icon: 'sparkles-outline', tint: colors.rust, title: 'Added to stock' },
  Restocked: { icon: 'arrow-down-circle-outline', tint: colors.ok, title: 'Restocked' },
  'Stock count': { icon: 'clipboard-outline', tint: colors.low, title: 'Stock counted' },
  Edited: { icon: 'create-outline', tint: colors.ink2, title: 'Details edited' },
  'Photo added': { icon: 'camera-outline', tint: colors.ink2, title: 'Photo added' },
  'Photo changed': { icon: 'camera-outline', tint: colors.ink2, title: 'Photo changed' },
  'Photo removed': { icon: 'camera-outline', tint: colors.muted, title: 'Photo removed' },
};

/** Logged changes and sales, newest first, with the stock from before history at the bottom. */
function buildTimeline(h: ItemHistory): Entry[] {
  const out: Entry[] = [];
  h.events.forEach((e: ItemEvent, i) => {
    const look = EVENT_LOOK[e.event] ?? { icon: 'ellipse-outline' as IconName, tint: colors.muted, title: e.event };
    out.push({
      key: `e${i}`,
      date: e.date,
      time: e.time,
      icon: look.icon,
      tint: look.tint,
      title: look.title,
      lines: [e.details, e.ownerDetails ?? '', e.by ? `by ${e.by}` : ''].filter(Boolean),
      change: e.change,
      stockAfter: e.stockAfter,
    });
  });
  for (const inv of toInvoices(h.invoices.flat())) {
    const mine = inv.lines.filter((l) => l.itemId === h.item.itemId);
    const qty = mine.reduce((a, l) => a + l.qty, 0);
    const total = mine.reduce((a, l) => a + l.total, 0);
    out.push({
      key: `s${inv.id}`,
      date: inv.date,
      time: '',
      icon: 'bag-handle-outline',
      tint: colors.terra,
      title: `Sold ${qty} to ${inv.customerName || 'a walk-in customer'}`,
      lines: [`Invoice #${inv.number} · ${money(total)}${inv.lines.length > mine.length ? ` of ${money(inv.total)}` : ''} · ${inv.status}`],
      change: -qty,
      stockAfter: null,
      invoice: inv,
    });
  }
  // Newest first. A sale has no time of day, so on the same day it sits below that day's logged changes.
  out.sort((a, b) => (a.date !== b.date ? (a.date < b.date ? 1 : -1) : a.time < b.time ? 1 : a.time > b.time ? -1 : 0));
  if (h.openingStock > 0) {
    out.push({
      key: 'opening',
      date: '',
      time: '',
      icon: 'archive-outline',
      tint: colors.muted,
      title: 'Opening stock',
      lines: ['Stock from before history was kept'],
      change: h.openingStock,
      stockAfter: null,
    });
  }
  return out;
}

/** A stock item's story: when it was added, restocked, counted, edited and sold. */
export default function ItemHistoryScreen() {
  const { item: start } = useRoute<RouteProp<StockStackParams, 'ItemHistory'>>().params;
  const nav = useNavigation<NativeStackNavigationProp<StockStackParams>>();
  const thumbOf = useItemThumbs();
  const { data, error, loading, reload } = useLoader(() => api.itemHistory(start.itemId));
  const item = data?.item ?? start;
  const timeline = useMemo(() => (data ? buildTimeline(data) : []), [data]);
  const restocks = data?.events.filter((e) => e.event === 'Restocked').length ?? 0;

  return (
    <Screen>
      <ScrollView contentContainerStyle={{ paddingBottom: 32 }} refreshControl={<RefreshControl refreshing={loading && !!data} onRefresh={reload} tintColor={colors.rust} />}>
        <Card style={{ marginTop: 4 }}>
          <View style={{ flexDirection: 'row', gap: 14, alignItems: 'center' }}>
            <ItemThumb thumb={thumbOf(item.name, item.color)} size={64} />
            <View style={{ flex: 1 }}>
              <Text style={{ fontSize: 18, fontWeight: '600', color: colors.ink }}>{item.name}</Text>
              <Text style={ui.muted}>
                {item.size} / {item.color} · {item.category}
              </Text>
              <Text style={[ui.muted, { fontSize: 12 }]}>{item.itemId}</Text>
            </View>
          </View>
          <View style={{ flexDirection: 'row', marginTop: 16 }}>
            <Stat label="In stock" value={String(item.currentStock)} />
            <Stat label="Sold" value={String(item.unitsSold)} />
            <Stat label="Restocks" value={data ? String(restocks) : '–'} />
            <Stat label="Price" value={moneyShort(item.sellingPrice)} />
          </View>
        </Card>

        <View style={{ paddingHorizontal: 16 }}>
          <ErrorText message={error} />
        </View>
        <SectionLabel style={{ marginHorizontal: 16, marginTop: 22, marginBottom: 10 }}>History</SectionLabel>

        {!data && loading ? (
          <Loading />
        ) : timeline.length === 0 ? (
          <Empty icon="time-outline" text="Nothing recorded for this item yet." />
        ) : (
          <View style={{ marginHorizontal: 16 }}>
            {timeline.map((e, i) => (
              <TimelineRow
                key={e.key}
                e={e}
                last={i === timeline.length - 1}
                onPress={
                  e.invoice
                    ? () => {
                        tap();
                        nav.navigate('SaleDetail', { invoice: e.invoice! });
                      }
                    : undefined
                }
              />
            ))}
            {data?.openingStock ? (
              <Text style={[ui.muted, { fontSize: 12, textAlign: 'center', marginTop: 12 }]}>Sales go back to the start. Restocks, counts and edits are recorded from when history was switched on.</Text>
            ) : null}
          </View>
        )}
      </ScrollView>
    </Screen>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <View style={{ flex: 1 }}>
      <Text style={[ui.num, { fontSize: 16, fontWeight: '600', color: colors.ink }]}>{value}</Text>
      <Text style={[ui.muted, { fontSize: 12 }]}>{label}</Text>
    </View>
  );
}

function TimelineRow({ e, last, onPress }: { e: Entry; last: boolean; onPress?: () => void }) {
  const when = e.date ? `${prettyDate(e.date)}${e.time ? ` · ${e.time}` : ''}` : 'Before history';
  return (
    <View style={{ flexDirection: 'row', gap: 12 }}>
      {/* Dot and the line down to the next entry */}
      <View style={{ alignItems: 'center', width: 34 }}>
        <View style={{ width: 34, height: 34, borderRadius: 17, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.line, alignItems: 'center', justifyContent: 'center' }}>
          <Ionicons name={e.icon} size={17} color={e.tint} />
        </View>
        {!last ? <View style={{ flex: 1, width: 2, backgroundColor: colors.line, marginVertical: 2 }} /> : null}
      </View>
      <Pressable
        onPress={onPress}
        disabled={!onPress}
        accessibilityRole={onPress ? 'button' : undefined}
        accessibilityHint={onPress ? 'Opens the invoice' : undefined}
        style={({ pressed }) => ({ flex: 1, paddingBottom: last ? 0 : 18, opacity: pressed ? 0.7 : 1 })}
      >
        <View style={[ui.between, { alignItems: 'flex-start', gap: 10, minHeight: 34 }]}>
          <View style={{ flex: 1 }}>
            <Text style={[ui.muted, { fontSize: 12 }]}>{when}</Text>
            <Text style={{ fontSize: 15, fontWeight: '600', color: colors.ink, marginTop: 1 }}>{e.title}</Text>
            {e.lines.map((l) => (
              <Text key={l} style={[ui.muted, { fontSize: 13, marginTop: 2 }]}>
                {l}
              </Text>
            ))}
          </View>
          <View style={{ alignItems: 'flex-end', gap: 2 }}>
            {e.change !== null && e.change !== 0 ? (
              <Text style={[ui.num, { fontSize: 15, fontWeight: '700', color: e.change > 0 ? colors.ok : colors.rust }]}>
                {e.change > 0 ? `+${e.change}` : `−${Math.abs(e.change)}`}
              </Text>
            ) : null}
            {e.stockAfter !== null ? <Text style={[ui.muted, { fontSize: 12 }]}>{e.stockAfter} in stock</Text> : null}
            {onPress ? <Ionicons name="chevron-forward" size={16} color={colors.faint} style={{ marginTop: 2 }} /> : null}
          </View>
        </View>
      </Pressable>
    </View>
  );
}

