import { Ionicons } from '@expo/vector-icons';
import { useHeaderHeight } from '@react-navigation/elements';
import React, { useMemo, useState } from 'react';
import { KeyboardAvoidingView, Pressable, ScrollView, Text, View } from 'react-native';
import { api } from '../api';
import type { Customer, InventoryItem } from '../types';
import { colors } from '../theme';
import {
  Avatar,
  Badge,
  Button,
  Card,
  Chips,
  Divider,
  ErrorText,
  Input,
  LinkButton,
  money,
  moneyShort,
  PickerModal,
  Screen,
  SectionLabel,
  Segmented,
  Stepper,
  success,
  today,
  toNumber,
  ui,
  useLoader,
  useToast,
  yesterday,
} from '../ui';

type Line = { item: InventoryItem; qty: number; discount: string; showDiscount: boolean };
type PayMode = 'full' | 'part' | 'credit';
type Buyer = { name: string; contact: string; isNew: boolean; owes: number };
const DAY_OPTIONS = ['Today', 'Yesterday', 'Other'];

export default function SellScreen() {
  const toast = useToast();
  const headerHeight = useHeaderHeight();
  const inv = useLoader(() => api.inventory());
  const cust = useLoader(() => api.customers());

  const [lines, setLines] = useState<Line[]>([]);
  const [buyer, setBuyer] = useState<Buyer | null>(null);
  const [day, setDay] = useState('Today');
  const [otherDate, setOtherDate] = useState(today());
  const [pay, setPay] = useState<PayMode>('full');
  const [amountPaid, setAmountPaid] = useState('');
  const [pickItem, setPickItem] = useState(false);
  const [pickCustomer, setPickCustomer] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const totals = useMemo(() => {
    let total = 0;
    let bad = false;
    for (const l of lines) {
      const d = l.discount ? toNumber(l.discount) : 0;
      if (!Number.isFinite(d) || d < 0 || d > l.qty * l.item.sellingPrice) bad = true;
      else total += l.qty * l.item.sellingPrice - d;
    }
    return { total: Math.round(total * 100) / 100, bad, units: lines.reduce((s, l) => s + l.qty, 0) };
  }, [lines]);

  const paid = pay === 'full' ? totals.total : pay === 'credit' ? 0 : amountPaid ? toNumber(amountPaid) : 0;
  const balance = Math.round((totals.total - (Number.isFinite(paid) ? paid : 0)) * 100) / 100;
  const date = day === 'Today' ? today() : day === 'Yesterday' ? yesterday() : otherDate;

  function addItem(item: InventoryItem) {
    setPickItem(false);
    setLines((ls) => {
      const i = ls.findIndex((l) => l.item.itemId === item.itemId);
      if (i >= 0) {
        const copy = ls.slice();
        copy[i] = { ...copy[i], qty: Math.min(copy[i].qty + 1, Math.max(item.currentStock, 1)) };
        return copy;
      }
      return [...ls, { item, qty: 1, discount: '', showDiscount: false }];
    });
  }

  const updateLine = (i: number, patch: Partial<Line>) => setLines((ls) => ls.map((x, j) => (j === i ? { ...x, ...patch } : x)));

  function chooseCustomer(c: Customer) {
    setPickCustomer(false);
    setBuyer({ name: c.name, contact: c.contact, isNew: false, owes: Math.max(0, c.balance) });
  }

  function reset() {
    setLines([]);
    setBuyer(null);
    setDay('Today');
    setOtherDate(today());
    setPay('full');
    setAmountPaid('');
    setError(null);
  }

  async function submit() {
    setError(null);
    if (!lines.length) return setError('Add at least one item.');
    if (!buyer?.name.trim()) return setError('Choose the customer, or add a new one.');
    if (totals.bad) return setError('A discount is more than the item total. Check the discounts.');
    if (!Number.isFinite(paid) || paid < 0 || paid > totals.total) return setError(`Amount paid must be between Rs 0 and ${money(totals.total)}.`);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return setError('Enter the date as YYYY-MM-DD.');
    setBusy(true);
    try {
      const res = await api.recordSale({
        date,
        customerName: buyer.name.trim(),
        contact: buyer.contact.trim(),
        amountPaid: paid,
        items: lines.map((l) => ({ itemId: l.item.itemId, qty: l.qty, discount: l.discount ? toNumber(l.discount) : 0 })),
      });
      success();
      toast(res.balance > 0 ? `Sale saved. ${buyer.name} owes ${money(res.balance)}.` : `Sale saved. ${money(res.total)} paid.`);
      reset();
      void inv.reload();
      void cust.reload();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  const lowLevel = inv.data?.lowStockLevel ?? 5;

  return (
    <Screen>
      <KeyboardAvoidingView behavior="padding" style={{ flex: 1 }} keyboardVerticalOffset={headerHeight}>
        <ScrollView keyboardShouldPersistTaps="handled" keyboardDismissMode="on-drag" contentContainerStyle={{ paddingBottom: 24 }}>
          {/* Items */}
          <Card>
            <View style={[ui.between, { marginBottom: lines.length ? 6 : 0 }]}>
              <SectionLabel>{lines.length ? `Items · ${totals.units}` : 'Items'}</SectionLabel>
              {lines.length ? <LinkButton title="Add item" icon="add" onPress={() => setPickItem(true)} /> : null}
            </View>
            {lines.length === 0 ? (
              <Pressable onPress={() => setPickItem(true)} style={({ pressed }) => [sell.addFirst, pressed && { backgroundColor: colors.pressed }]}>
                <Ionicons name="add-circle" size={26} color={colors.terra} />
                <View style={{ flex: 1 }}>
                  <Text style={{ fontSize: 16, fontWeight: '600', color: colors.ink }}>Add the first item</Text>
                  <Text style={ui.muted}>Search by name, ID, size or colour</Text>
                </View>
              </Pressable>
            ) : null}
            {lines.map((l, i) => {
              const lineTotal = l.qty * l.item.sellingPrice - (l.discount ? toNumber(l.discount) || 0 : 0);
              const atMax = l.qty >= l.item.currentStock;
              return (
                <View key={l.item.itemId}>
                  {i ? <Divider /> : null}
                  <View style={{ paddingVertical: 12 }}>
                    <View style={{ flexDirection: 'row', gap: 12, alignItems: 'flex-start' }}>
                      <View style={{ flex: 1 }}>
                        <Text style={ui.rowTitle}>{l.item.name}</Text>
                        <Text style={ui.muted}>
                          {l.item.size} / {l.item.color} · {moneyShort(l.item.sellingPrice)} each
                        </Text>
                      </View>
                      <Pressable
                        onPress={() => setLines((ls) => ls.filter((_, j) => j !== i))}
                        hitSlop={10}
                        accessibilityLabel={`Remove ${l.item.name}`}
                      >
                        <Ionicons name="trash-outline" size={20} color={colors.muted} />
                      </Pressable>
                    </View>
                    <View style={[ui.between, { marginTop: 10 }]}>
                      <Stepper value={l.qty} onChange={(n) => updateLine(i, { qty: n })} max={Math.max(l.item.currentStock, 1)} />
                      <Text style={[ui.num, { fontSize: 16, fontWeight: '600', color: colors.ink }]}>{money(lineTotal)}</Text>
                    </View>
                    {atMax ? <Text style={[ui.muted, { color: colors.low, marginTop: 6 }]}>That is all the stock ({l.item.currentStock}).</Text> : null}
                    {l.showDiscount ? (
                      <Input
                        label="Discount on this line"
                        prefix="Rs"
                        value={l.discount}
                        keyboardType="decimal-pad"
                        placeholder="0"
                        onChangeText={(s) => updateLine(i, { discount: s })}
                        style={{ marginTop: 10, marginBottom: 0 }}
                      />
                    ) : (
                      <Pressable onPress={() => updateLine(i, { showDiscount: true })} hitSlop={8} style={{ marginTop: 8, alignSelf: 'flex-start' }}>
                        <Text style={{ color: colors.rust, fontWeight: '500', fontSize: 14 }}>+ Discount</Text>
                      </Pressable>
                    )}
                  </View>
                </View>
              );
            })}
          </Card>

          {/* Customer */}
          <Card>
            <SectionLabel style={{ marginBottom: 10 }}>Customer</SectionLabel>
            {buyer ? (
              <View>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
                  <Avatar name={buyer.name} />
                  <View style={{ flex: 1 }}>
                    <Text style={ui.rowTitle}>{buyer.name}</Text>
                    <Text style={ui.muted}>{buyer.isNew ? 'New customer' : buyer.contact || 'No phone'}</Text>
                  </View>
                  <LinkButton title="Change" onPress={() => setPickCustomer(true)} />
                </View>
                {buyer.owes > 0 ? (
                  <View style={{ marginTop: 10 }}>
                    <Badge text={`Already owes ${money(buyer.owes)}`} tone="owed" style={{ alignSelf: 'flex-start' }} />
                  </View>
                ) : null}
                {buyer.isNew ? (
                  <Input
                    label="Phone (optional)"
                    value={buyer.contact}
                    onChangeText={(s) => setBuyer({ ...buyer, contact: s })}
                    keyboardType="phone-pad"
                    style={{ marginTop: 14, marginBottom: 0 }}
                    hint="Saved with the sale, so you can find them next time."
                  />
                ) : null}
              </View>
            ) : (
              <Pressable onPress={() => setPickCustomer(true)} style={({ pressed }) => [sell.picker, pressed && { backgroundColor: colors.pressed }]}>
                <Ionicons name="search" size={18} color={colors.muted} />
                <Text style={{ color: colors.faint, fontSize: 16, flex: 1 }}>Find or add a customer</Text>
                <Ionicons name="chevron-forward" size={18} color={colors.faint} />
              </Pressable>
            )}
          </Card>

          {/* Payment */}
          <Card>
            <SectionLabel style={{ marginBottom: 10 }}>Payment</SectionLabel>
            <Segmented<PayMode>
              value={pay}
              onChange={setPay}
              options={[
                { value: 'full', label: 'Paid in full' },
                { value: 'part', label: 'Part paid' },
                { value: 'credit', label: 'On credit' },
              ]}
            />
            {pay === 'part' ? (
              <Input label="Amount paid now" prefix="Rs" large value={amountPaid} onChangeText={setAmountPaid} keyboardType="decimal-pad" placeholder="0" style={{ marginTop: 14, marginBottom: 0 }} />
            ) : null}
            {balance > 0 && lines.length ? (
              <View style={[sell.owe]}>
                <Ionicons name="information-circle" size={18} color={colors.owed} />
                <Text style={{ color: colors.owed, fontWeight: '600', flex: 1 }}>
                  {buyer?.name || 'The customer'} will owe {money(balance)}
                </Text>
              </View>
            ) : null}

            <SectionLabel style={{ marginTop: 18, marginBottom: 10 }}>Sale date</SectionLabel>
            <Chips options={DAY_OPTIONS} value={day} onChange={setDay} />
            {day === 'Other' ? (
              <Input value={otherDate} onChangeText={setOtherDate} placeholder="YYYY-MM-DD" autoCapitalize="none" keyboardType="numbers-and-punctuation" style={{ marginTop: 12, marginBottom: 0 }} />
            ) : null}
          </Card>

          <View style={{ paddingHorizontal: 16 }}>
            <ErrorText message={error ?? inv.error} />
          </View>
        </ScrollView>

        {/* Pinned total + save */}
        <View style={sell.dock}>
          <View style={{ flex: 1 }}>
            <SectionLabel>Total</SectionLabel>
            <Text style={sell.total} numberOfLines={1} adjustsFontSizeToFit>
              {money(totals.total)}
            </Text>
          </View>
          <Button title="Save sale" onPress={submit} loading={busy} disabled={!lines.length} style={{ paddingHorizontal: 26 }} />
        </View>
      </KeyboardAvoidingView>

      <PickerModal
        visible={pickItem}
        title="Add item"
        placeholder="Name, ID, size or colour"
        items={inv.data?.items ?? []}
        keyOf={(i) => i.itemId}
        searchTextOf={(i) => `${i.name} ${i.itemId} ${i.size} ${i.color} ${i.category}`}
        isDisabled={(i) => i.currentStock <= 0}
        renderRow={(i) => {
          const inCart = lines.find((l) => l.item.itemId === i.itemId)?.qty ?? 0;
          return (
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
              <View style={{ flex: 1 }}>
                <Text style={ui.rowTitle}>{i.name}</Text>
                <Text style={ui.muted}>
                  {i.size} / {i.color} · {moneyShort(i.sellingPrice)}
                  {inCart ? ` · ${inCart} in this sale` : ''}
                </Text>
              </View>
              <Badge
                text={i.currentStock <= 0 ? 'Out of stock' : `${i.currentStock} left`}
                tone={i.currentStock <= 0 ? 'owed' : i.currentStock <= lowLevel ? 'low' : 'neutral'}
              />
            </View>
          );
        }}
        onPick={addItem}
        onClose={() => setPickItem(false)}
      />
      <PickerModal
        visible={pickCustomer}
        title="Customer"
        placeholder="Name or phone"
        items={cust.data ?? []}
        keyOf={(c) => c.name + '|' + c.contact}
        searchTextOf={(c) => `${c.name} ${c.contact} ${c.customerId}`}
        createLabel={(q) => `Add "${q}" as a new customer`}
        onCreate={(q) => {
          setPickCustomer(false);
          setBuyer({ name: q, contact: '', isNew: true, owes: 0 });
        }}
        renderRow={(c) => (
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
            <Avatar name={c.name} size={36} />
            <View style={{ flex: 1 }}>
              <Text style={ui.rowTitle}>{c.name}</Text>
              <Text style={ui.muted}>{c.contact || 'No phone'}</Text>
            </View>
            {c.balance > 0 ? <Badge text={`Owes ${moneyShort(c.balance)}`} tone="owed" /> : null}
          </View>
        )}
        onPick={chooseCustomer}
        onClose={() => setPickCustomer(false)}
      />
    </Screen>
  );
}

const sell = {
  addFirst: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: 12,
    marginTop: 12,
    padding: 14,
    borderRadius: 12,
    borderWidth: 1.5,
    borderStyle: 'dashed' as const,
    borderColor: colors.sand,
  },
  picker: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: 8,
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 13,
  },
  owe: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: 8,
    marginTop: 14,
    padding: 12,
    borderRadius: 10,
    backgroundColor: colors.owedBg,
  },
  dock: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: 16,
    paddingHorizontal: 16,
    paddingVertical: 12,
    backgroundColor: colors.surface,
    borderTopWidth: 1,
    borderTopColor: colors.line,
  },
  total: { fontSize: 24, fontWeight: '700' as const, letterSpacing: -0.5, color: colors.ink, fontVariant: ['tabular-nums' as const], marginTop: 2 },
};
