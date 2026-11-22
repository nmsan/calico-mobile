import { Ionicons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import React, { useState } from 'react';
import { RefreshControl, ScrollView, Text, View } from 'react-native';
import { api } from '../api';
import type { ReportsStackParams } from '../navigation';
import { colors } from '../theme';
import type { OwnerTxType, PartnerBalance } from '../types';
import {
  Button,
  Card,
  Chips,
  Divider,
  Empty,
  ErrorText,
  groupRow,
  Hero,
  Input,
  KeyValue,
  Label,
  LinkButton,
  Loading,
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

const METHODS = ['Cash', 'Bank Transfer', 'Card', 'Online Wallet'];
const DAY_OPTIONS = ['Today', 'Yesterday', 'Other'];

export default function OwnersScreen() {
  const nav = useNavigation<NativeStackNavigationProp<ReportsStackParams>>();
  const { data, error, loading, reload } = useLoader(async () => {
    const [summary, txs] = await Promise.all([api.ownerSummary(), api.ownerTransactions()]);
    return { summary, txs };
  });
  const [adding, setAdding] = useState<OwnerTxType | null>(null);

  const s = data?.summary;
  const t = s?.totals;
  const txs = data?.txs ?? [];

  return (
    <Screen>
      <ScrollView refreshControl={<RefreshControl refreshing={loading} onRefresh={reload} tintColor={colors.rust} />} contentContainerStyle={{ paddingBottom: 40 }}>
        <View style={{ paddingHorizontal: 16 }}>
          <ErrorText message={error} />
        </View>
        {!data && loading ? <Loading /> : null}

        {s && !s.opening ? (
          <View style={{ paddingHorizontal: 16 }}>
            <Empty
              icon="flag-outline"
              title="Set your opening balances"
              text="The business started before the app. Count your stock and cash, and enter what each partner put in and took out, so balances start correct."
            />
            <Button title="Start opening setup" icon="arrow-forward" onPress={() => nav.navigate('OpeningSetup')} />
          </View>
        ) : null}

        {s?.opening && t ? (
          <>
            <Card style={{ marginTop: 4 }}>
              <SectionLabel>Cash in hand (estimate)</SectionLabel>
              <Hero color={t.cashEstimate < 0 ? colors.owed : colors.ink}>{money(t.cashEstimate)}</Hero>
              <Text style={ui.muted}>Since {prettyDate(s.opening.date)}. Stock bought after go-live is not taken off yet.</Text>
              <View style={{ flexDirection: 'row', gap: 10, marginTop: 14 }}>
                <Button title="Money taken" icon="arrow-up-outline" variant="secondary" style={{ flex: 1 }} onPress={() => setAdding('Drawing')} />
                <Button title="Money put in" icon="arrow-down-outline" variant="secondary" style={{ flex: 1 }} onPress={() => setAdding('Capital in')} />
              </View>
            </Card>

            {s.partners.map((p) => (
              <PartnerCard key={p.username} p={p} />
            ))}

            <Card>
              <SectionLabel style={{ marginBottom: 6 }}>How the cash adds up</SectionLabel>
              <KeyValue label="Cash on go-live day" value={money(s.opening.cash)} />
              <KeyValue label="Collected from customers" value={`+ ${money(t.cashCollected)}`} />
              <KeyValue label="Expenses paid" value={`− ${money(t.expenses)}`} muted />
              <KeyValue label="Money put in by partners" value={`+ ${money(t.capitalIn)}`} />
              <KeyValue label="Money taken by partners" value={`− ${money(t.drawings)}`} muted />
              <Divider style={{ marginVertical: 4 }} />
              <KeyValue label="Cash in hand (estimate)" value={money(t.cashEstimate)} bold />
            </Card>

            <Card>
              <SectionLabel style={{ marginBottom: 6 }}>Profit shared between partners</SectionLabel>
              <KeyValue label="Profit before the app" value={money(t.pastProfit)} />
              <KeyValue label={`Profit since ${prettyDate(s.opening.date)}`} value={money(t.profitSince)} />
              <KeyValue label="Total" value={money(t.pastProfit + t.profitSince)} bold />
              <View style={{ marginTop: 8 }}>
                <LinkButton title="Redo opening setup" icon="create-outline" onPress={() => nav.navigate('OpeningSetup')} />
              </View>
            </Card>

            <SectionLabel style={{ marginHorizontal: 16, marginTop: 20, marginBottom: 10 }}>Money in and out</SectionLabel>
            {txs.length ? (
              txs.map((x, i) => {
                const out = x.type === 'Drawing';
                return (
                  <View key={x.row} style={[groupRow(i, txs.length), { gap: 12 }]}>
                    <View style={[ui.iconCircle, { backgroundColor: colors.shell }]}>
                      <Ionicons name={out ? 'arrow-up-outline' : 'arrow-down-outline'} size={18} color={out ? colors.owed : colors.ok} />
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={ui.rowTitle}>
                        {x.owner} {out ? 'took' : 'put in'}
                      </Text>
                      <Text style={ui.muted} numberOfLines={1}>
                        {prettyDate(x.date)}
                        {x.method ? ` · ${x.method}` : ''}
                        {x.note ? ` · ${x.note}` : ''}
                      </Text>
                    </View>
                    <Text style={[ui.num, { fontWeight: '600', fontSize: 15, color: out ? colors.owed : colors.ok }]}>
                      {out ? '− ' : '+ '}
                      {money(x.amount)}
                    </Text>
                  </View>
                );
              })
            ) : (
              <Text style={[ui.muted, { marginHorizontal: 16 }]}>Nothing recorded since go-live.</Text>
            )}
          </>
        ) : null}
      </ScrollView>

      {s?.opening ? (
        <OwnerTxSheet
          type={adding}
          owners={s.partners.map((p) => p.username)}
          minDate={s.opening.date}
          onClose={() => setAdding(null)}
          onSaved={() => {
            setAdding(null);
            void reload();
          }}
        />
      ) : null}
    </Screen>
  );
}

function PartnerCard({ p }: { p: PartnerBalance }) {
  return (
    <Card>
      <View style={ui.between}>
        <SectionLabel>{p.username}</SectionLabel>
        <Text style={ui.muted}>{p.sharePercent}% of profit</Text>
      </View>
      <Hero size={28} color={p.balance < 0 ? colors.owed : colors.ink}>
        {money(p.balance)}
      </Hero>
      <KeyValue label="Put in" value={money(p.openingCapital + p.capitalIn)} />
      <KeyValue label="Taken out" value={`− ${money(p.openingDrawings + p.drawings)}`} muted />
      <KeyValue label="Share of profit" value={money(p.profitShare)} />
    </Card>
  );
}

function OwnerTxSheet({
  type,
  owners,
  minDate,
  onClose,
  onSaved,
}: {
  type: OwnerTxType | null;
  owners: string[];
  minDate: string;
  onClose: () => void;
  onSaved: () => void;
}) {
  const toast = useToast();
  const [owner, setOwner] = useState(owners[0] ?? '');
  const [amount, setAmount] = useState('');
  const [method, setMethod] = useState('Cash');
  const [note, setNote] = useState('');
  const [day, setDay] = useState('Today');
  const [otherDate, setOtherDate] = useState(today());
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const out = type === 'Drawing';

  async function save() {
    if (!type) return;
    setError(null);
    const n = toNumber(amount);
    const date = day === 'Today' ? today() : day === 'Yesterday' ? yesterday() : otherDate;
    if (!owner) return setError('Pick who it is.');
    if (!Number.isFinite(n) || n <= 0) return setError('Enter an amount above 0.');
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return setError('Enter the date as YYYY-MM-DD.');
    if (date < minDate) return setError(`Date cannot be before the go-live day (${prettyDate(minDate)}).`);
    setBusy(true);
    try {
      await api.addOwnerTransaction({ date, owner, type, amount: n, method, note: note.trim() });
      success();
      toast(`${owner} ${out ? 'took' : 'put in'} ${money(n)}.`);
      setAmount('');
      setNote('');
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
    <Sheet
      visible={type !== null}
      title={out ? 'Money taken by owner' : 'Money put in by owner'}
      subtitle={out ? 'Not an expense: it lowers this partner’s balance, not the profit.' : 'Extra capital added to the business.'}
      onClose={onClose}
    >
      <ScrollView keyboardShouldPersistTaps="handled" style={{ maxHeight: 560 }} showsVerticalScrollIndicator={false}>
        <Input label="Amount" prefix="Rs" large value={amount} onChangeText={setAmount} keyboardType="decimal-pad" placeholder="0" />
        <Label>Who</Label>
        <Chips options={owners} value={owner} onChange={setOwner} style={{ marginBottom: 16 }} />
        <Label>{out ? 'Taken as' : 'Paid as'}</Label>
        <Chips options={METHODS} value={method} onChange={setMethod} style={{ marginBottom: 16 }} />
        <Input label="Note (optional)" value={note} onChangeText={setNote} placeholder={out ? 'e.g. Monthly personal' : 'e.g. For new stock'} />
        <Label>Date</Label>
        <Chips options={DAY_OPTIONS} value={day} onChange={setDay} style={{ marginBottom: day === 'Other' ? 12 : 16 }} />
        {day === 'Other' ? <Input value={otherDate} onChangeText={setOtherDate} placeholder="YYYY-MM-DD" autoCapitalize="none" keyboardType="numbers-and-punctuation" /> : null}
        <ErrorText message={error} />
        <Button title="Save" onPress={save} loading={busy} disabled={!amount} />
      </ScrollView>
    </Sheet>
  );
}
