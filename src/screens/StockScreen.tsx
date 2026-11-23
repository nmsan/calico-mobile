import { useFocusEffect, useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import React, { useCallback, useState } from 'react';
import { FlatList, Pressable, RefreshControl, Text, View } from 'react-native';
import { api } from '../api';
import { useAuth } from '../auth';
import { ItemPhotoPreview, ItemPhotoViewer, ItemThumb } from '../components/ItemPhoto';
import { PhotoPicker } from '../components/PhotoPicker';
import { refreshItemThumbs, setItemThumb, useItemThumbs, type ItemThumb as Thumb, type PickedPhoto } from '../photos';
import type { StockStackParams } from '../navigation';
import { canManage, type InventoryItem } from '../types';
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
  LinkButton,
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
  const isOwner = canManage(user?.role);
  const nav = useNavigation<NativeStackNavigationProp<StockStackParams>>();
  const { data, error, loading, reload, setData } = useLoader(() => api.inventory());
  const [q, setQ] = useState('');
  const [filter, setFilter] = useState('All');
  const [restocking, setRestocking] = useState<InventoryItem | null>(null);
  const [viewing, setViewing] = useState<{ thumb: Thumb; title: string } | null>(null);
  const thumbOf = useItemThumbs();
  // Photos can change on another phone; pick up new ones whenever Stock is opened.
  useFocusEffect(
    useCallback(() => {
      void refreshItemThumbs();
    }, [])
  );

  const all = data?.items ?? [];
  const lowLevel = data?.lowStockLevel ?? 5;
  const isLow = (i: InventoryItem) => i.currentStock > 0 && i.currentStock <= lowLevel;
  const isOut = (i: InventoryItem) => i.currentStock <= 0;

  const query = q.trim().toLowerCase();

  // Search filter applied to all items first
  const queryFiltered = all.filter((i) => {
    if (!query) return true;
    return `${i.itemId} ${i.name} ${i.category} ${i.size} ${i.color}`.toLowerCase().includes(query);
  });

  // Dynamic counts for the chips based on active search query
  const counts = {
    All: queryFiltered.length,
    Low: queryFiltered.filter(isLow).length,
    Out: queryFiltered.filter(isOut).length,
  };

  // Final items after applying tab filter (All / Low / Out)
  const items = queryFiltered.filter((i) => {
    if (filter === 'Low') return isLow(i);
    if (filter === 'Out') return isOut(i);
    return true;
  });

  const totalUnits = items.reduce((sum, i) => sum + Math.max(0, i.currentStock), 0);
  const isFiltered = Boolean(query || filter !== 'All');

  return (
    <Screen>
      <View style={{ paddingHorizontal: 16, paddingTop: 4, paddingBottom: 10, gap: 10 }}>
        <SearchField value={q} onChangeText={setQ} placeholder="Search name, category, ID, size, colour" />
        <Chips options={FILTERS} value={filter} onChange={setFilter} counts={data ? counts : undefined} />
        {data && all.length > 0 ? (
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 2 }}>
            <Text style={[ui.muted, { fontSize: 13, fontWeight: isFiltered ? '600' : '500', color: isFiltered ? colors.ink : colors.muted }]}>
              {isFiltered
                ? `Showing ${items.length} of ${all.length} item${all.length === 1 ? '' : 's'}`
                : `${all.length} item${all.length === 1 ? '' : 's'}`}
              {items.length > 0 ? ` · ${totalUnits} unit${totalUnits === 1 ? '' : 's'}` : ''}
            </Text>
            {isFiltered ? (
              <Pressable
                onPress={() => {
                  tap();
                  setQ('');
                  setFilter('All');
                }}
                hitSlop={8}
                accessibilityRole="button"
                accessibilityLabel="Reset filters"
              >
                <Text style={{ fontSize: 12, color: colors.rust, fontWeight: '600' }}>Reset filter</Text>
              </Pressable>
            ) : null}
          </View>
        ) : null}
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
            <Empty icon="shirt-outline" title="No stock yet" text={isOwner ? 'Tap + to add your first piece.' : 'Items the owner adds will show here.'} />
          )
        }
        contentContainerStyle={{ paddingBottom: isOwner ? 96 : 24 }}
        renderItem={({ item, index }) => {
          const out = isOut(item);
          const low = isLow(item);
          return (
            <Pressable
              onPress={() => {
                tap();
                // Owners get the restock sheet (with History and Edit in it); staff go straight to the history.
                if (isOwner) setRestocking(item);
                else nav.navigate('ItemHistory', { item });
              }}
              accessibilityRole="button"
              accessibilityHint={isOwner ? 'Restock this item' : 'Shows the item history'}
              style={({ pressed }) => [groupRow(index, items.length), { gap: 12 }, pressed && { backgroundColor: colors.pressed }]}
            >
              <ItemThumb
                thumb={thumbOf(item.name, item.color)}
                onPress={() => {
                  const t = thumbOf(item.name, item.color);
                  if (t) setViewing({ thumb: t, title: `${item.name} · ${item.color}` });
                }}
              />
              <View style={{ flex: 1, paddingRight: 4 }}>
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
      {isOwner ? <Fab title="New item" iconOnly onPress={() => nav.navigate('AddItem')} /> : null}
      <ItemPhotoViewer thumb={viewing?.thumb ?? null} title={viewing?.title} onClose={() => setViewing(null)} />
      <RestockSheet
        item={restocking}
        thumb={restocking ? thumbOf(restocking.name, restocking.color) : undefined}
        onEdit={(item) => {
          setRestocking(null);
          nav.navigate('EditItem', { item, pricesLocked: item.unitsSold > 0 && !data?.salePricesSaved });
        }}
        onHistory={(item) => {
          setRestocking(null);
          nav.navigate('ItemHistory', { item });
        }}
        onClose={() => setRestocking(null)}
        onDone={(updated) => {
          // Show the new count straight away, then refetch to pick up anything else that changed.
          setData((d) => (d ? { ...d, items: d.items.map((i) => (i.itemId === updated.itemId ? { ...i, ...updated } : i)) } : d));
          void reload();
        }}
      />
    </Screen>
  );
}

function RestockSheet({
  item,
  thumb,
  onEdit,
  onHistory,
  onClose,
  onDone,
}: {
  item: InventoryItem | null;
  thumb?: Thumb;
  onEdit: (item: InventoryItem) => void;
  onHistory: (item: InventoryItem) => void;
  onClose: () => void;
  onDone: (updated: InventoryItem) => void;
}) {
  const toast = useToast();
  const [qty, setQty] = useState('');
  const [busy, setBusy] = useState(false);
  const [photoBusy, setPhotoBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const n = toNumber(qty);

  async function savePhoto(photo: PickedPhoto) {
    if (!item || !photo.thumb) return;
    setPhotoBusy(true);
    try {
      const r = await api.setItemPhoto(item.itemId, photo.base64, photo.thumb);
      setItemThumb(item.name, item.color, { photoId: r.photoId, thumb: r.thumb, full: photo.base64 });
      success();
      toast(`Photo saved for every ${item.name} in ${item.color || 'this colour'}.`);
    } catch (e) {
      toast(e instanceof Error ? e.message : String(e), 'error');
    } finally {
      setPhotoBusy(false);
    }
  }

  async function removePhoto() {
    if (!item) return;
    setPhotoBusy(true);
    try {
      await api.removeItemPhoto(item.itemId);
      setItemThumb(item.name, item.color, null);
      toast('Photo removed.');
    } catch (e) {
      toast(e instanceof Error ? e.message : String(e), 'error');
    } finally {
      setPhotoBusy(false);
    }
  }
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
      const res = await api.restock(item.itemId, n);
      const updated: InventoryItem = res && res.itemId ? res : { ...item, currentStock: item.currentStock + n };
      success();
      toast(`Added ${n} to ${item.name}. Now ${updated.currentStock} in stock.`);
      close();
      onDone(updated);
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
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 14, marginBottom: 16 }}>
        <PhotoPicker
          kind="item"
          name={item?.name ?? ''}
          busy={photoBusy}
          hasPhoto={!!thumb}
          preview={<ItemPhotoPreview thumb={thumb} width={72} />}
          onPicked={(p) => void savePhoto(p)}
          onRemove={() => void removePhoto()}
        />
        <View style={{ flex: 1, gap: 8, alignItems: 'flex-start' }}>
          <Text style={[ui.muted, { fontSize: 13 }]}>{thumb ? 'Tap the photo to change it. Every size in this colour shares it.' : 'Add a photo so staff can spot this piece at a glance.'}</Text>
          <View style={{ flexDirection: 'row', gap: 18 }}>
            <LinkButton
              title="Edit details"
              icon="create-outline"
              onPress={() => {
                if (!item) return;
                setQty('');
                setError(null);
                onEdit(item);
              }}
            />
            <LinkButton
              title="History"
              icon="time-outline"
              onPress={() => {
                if (!item) return;
                setQty('');
                setError(null);
                onHistory(item);
              }}
            />
          </View>
        </View>
      </View>
      <Input label="Units received" value={qty} onChangeText={setQty} keyboardType="number-pad" large placeholder="0" />
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
