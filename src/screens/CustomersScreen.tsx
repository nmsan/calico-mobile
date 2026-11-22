import { Ionicons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import React, { useState } from 'react';
import { FlatList, Pressable, RefreshControl, ScrollView, Text, View } from 'react-native';
import { api } from '../api';
import { PhotoPicker } from '../components/PhotoPicker';
import { rememberPhoto, type PickedPhoto } from '../photos';
import type { CustomersStackParams } from '../navigation';
import { colors } from '../theme';
import type { Customer } from '../types';
import {
  Avatar,
  Badge,
  Button,
  Card,
  Chips,
  Empty,
  ErrorText,
  Fab,
  groupRow,
  Hero,
  Input,
  money,
  moneyShort,
  prettyDate,
  Screen,
  SearchField,
  SectionLabel,
  Sheet,
  success,
  ui,
  useLoader,
  useToast,
} from '../ui';

const FILTERS = ['All', 'Owes money'];

export default function CustomersScreen() {
  const nav = useNavigation<NativeStackNavigationProp<CustomersStackParams>>();
  const { data, error, loading, reload } = useLoader(() => api.customers());
  const [q, setQ] = useState('');
  const [filter, setFilter] = useState('All');
  const [adding, setAdding] = useState(false);

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
            <Empty icon="people-outline" title="No customers yet" text="Tap + to add a customer, or save a sale with a new name." />
          )
        }
        contentContainerStyle={{ paddingBottom: 96 }}
        renderItem={({ item: c, index }) => (
          <Pressable
            onPress={() => nav.navigate('CustomerDetail', { name: c.name, contact: c.contact, photoId: c.photoId })}
            style={({ pressed }) => [groupRow(index, shown.length), { gap: 12 }, pressed && { backgroundColor: colors.pressed }]}
          >
            <Avatar name={c.name} photoId={c.photoId} />
            <View style={{ flex: 1 }}>
              <Text style={ui.rowTitle} numberOfLines={1}>
                {c.name}
              </Text>
              <Text style={ui.muted} numberOfLines={1}>
                {c.contact || 'No phone'} · {c.lastPurchase ? `last ${prettyDate(c.lastPurchase)}` : 'no purchases yet'}
              </Text>
            </View>
            {c.balance > 0 ? <Badge text={moneyShort(c.balance)} tone="owed" /> : c.purchases ? <Badge text="Clear" tone="ok" /> : <Badge text="New" tone="neutral" />}
            <Ionicons name="chevron-forward" size={18} color={colors.faint} />
          </Pressable>
        )}
      />
      <Fab title="Add customer" iconOnly onPress={() => setAdding(true)} />
      <AddCustomerSheet
        visible={adding}
        onClose={() => setAdding(false)}
        onSaved={() => {
          setAdding(false);
          void reload();
        }}
      />
    </Screen>
  );
}

/** Form for a new customer: name and an optional phone number. Also opened from the Home shortcut. */
export function AddCustomerSheet({ visible, onClose, onSaved }: { visible: boolean; onClose: () => void; onSaved: (c: Customer) => void }) {
  const toast = useToast();
  const [name, setName] = useState('');
  const [contact, setContact] = useState('');
  const [photo, setPhoto] = useState<PickedPhoto | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function save() {
    setError(null);
    const n = name.trim();
    const phone = contact.trim();
    if (!n) return setError('Enter the customer name.');
    if (phone && !/^[0-9+\-() ]{6,20}$/.test(phone)) return setError('Enter a valid phone number, or leave it empty.');
    setBusy(true);
    try {
      const c = await api.addCustomer(n, phone);
      let saved: Customer = c;
      let photoFailed = false;
      if (photo) {
        try {
          const r = await api.setCustomerPhoto(c.name, c.contact, photo.base64);
          rememberPhoto(r.photoId, photo.base64);
          saved = { ...c, photoId: r.photoId };
        } catch {
          photoFailed = true;
        }
      }
      success();
      toast(photoFailed ? `${c.name} added, but the photo did not upload. Add it from their page.` : `${c.name} added.`, photoFailed ? 'error' : 'ok');
      setName('');
      setContact('');
      setPhoto(null);
      onSaved(saved);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Sheet
      visible={visible}
      title="Add customer"
      onClose={() => {
        setError(null);
        onClose();
      }}
    >
      <ScrollView keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
        <View style={{ alignItems: 'center', marginBottom: 12 }}>
          <PhotoPicker name={name} size={76} uri={photo?.uri} onPicked={setPhoto} onRemove={() => setPhoto(null)} />
        </View>
        <Input label="Name" value={name} onChangeText={setName} placeholder="e.g. Nimali Perera" autoCapitalize="words" autoFocus maxLength={80} returnKeyType="next" />
        <Input
          label="Phone (optional)"
          value={contact}
          onChangeText={setContact}
          placeholder="e.g. 077 123 4567"
          keyboardType="phone-pad"
          maxLength={20}
          hint="Used to tell apart customers with the same name."
          returnKeyType="done"
          onSubmitEditing={save}
        />
        <ErrorText message={error} />
        <Button title="Save customer" onPress={save} loading={busy} disabled={!name.trim()} />
      </ScrollView>
    </Sheet>
  );
}
