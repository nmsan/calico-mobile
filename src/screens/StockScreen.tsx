import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import React, { useState } from 'react';
import { FlatList, Pressable, RefreshControl, Text, View } from 'react-native';
import { api } from '../api';
import { useAuth } from '../auth';
import type { StockStackParams } from '../navigation';
import type { InventoryItem } from '../types';
import { colors } from '../theme';
import {
  Badge,
  Button,
  Chips,
  Empty,
  ErrorText,
  Fab,
  groupRow,
  Input,
  moneyShort,
  Screen,
  SearchField,
  Sheet,
  success,
  tap,
  toNumber,
  ui,
  useLoader,
  useToast,
} from '../ui';

const FILTERS = ['All', 'Low', 'Out'];

export default function StockScreen() {
  const { user } = useAuth();
  const isOwner = user?.role === 'owner';
  const nav = useNavigation<NativeStackNavigationProp<StockStackParams>>();
  const { data, error, loading, reload } = useLoader(() => api.inventory());
  const [q, setQ] = useState('');
  const [filter, setFilter] = useState('All');
  const [restocking, setRestocking] = useState<InventoryItem | null>(null);

  const all = data?.items ?? [];
  const lowLevel = data?.lowStockLevel ?? 5;
  const isLow = (i: InventoryItem) => i.currentStock > 0 && i.currentStock <= lowLevel;
  const isOut = (i: InventoryItem) => i.currentStock <= 0;
  const counts = { All: all.length, Low: all.filter(isLow).length, Out: all.filter(isOut).length };

  const query = q.trim().toLowerCase();
  const items = all.filter((i) => {
    if (filter === 'Low' && !isLow(i)) return false;
    if (filter === 'Out' && !isOut(i)) return false;
    if (!query) return true;
    return `${i.itemId} ${i.name} ${i.category} ${i.size} ${i.color}`.toLowerCase().includes(query);
  });

  return (
    <Screen>
      <View style={{ paddingHorizontal: 16, paddingTop: 4, paddingBottom: 12, gap: 12 }}>
        <SearchField value={q} onChangeText={setQ} placeholder="Search name, ID, size, colour" />
        <Chips options={FILTERS} value={filter} onChange={setFilter} counts={data ? counts : undefined} />
        <ErrorText message={error} />
      </View>
      <FlatList
        data={items}
        keyExtractor={(i) => i.itemId}
        refreshControl={<RefreshControl refreshing={loading} onRefresh={reload} tintColor={colors.rust} />}
        keyboardDismissMode="on-drag"
        ListEmptyComponent={
          loading ? undefined : query || filter !== 'All' ? (
            <Empty icon="search" text="No items match. Try another search or filter." />
          ) : (
            <Empty icon="shirt-outline" title="No stock yet" text={isOwner ? 'Tap New item to add your first piece.' : 'Items the owner adds will show here.'} />
          )
        }
        contentContainerStyle={{ paddingBottom: isOwner ? 96 : 24 }}
        renderItem={({ item, index }) => {
          const out = isOut(item);
          const low = isLow(item);
          return (
            <Pressable
              onPress={
                isOwner
                  ? () => {
                      tap();
                      setRestocking(item);
                    }
                  : undefined
              }
              accessibilityRole={isOwner ? 'button' : undefined}
              accessibilityHint={isOwner ? 'Restock this item' : undefined}
              style={({ pressed }) => [groupRow(index, items.length), pressed && isOwner && { backgroundColor: colors.pressed }]}
            >
              <View style={{ flex: 1, paddingRight: 12 }}>
                <Text style={ui.rowTitle}>{item.name}</Text>
                <Text style={ui.muted}>
                  {item.size} / {item.color} · {item.category}
                </Text>
                <Text style={[ui.muted, { fontSize: 12 }]}>
                  {item.itemId} · {moneyShort(item.sellingPrice)}
                  {item.costPrice !== undefined ? ` · cost ${moneyShort(item.costPrice)}` : ''}
                </Text>
              </View>
              <View style={{ alignItems: 'flex-end', gap: 4 }}>
                <Text style={[stock.count, { color: out ? colors.owed : low ? colors.low : colors.ink }]}>{item.currentStock}</Text>
                <Badge text={out ? 'Out' : low ? 'Low' : 'In stock'} tone={out ? 'owed' : low ? 'low' : 'ok'} />
              </View>
            </Pressable>
          );
        }}
      />
      {isOwner ? <Fab title="New item" onPress={() => nav.navigate('AddItem')} /> : null}
      <RestockSheet item={restocking} onClose={() => setRestocking(null)} onDone={reload} />
    </Screen>
  );
}

function RestockSheet({ item, onClose, onDone }: { item: InventoryItem | null; onClose: () => void; onDone: () => void }) {
  const toast = useToast();
  const [qty, setQty] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const n = toNumber(qty);
  const valid = Number.isInteger(n) && n > 0;

  function close() {
    setQty('');
    setError(null);
    onClose();
  }

  async function save() {
    if (!item) return;
    if (!valid) return setError('Enter a whole number above 0.');
    setBusy(true);
    setError(null);
    try {
      await api.restock(item.itemId, n);
      success();
      toast(`Added ${n} to ${item.name}. Now ${item.currentStock + n} in stock.`);
      close();
      onDone();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  const add = (by: number) => {
    tap();
    setQty(String((Number.isInteger(n) && n > 0 ? n : 0) + by));
  };

  return (
    <Sheet visible={!!item} title={`Restock ${item?.name ?? ''}`} subtitle={`${item?.size} / ${item?.color} · ${item?.currentStock} in stock now`} onClose={close}>
      <Input label="Units received" value={qty} onChangeText={setQty} keyboardType="number-pad" large placeholder="0" autoFocus />
      <View style={{ flexDirection: 'row', gap: 8, marginBottom: 16 }}>
        {[1, 5, 10].map((by) => (
          <Button key={by} title={`+${by}`} variant="secondary" onPress={() => add(by)} style={{ flex: 1, paddingVertical: 11 }} />
        ))}
      </View>
      {valid && item ? (
        <Text style={[ui.muted, { marginBottom: 12, fontSize: 14 }]}>
          New total: <Text style={{ color: colors.ink, fontWeight: '700' }}>{item.currentStock + n}</Text>
        </Text>
      ) : null}
      <ErrorText message={error} />
      <Button title="Add stock" onPress={save} loading={busy} disabled={!valid} />
    </Sheet>
  );
}

const stock = {
  count: { fontSize: 22, lineHeight: 26, fontWeight: '700' as const, fontVariant: ['tabular-nums' as const] },
};
