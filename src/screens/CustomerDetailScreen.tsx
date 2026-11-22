import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import React, { useLayoutEffect, useState } from 'react';
import { FlatList, RefreshControl, Text, View } from 'react-native';
import { api } from '../api';
import { PhotoPicker } from '../components/PhotoPicker';
import { rememberPhoto, type PickedPhoto } from '../photos';
import type { CustomersStackParams } from '../navigation';
import { colors } from '../theme';
import {
  Badge,
  Button,
  Card,
  Empty,
  ErrorText,
  groupRow,
  Hero,
  Input,
  money,
  prettyDate,
  Screen,
  SectionLabel,
  Sheet,
  success,
  toNumber,
  ui,
  useLoader,
  useToast,
} from '../ui';

type Props = NativeStackScreenProps<CustomersStackParams, 'CustomerDetail'>;

export default function CustomerDetailScreen({ route, navigation }: Props) {
  const { name, contact } = route.params;
  const [photoId, setPhotoId] = useState(route.params.photoId);
  const [photoBusy, setPhotoBusy] = useState(false);
  const toast = useToast();
  const { data, error, loading, reload } = useLoader(() => api.customerSales(name, contact));
  const [paying, setPaying] = useState(false);
  const [amount, setAmount] = useState('');
  const [busy, setBusy] = useState(false);
  const [payError, setPayError] = useState<string | null>(null);

  useLayoutEffect(() => {
    navigation.setOptions({ title: name });
  }, [navigation, name]);

  const sales = data ?? [];
  const owed = Math.round(sales.reduce((s, x) => s + Math.max(0, x.balance), 0) * 100) / 100;
  const spent = sales.reduce((s, x) => s + x.total, 0);

  async function savePhoto(photo: PickedPhoto) {
    setPhotoBusy(true);
    try {
      const r = await api.setCustomerPhoto(name, contact, photo.base64);
      rememberPhoto(r.photoId, photo.base64);
      setPhotoId(r.photoId);
      success();
      toast('Photo saved.');
    } catch (e) {
      toast(e instanceof Error ? e.message : String(e), 'error');
    } finally {
      setPhotoBusy(false);
    }
  }

  async function removePhoto() {
    setPhotoBusy(true);
    try {
      await api.removeCustomerPhoto(name, contact);
      setPhotoId(undefined);
      toast('Photo removed.');
    } catch (e) {
      toast(e instanceof Error ? e.message : String(e), 'error');
    } finally {
      setPhotoBusy(false);
    }
  }

  function closePay() {
    setPaying(false);
    setAmount('');
    setPayError(null);
  }

  async function pay() {
    setPayError(null);
    const n = toNumber(amount);
    if (!Number.isFinite(n) || n <= 0) return setPayError('Enter an amount above 0.');
    if (n > owed) return setPayError(`That is more than they owe (${money(owed)}).`);
    setBusy(true);
    try {
      const res = await api.recordPayment(name, contact, n);
      success();
      toast(res.remainingBalance > 0 ? `Received ${money(n)}. Still owes ${money(res.remainingBalance)}.` : `Received ${money(n)}. ${name} is paid up.`);
      closePay();
      void reload();
    } catch (e) {
      setPayError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  const header = (
    <View>
      <Card style={{ marginTop: 4 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 14, marginBottom: 16 }}>
          <PhotoPicker name={name} size={64} photoId={photoId} busy={photoBusy} onPicked={(p) => void savePhoto(p)} onRemove={() => void removePhoto()} />
          <View style={{ flex: 1 }}>
            <Text style={{ fontSize: 18, fontWeight: '600', color: colors.ink }}>{name}</Text>
            <Text style={ui.muted}>{contact || 'No phone saved'}</Text>
          </View>
        </View>
        <SectionLabel>{owed > 0 ? 'Owes' : 'Balance'}</SectionLabel>
        <Hero color={owed > 0 ? colors.owed : colors.ok}>{owed > 0 ? money(owed) : 'Paid up'}</Hero>
        <Text style={[ui.muted, { marginBottom: owed > 0 ? 14 : 0 }]}>
          {money(spent)} across {sales.length} purchase{sales.length === 1 ? '' : 's'}
        </Text>
        {owed > 0 ? <Button title="Record a payment" icon="cash-outline" onPress={() => setPaying(true)} /> : null}
      </Card>
      <View style={{ paddingHorizontal: 16 }}>
        <ErrorText message={error} />
      </View>
      <SectionLabel style={{ marginHorizontal: 16, marginTop: 20, marginBottom: 10 }}>Purchases</SectionLabel>
    </View>
  );

  return (
    <Screen>
      <FlatList
        data={sales}
        keyExtractor={(s) => String(s.row)}
        refreshControl={<RefreshControl refreshing={loading} onRefresh={reload} tintColor={colors.rust} />}
        contentContainerStyle={{ paddingBottom: 32 }}
        ListHeaderComponent={header}
        ListEmptyComponent={loading ? undefined : <Empty icon="receipt-outline" text="No purchases found." />}
        renderItem={({ item: s, index }) => (
          <View style={[groupRow(index, sales.length), { alignItems: 'flex-start' }]}>
            <View style={{ flex: 1, paddingRight: 10 }}>
              <Text style={ui.rowTitle}>
                {s.itemName} <Text style={{ color: colors.muted, fontWeight: '400' }}>× {s.qty}</Text>
              </Text>
              <Text style={ui.muted}>
                {prettyDate(s.date)} · {s.variant}
                {s.discount ? ` · ${money(s.discount)} off` : ''}
              </Text>
              <Text style={[ui.muted, ui.num]}>
                Paid {money(s.paid)} of {money(s.total)}
              </Text>
            </View>
            <View style={{ alignItems: 'flex-end', gap: 4 }}>
              {s.balance > 0 ? <Text style={[ui.num, { color: colors.owed, fontWeight: '700' }]}>{money(s.balance)}</Text> : null}
              <Badge text={s.status} />
            </View>
          </View>
        )}
      />

      <Sheet visible={paying} title="Record a payment" subtitle={`${name} owes ${money(owed)}. The payment clears the oldest sales first.`} onClose={closePay}>
        <Input label="Amount received" prefix="Rs" large value={amount} onChangeText={setAmount} keyboardType="decimal-pad" placeholder="0" autoFocus />
        <View style={{ flexDirection: 'row', gap: 8, marginBottom: 16 }}>
          <Button title="Full amount" variant="secondary" onPress={() => setAmount(String(owed))} style={{ flex: 1, paddingVertical: 11 }} />
          <Button title="Half" variant="secondary" onPress={() => setAmount(String(Math.round((owed / 2) * 100) / 100))} style={{ flex: 1, paddingVertical: 11 }} />
        </View>
        <ErrorText message={payError} />
        <Button title="Save payment" onPress={pay} loading={busy} disabled={!amount} />
      </Sheet>
    </Screen>
  );
}
