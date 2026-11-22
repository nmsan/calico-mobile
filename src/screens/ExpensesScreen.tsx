import { Ionicons } from '@expo/vector-icons';
import React, { useState } from 'react';
import { FlatList, RefreshControl, ScrollView, Text, View } from 'react-native';
import { api } from '../api';
import { colors } from '../theme';
import {
  Button,
  Card,
  Chips,
  Empty,
  ErrorText,
  Fab,
  groupRow,
  Hero,
  Input,
  Label,
  money,
  prettyDate,
  Screen,
  SectionLabel,
  Sheet,
  success,
  today,
  toNumber,
  ui,
  useLoader,
  useToast,
  yesterday,
} from '../ui';

const CATEGORIES = ['Rent', 'Utilities', 'Packaging', 'Shipping', 'Marketing', 'Salaries', 'Other'];
const METHODS = ['Cash', 'Bank Transfer', 'Card', 'Online Wallet'];
const DAY_OPTIONS = ['Today', 'Yesterday', 'Other'];

type IconName = React.ComponentProps<typeof Ionicons>['name'];
const CATEGORY_ICONS: Record<string, IconName> = {
  Rent: 'storefront-outline',
  Utilities: 'flash-outline',
  Packaging: 'cube-outline',
  Shipping: 'car-outline',
  Marketing: 'megaphone-outline',
  Salaries: 'people-outline',
};

export default function ExpensesScreen() {
  const { data, error, loading, reload } = useLoader(() => api.expenses(200));
  const [adding, setAdding] = useState(false);
  const thisMonth = today().slice(0, 7);
  const monthRows = (data ?? []).filter((e) => e.date.startsWith(thisMonth));
  const monthTotal = monthRows.reduce((s, e) => s + e.amount, 0);
  const rows = data ?? [];

  return (
    <Screen>
      <FlatList
        data={rows}
        keyExtractor={(e) => String(e.row)}
        refreshControl={<RefreshControl refreshing={loading} onRefresh={reload} tintColor={colors.rust} />}
        ListHeaderComponent={
          <View>
            <Card style={{ marginTop: 4 }}>
              <SectionLabel>Spent this month</SectionLabel>
              <Hero>{money(monthTotal)}</Hero>
              <Text style={ui.muted}>
                {monthRows.length} expense{monthRows.length === 1 ? '' : 's'} recorded
              </Text>
            </Card>
            <View style={{ paddingHorizontal: 16 }}>
              <ErrorText message={error} />
            </View>
            {rows.length ? <SectionLabel style={{ marginHorizontal: 16, marginTop: 20, marginBottom: 10 }}>Recent</SectionLabel> : null}
          </View>
        }
        ListEmptyComponent={loading ? undefined : <Empty icon="wallet-outline" title="No expenses yet" text="Tap + to record rent, packaging, shipping and other costs." />}
        contentContainerStyle={{ paddingBottom: 96 }}
        renderItem={({ item: e, index }) => (
          <View style={[groupRow(index, rows.length), { gap: 12 }]}>
            <View style={[ui.iconCircle, { backgroundColor: colors.shell }]}>
              <Ionicons name={CATEGORY_ICONS[e.category] ?? 'receipt-outline'} size={18} color={colors.rust} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={ui.rowTitle}>{e.category}</Text>
              <Text style={ui.muted} numberOfLines={1}>
                {prettyDate(e.date)}
                {e.description ? ` · ${e.description}` : ''}
                {e.method ? ` · ${e.method}` : ''}
              </Text>
            </View>
            <Text style={[ui.num, { fontWeight: '600', fontSize: 15, color: colors.ink }]}>{money(e.amount)}</Text>
          </View>
        )}
      />
      <Fab title="Add expense" iconOnly onPress={() => setAdding(true)} />
      <AddExpenseSheet
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

/** Form for one expense. Also opened from the Home shortcut. */
export function AddExpenseSheet({ visible, onClose, onSaved }: { visible: boolean; onClose: () => void; onSaved: () => void }) {
  const toast = useToast();
  const [category, setCategory] = useState('Packaging');
  const [method, setMethod] = useState('Cash');
  const [amount, setAmount] = useState('');
  const [description, setDescription] = useState('');
  const [day, setDay] = useState('Today');
  const [otherDate, setOtherDate] = useState(today());
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function save() {
    setError(null);
    const n = toNumber(amount);
    const date = day === 'Today' ? today() : day === 'Yesterday' ? yesterday() : otherDate;
    if (!Number.isFinite(n) || n <= 0) return setError('Enter an amount above 0.');
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return setError('Enter the date as YYYY-MM-DD.');
    setBusy(true);
    try {
      await api.addExpense({ date, category, description: description.trim(), amount: n, method });
      success();
      toast(`${category} expense of ${money(n)} saved.`);
      setAmount('');
      setDescription('');
      setDay('Today');
      setOtherDate(today());
      onSaved();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Sheet visible={visible} title="Add expense" onClose={onClose}>
      <ScrollView keyboardShouldPersistTaps="handled" style={{ maxHeight: 560 }} showsVerticalScrollIndicator={false}>
        <Input label="Amount" prefix="Rs" large value={amount} onChangeText={setAmount} keyboardType="decimal-pad" placeholder="0" />
        <Label>Category</Label>
        <Chips options={CATEGORIES} value={category} onChange={setCategory} style={{ marginBottom: 16 }} />
        <Input label="Note (optional)" value={description} onChangeText={setDescription} placeholder="e.g. Gift boxes for November" />
        <Label>Paid by</Label>
        <Chips options={METHODS} value={method} onChange={setMethod} style={{ marginBottom: 16 }} />
        <Label>Date</Label>
        <Chips options={DAY_OPTIONS} value={day} onChange={setDay} style={{ marginBottom: day === 'Other' ? 12 : 16 }} />
        {day === 'Other' ? <Input value={otherDate} onChangeText={setOtherDate} placeholder="YYYY-MM-DD" autoCapitalize="none" keyboardType="numbers-and-punctuation" /> : null}
        <ErrorText message={error} />
        <Button title="Save expense" onPress={save} loading={busy} disabled={!amount} />
      </ScrollView>
    </Sheet>
  );
}
