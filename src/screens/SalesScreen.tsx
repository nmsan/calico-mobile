import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import React, { useMemo, useState } from 'react';
import { FlatList, Pressable, RefreshControl, Text, View } from 'react-native';
import { api } from '../api';
import { toInvoices, type Invoice } from '../invoices';
import type { SalesStackParams } from '../navigation';
import { colors } from '../theme';
import { Avatar, Badge, Card, Chips, Empty, ErrorText, Fab, Hero, Screen, SearchField, SectionLabel, groupRow, money, moneyShort, prettyDate, tap, today, ui, useLoader, type Tone } from '../ui';

const FILTERS = ['All', 'Owed'];

export const STATUS_TONE: Record<Invoice['status'], Tone> = { Paid: 'ok', Partial: 'low', Unpaid: 'owed' };

/** Paid, or how much is still owed. */
export function InvoiceStatus({ inv }: { inv: Invoice }) {
  return <Badge text={inv.balance > 0 ? `${moneyShort(inv.balance)} owed` : 'Paid'} tone={STATUS_TONE[inv.status]} />;
}

/** The Sales tab: one row per sale (invoice), newest first. Tap one to see the invoice; + starts a new sale. */
export default function SalesScreen() {
  const nav = useNavigation<NativeStackNavigationProp<SalesStackParams>>();
  // Customers only add their photos to the rows, so a failure there doesn't block the list.
  const { data, error, loading, reload } = useLoader(() => Promise.all([api.recentSales(500), api.customers().catch(() => [])]));
  const [q, setQ] = useState('');
  const [filter, setFilter] = useState('All');

  const invoices = useMemo(() => toInvoices(data?.[0] ?? []), [data]);
  const photos = useMemo(() => new Map((data?.[1] ?? []).map((c) => [`${c.name}|${c.contact}`, c.photoId])), [data]);

  const thisMonth = today().slice(0, 7);
  const month = invoices.filter((i) => i.date.startsWith(thisMonth));
  const monthTotal = month.reduce((a, i) => a + i.total, 0);
  const owing = invoices.filter((i) => i.balance > 0);
  const owed = owing.reduce((a, i) => a + i.balance, 0);

  const query = q.trim().toLowerCase();
  const shown = invoices
    .filter((i) => (filter === 'Owed' ? i.balance > 0 : true))
    .filter((i) => !query || `${i.customerName} ${i.contact} #${i.number} ${i.lines.map((l) => `${l.itemName} ${l.itemId} ${l.variant}`).join(' ')}`.toLowerCase().includes(query));

  const header = (
    <View>
      <Card style={{ marginTop: 4 }}>
        <SectionLabel>Sold this month</SectionLabel>
        <Hero>{money(monthTotal)}</Hero>
        <Text style={ui.muted}>
          {data ? `${month.length} sale${month.length === 1 ? '' : 's'}${owed > 0 ? ` · ${money(owed)} still owed` : ''}` : ' '}
        </Text>
      </Card>
      <View style={{ paddingHorizontal: 16, paddingTop: 16, paddingBottom: 12, gap: 12 }}>
        <SearchField value={q} onChangeText={setQ} placeholder="Search customer, item or invoice no." />
        <Chips options={FILTERS} value={filter} onChange={setFilter} counts={data ? { All: invoices.length, Owed: owing.length } : undefined} />
        <ErrorText message={error} />
      </View>
    </View>
  );

  return (
    <Screen>
      <FlatList
        data={shown}
        keyExtractor={(i) => String(i.id)}
        refreshControl={<RefreshControl refreshing={loading} onRefresh={reload} tintColor={colors.rust} />}
        keyboardDismissMode="on-drag"
        keyboardShouldPersistTaps="handled"
        ListHeaderComponent={header}
        ListEmptyComponent={
          loading ? undefined : query || filter !== 'All' ? (
            <Empty icon="search" text="No sales match." />
          ) : (
            <Empty icon="bag-handle-outline" title="No sales yet" text="Tap + to record your first sale." />
          )
        }
        contentContainerStyle={{ paddingBottom: 96 }}
        renderItem={({ item: inv, index }) => (
          <Pressable
            onPress={() => {
              tap();
              nav.navigate('SaleDetail', { invoice: inv, photoId: photos.get(`${inv.customerName}|${inv.contact}`) });
            }}
            accessibilityRole="button"
            accessibilityLabel={`${inv.customerName || 'Walk-in'}, ${prettyDate(inv.date)}, ${money(inv.total)}, ${inv.status}`}
            accessibilityHint="Opens the invoice"
            style={({ pressed }) => [groupRow(index, shown.length), { gap: 12 }, pressed && { backgroundColor: colors.pressed }]}
          >
            <Avatar name={inv.customerName} size={42} photoId={photos.get(`${inv.customerName}|${inv.contact}`)} />
            <View style={{ flex: 1 }}>
              <Text style={ui.rowTitle} numberOfLines={1}>
                {inv.customerName || 'Walk-in'}
              </Text>
              <Text style={ui.muted} numberOfLines={1}>
                {prettyDate(inv.date)} · {inv.qty} item{inv.qty === 1 ? '' : 's'}
              </Text>
            </View>
            <View style={{ alignItems: 'flex-end', gap: 4 }}>
              <Text style={[ui.num, { fontSize: 15, fontWeight: '600', color: colors.ink }]}>{money(inv.total)}</Text>
              <InvoiceStatus inv={inv} />
            </View>
          </Pressable>
        )}
      />
      <Fab title="New sale" iconOnly onPress={() => nav.navigate('NewSale')} />
    </Screen>
  );
}
