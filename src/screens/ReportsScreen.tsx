import { Ionicons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import React, { useEffect, useRef, useState } from 'react';
import { Pressable, RefreshControl, ScrollView, Text, View } from 'react-native';
import { api } from '../api';
import type { ReportsStackParams } from '../navigation';
import { monthLabel, monthStr, shiftPeriod } from '../dates';
import type { DashboardNumbers } from '../types';
import { colors } from '../theme';
import { Card, Divider, ErrorText, Hero, KeyValue, Loading, money, pct, Screen, SectionLabel, Segmented, tap, ui, useLoader } from '../ui';

type View_ = 'month' | 'all';

function shiftMonth(m: string, by: number) {
  return shiftPeriod('month', `${m}-01`, by).slice(0, 7);
}

export default function ReportsScreen() {
  const current = monthStr(new Date());
  const [month, setMonth] = useState(current);
  const [view, setView] = useState<View_>('month');
  const { data, error, loading, reload } = useLoader(() => api.dashboard(month));

  const firstRender = useRef(true);
  useEffect(() => {
    if (firstRender.current) {
      firstRender.current = false; // the focus effect does the first load
      return;
    }
    void reload();
  }, [month, reload]);

  function changeMonth(by: number) {
    tap();
    setMonth((m) => shiftMonth(m, by));
  }

  const n: DashboardNumbers | undefined = view === 'all' ? data?.allTime : data?.period;
  const profit = n?.netProfit ?? 0;
  const atLatest = month >= current;

  return (
    <Screen>
      <ScrollView refreshControl={<RefreshControl refreshing={loading} onRefresh={reload} tintColor={colors.rust} />} contentContainerStyle={{ paddingBottom: 32 }}>
        <View style={{ paddingHorizontal: 16, paddingTop: 4, gap: 14 }}>
          <Segmented<View_>
            value={view}
            onChange={setView}
            options={[
              { value: 'month', label: 'By month' },
              { value: 'all', label: 'All time' },
            ]}
          />
          {view === 'month' ? (
            <View style={ui.between}>
              <Pressable onPress={() => changeMonth(-1)} hitSlop={12} style={rep.arrow} accessibilityLabel="Previous month">
                <Ionicons name="chevron-back" size={20} color={colors.ink} />
              </Pressable>
              <Text style={{ fontSize: 17, fontWeight: '600', color: colors.ink }}>{monthLabel(month)}</Text>
              <Pressable onPress={() => changeMonth(1)} hitSlop={12} disabled={atLatest} style={[rep.arrow, atLatest && { opacity: 0.3 }]} accessibilityLabel="Next month">
                <Ionicons name="chevron-forward" size={20} color={colors.ink} />
              </Pressable>
            </View>
          ) : null}
          <ErrorText message={error} />
        </View>

        <OwnersCard />
        {!data && loading ? <Loading /> : null}
        {n ? (
          <>
            <Card>
              <SectionLabel>{profit < 0 ? 'Net loss' : 'Net profit'}</SectionLabel>
              <Hero size={36} color={profit < 0 ? colors.owed : colors.ok}>
                {money(profit)}
              </Hero>
              <Text style={ui.muted}>Net margin {pct(n.netMargin)}</Text>
              <RevenueSplit n={n} />
            </Card>

            <Card>
              <SectionLabel style={{ marginBottom: 6 }}>Profit and loss</SectionLabel>
              <KeyValue label="Gross sales" value={money(n.grossSales)} />
              <KeyValue label="Discounts given" value={`− ${money(n.discounts)}`} muted />
              <KeyValue label="Net revenue" value={money(n.netRevenue)} bold />
              <Divider style={{ marginVertical: 4 }} />
              <KeyValue label="Cost of goods sold" value={`− ${money(n.cogs)}`} muted />
              <KeyValue label="Gross profit" value={money(n.grossProfit)} bold />
              <KeyValue label="Gross margin" value={pct(n.grossMargin)} muted />
              <Divider style={{ marginVertical: 4 }} />
              <KeyValue label="Operating expenses" value={`− ${money(n.expenses)}`} muted />
              <KeyValue label={profit < 0 ? 'Net loss' : 'Net profit'} value={money(n.netProfit)} bold color={profit < 0 ? colors.owed : colors.ok} />
            </Card>

            <Card>
              <SectionLabel style={{ marginBottom: 6 }}>Cash</SectionLabel>
              <KeyValue label="Cash collected" value={money(n.cashCollected)} />
              <KeyValue label="Owed by customers" value={money(n.receivable)} color={(n.receivable ?? 0) > 0 ? colors.owed : undefined} />
              {view === 'all' ? <KeyValue label="Stock value (at cost)" value={money(data?.allTime.inventoryValue)} /> : null}
            </Card>
          </>
        ) : null}
      </ScrollView>
    </Screen>
  );
}

/** Link to partner balances and cash; asks for the opening setup until it is done. */
function OwnersCard() {
  const nav = useNavigation<NativeStackNavigationProp<ReportsStackParams>>();
  const { data } = useLoader(() => api.ownerSummary());
  if (!data) return null;
  const t = data.totals;
  const open = () => {
    tap();
    nav.navigate(data.opening ? 'Owners' : 'OpeningSetup');
  };
  return (
    <Pressable onPress={open} accessibilityRole="button" style={({ pressed }) => ({ opacity: pressed ? 0.8 : 1 })}>
      <Card style={!data.opening ? { borderColor: colors.rust, borderWidth: 1 } : undefined}>
        <View style={ui.between}>
          <View style={{ flex: 1, paddingRight: 12 }}>
            <SectionLabel>{data.opening ? 'Owners & cash' : 'Set opening balances'}</SectionLabel>
            {data.opening && t ? (
              <Text style={{ fontSize: 15, color: colors.ink, marginTop: 4 }}>
                Cash about {money(t.cashEstimate)} · taken {money(t.drawings)}
              </Text>
            ) : (
              <Text style={[ui.muted, { fontSize: 14 }]}>Enter stock, cash and what each partner put in and took out before the app.</Text>
            )}
          </View>
          <Ionicons name="chevron-forward" size={20} color={colors.muted} />
        </View>
      </Card>
    </Pressable>
  );
}

/** Where net revenue went: cost of goods, expenses, and what was left as profit. */
function RevenueSplit({ n }: { n: DashboardNumbers }) {
  const revenue = n.netRevenue ?? 0;
  if (revenue <= 0) return null;
  const cogs = Math.max(0, n.cogs ?? 0);
  const exp = Math.max(0, n.expenses ?? 0);
  const profit = Math.max(0, revenue - cogs - exp);
  const total = Math.max(revenue, cogs + exp);
  const parts = [
    { label: 'Cost of goods', value: cogs, color: colors.sand },
    { label: 'Expenses', value: exp, color: colors.terra },
    { label: 'Profit', value: profit, color: colors.ok },
  ];
  return (
    <View style={{ marginTop: 16 }}>
      <View style={rep.bar}>
        {parts.map((p) => (p.value > 0 ? <View key={p.label} style={{ flex: p.value / total, backgroundColor: p.color }} /> : null))}
      </View>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 14, marginTop: 10 }}>
        {parts.map((p) => (
          <View key={p.label} style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
            <View style={{ width: 10, height: 10, borderRadius: 3, backgroundColor: p.color }} />
            <Text style={{ fontSize: 12, color: colors.ink2 }}>
              {p.label} {Math.round((p.value / total) * 100)}%
            </Text>
          </View>
        ))}
      </View>
    </View>
  );
}

const rep = {
  arrow: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.line,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
  },
  bar: { flexDirection: 'row' as const, height: 10, borderRadius: 5, overflow: 'hidden' as const, backgroundColor: colors.shell, gap: 2 },
};
