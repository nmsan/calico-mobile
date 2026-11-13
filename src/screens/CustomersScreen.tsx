import { Ionicons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import React, { useState } from 'react';
import { FlatList, Pressable, RefreshControl, Text, View } from 'react-native';
import { api } from '../api';
import type { CustomersStackParams } from '../navigation';
import { colors } from '../theme';
import { Avatar, Badge, Card, Chips, Empty, ErrorText, groupRow, Hero, money, moneyShort, prettyDate, Screen, SearchField, SectionLabel, ui, useLoader } from '../ui';

const FILTERS = ['All', 'Owes money'];

export default function CustomersScreen() {
  const nav = useNavigation<NativeStackNavigationProp<CustomersStackParams>>();
  const { data, error, loading, reload } = useLoader(() => api.customers());
  const [q, setQ] = useState('');
  const [filter, setFilter] = useState('All');

  const all = data ?? [];
  const debtors = all.filter((c) => c.balance > 0);
  const owed = debtors.reduce((s, c) => s + c.balance, 0);
  const query = q.trim().toLowerCase();
  const shown = all
    .filter((c) => (filter === 'Owes money' ? c.balance > 0 : true))
    .filter((c) => !query || `${c.name} ${c.contact} ${c.customerId}`.toLowerCase().includes(query))
    .sort((a, b) => (filter === 'Owes money' ? b.balance - a.balance : a.name.localeCompare(b.name)));

  const header = (
    <View>
      <Card style={{ marginTop: 4 }}>
        <SectionLabel>Owed to you</SectionLabel>
        <Hero color={owed > 0 ? colors.owed : colors.ok}>{money(owed)}</Hero>
        <Text style={ui.muted}>
          {data
            ? debtors.length
              ? `${debtors.length} of ${all.length} customer${all.length === 1 ? '' : 's'} owe money`
              : 'Every customer is paid up'
            : ' '}
        </Text>
      </Card>
      <View style={{ paddingHorizontal: 16, paddingTop: 16, paddingBottom: 12, gap: 12 }}>
        <SearchField value={q} onChangeText={setQ} placeholder="Search name or phone" />
        <Chips options={FILTERS} value={filter} onChange={setFilter} counts={data ? { All: all.length, 'Owes money': debtors.length } : undefined} />
        <ErrorText message={error} />
      </View>
    </View>
  );

  return (
    <Screen>
      <FlatList
        data={shown}
        keyExtractor={(c) => c.name + '|' + c.contact}
        refreshControl={<RefreshControl refreshing={loading} onRefresh={reload} tintColor={colors.rust} />}
        keyboardDismissMode="on-drag"
        keyboardShouldPersistTaps="handled"
        ListHeaderComponent={header}
        ListEmptyComponent={
          loading ? undefined : query || filter !== 'All' ? (
            <Empty icon="search" text="No customers match." />
          ) : (
            <Empty icon="people-outline" title="No customers yet" text="Customers are added when you save their first sale." />
          )
        }
        contentContainerStyle={{ paddingBottom: 24 }}
        renderItem={({ item: c, index }) => (
          <Pressable
            onPress={() => nav.navigate('CustomerDetail', { name: c.name, contact: c.contact })}
            style={({ pressed }) => [groupRow(index, shown.length), { gap: 12 }, pressed && { backgroundColor: colors.pressed }]}
          >
            <Avatar name={c.name} />
            <View style={{ flex: 1 }}>
              <Text style={ui.rowTitle} numberOfLines={1}>
                {c.name}
              </Text>
              <Text style={ui.muted} numberOfLines={1}>
                {c.contact || 'No phone'} · last {prettyDate(c.lastPurchase)}
              </Text>
            </View>
            {c.balance > 0 ? <Badge text={moneyShort(c.balance)} tone="owed" /> : <Badge text="Clear" tone="ok" />}
            <Ionicons name="chevron-forward" size={18} color={colors.faint} />
          </Pressable>
        )}
      />
    </Screen>
  );
}
