import { Ionicons } from '@expo/vector-icons';
import { useNavigation, type NavigationProp, type ParamListBase } from '@react-navigation/native';
import React from 'react';
import { Pressable, Text, View } from 'react-native';
import { api } from '../api';
import { colors } from '../theme';
import { Avatar, Badge, Card, Divider, ErrorText, Hero, moneyShort, prettyDate, SectionLabel, tap, ui } from '../ui';
import { useWidgetData } from './useWidgetData';

const TOP = 5;

/** What customers owe in total, and the biggest balances. Tapping a row opens that customer to take a payment. */
export function OwedWidget({ refreshToken, onLoadingChange }: { refreshToken: number; onLoadingChange?: (loading: boolean) => void }) {
  const nav = useNavigation<NavigationProp<ParamListBase>>();
  const { data, error } = useWidgetData(() => api.customers(), refreshToken, onLoadingChange);

  const debtors = (data ?? []).filter((c) => c.balance > 0).sort((a, b) => b.balance - a.balance);
  const total = debtors.reduce((a, c) => a + c.balance, 0);

  const open = (name: string, contact: string, photoId?: string) => {
    tap();
    nav.navigate('Customers', { screen: 'CustomerDetail', params: { name, contact, photoId }, initial: false });
  };

  return (
    <Card>
      <View style={ui.between}>
        <SectionLabel>Money owed</SectionLabel>
        {debtors.length > TOP ? (
          <Pressable
            onPress={() => {
              tap();
              nav.navigate('Customers', { screen: 'CustomerList' });
            }}
            hitSlop={8}
            accessibilityRole="button"
          >
            <Text style={{ color: colors.rust, fontSize: 14, fontWeight: '600' }}>See all</Text>
          </Pressable>
        ) : null}
      </View>

      {!data ? (
        <View style={{ height: 36, width: 140, borderRadius: 8, backgroundColor: colors.shell, marginTop: 10 }} />
      ) : (
        <>
          <Hero size={30} color={total > 0 ? colors.owed : colors.ok}>
            {moneyShort(total)}
          </Hero>
          <Text style={{ fontSize: 13, color: colors.ink2 }}>
            {debtors.length === 0 ? 'Nobody owes you anything' : `${debtors.length} ${debtors.length === 1 ? 'customer owes' : 'customers owe'} you`}
          </Text>
          {debtors.length ? <View style={{ marginTop: 10 }} /> : null}
          {debtors.slice(0, TOP).map((c, i) => (
            <View key={`${c.name}|${c.contact}`}>
              {i > 0 ? <Divider /> : null}
              <Pressable
                onPress={() => open(c.name, c.contact, c.photoId)}
                accessibilityRole="button"
                accessibilityLabel={`${c.name} owes ${Math.round(c.balance)} rupees`}
                style={({ pressed }) => [ui.between, { paddingVertical: 10, gap: 12, opacity: pressed ? 0.6 : 1 }]}
              >
                <Avatar name={c.name} size={34} photoId={c.photoId} />
                <View style={{ flex: 1 }}>
                  <Text style={{ fontSize: 15, color: colors.ink, fontWeight: '500' }} numberOfLines={1}>
                    {c.name}
                  </Text>
                  <Text style={{ fontSize: 13, color: colors.muted, marginTop: 1 }} numberOfLines={1}>
                    Last bought {prettyDate(c.lastPurchase)}
                  </Text>
                </View>
                <Badge text={moneyShort(c.balance)} tone="owed" />
                <Ionicons name="chevron-forward" size={16} color={colors.faint} />
              </Pressable>
            </View>
          ))}
        </>
      )}
      <ErrorText message={error} />
    </Card>
  );
}
