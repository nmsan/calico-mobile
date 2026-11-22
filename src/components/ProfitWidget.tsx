import { Ionicons } from '@expo/vector-icons';
import { useNavigation, type NavigationProp, type ParamListBase } from '@react-navigation/native';
import React from 'react';
import { Pressable, Text, View } from 'react-native';
import { api } from '../api';
import { monthLabel, monthStr, shiftPeriod } from '../dates';
import { colors } from '../theme';
import type { DashboardNumbers } from '../types';
import { Card, ErrorText, Hero, KeyValue, money, moneyShort, pct, SectionLabel, tap, ui } from '../ui';
import { useWidgetData } from './useWidgetData';

/**
 * getDashboard sets the month on the P&L Dashboard sheet, so the two months are asked for one after
 * the other, last month first, leaving the sheet on the current month as the Reports screen expects.
 */
async function loadMonths() {
  const current = monthStr(new Date());
  const previous = shiftPeriod('month', `${current}-01`, -1).slice(0, 7);
  const prev = await api.dashboard(previous);
  const cur = await api.dashboard(current);
  return { current, cur: cur.period, prev: prev.period };
}

/** This month's net profit and where the money went, with last month's result for reference. Owners and admins only. */
export function ProfitWidget({ refreshToken, onLoadingChange }: { refreshToken: number; onLoadingChange?: (loading: boolean) => void }) {
  const nav = useNavigation<NavigationProp<ParamListBase>>();
  const { data, error } = useWidgetData(loadMonths, refreshToken, onLoadingChange);
  const n: DashboardNumbers | undefined = data?.cur;
  const profit = n?.netProfit ?? 0;
  const last = data?.prev.netProfit ?? 0;

  return (
    <Pressable
      onPress={() => {
        tap();
        nav.navigate('More', { screen: 'Reports', initial: false });
      }}
      accessibilityRole="button"
      accessibilityHint="Opens Reports"
      style={({ pressed }) => ({ opacity: pressed ? 0.85 : 1 })}
    >
      <Card>
        <View style={ui.between}>
          <SectionLabel>{profit < 0 ? 'Loss' : 'Profit'} this month</SectionLabel>
          <Ionicons name="chevron-forward" size={18} color={colors.muted} />
        </View>
        {!n ? (
          <View style={{ height: 36, width: 140, borderRadius: 8, backgroundColor: colors.shell, marginTop: 10 }} />
        ) : (
          <>
            <Hero size={30} color={profit < 0 ? colors.owed : colors.ok}>
              {money(profit)}
            </Hero>
            <Text style={{ fontSize: 13, color: colors.ink2 }}>
              {data ? `${monthLabel(data.current)} so far · net margin ${pct(n.netMargin)}` : ''}
            </Text>
            <View style={{ marginTop: 10 }}>
              <KeyValue label="Net revenue" value={money(n.netRevenue)} />
              <KeyValue label="Cost of goods" value={`− ${money(n.cogs)}`} muted />
              <KeyValue label="Expenses" value={`− ${money(n.expenses)}`} muted />
            </View>
            <Text style={[ui.muted, { marginTop: 6 }]}>
              Last month: {last < 0 ? 'loss of ' : ''}
              {moneyShort(Math.abs(last))}
            </Text>
          </>
        )}
        <ErrorText message={error} />
      </Card>
    </Pressable>
  );
}
