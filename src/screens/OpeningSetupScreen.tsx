import { useNavigation } from '@react-navigation/native';
import React, { useMemo, useRef, useState } from 'react';
import { ScrollView, Text, View } from 'react-native';
import { api } from '../api';
import { colors } from '../theme';
import type { InventoryItem, OpeningBalances, OpeningInput, OwnerSummary } from '../types';
import {
  Button,
  Card,
  Divider,
  ErrorText,
  Input,
  KeyValue,
  Loading,
  money,
  prettyDate,
  Screen,
  SectionLabel,
  Segmented,
  success,
  today,
  toNumber,
  ui,
  useLoader,
  useToast,
} from '../ui';

type Step = '1' | '2' | '3' | '4';
type PartnerForm = { username: string; capital: string; drawings: string; share: string };

/**
 * One-time setup for a business that was already trading before the app:
 * count the stock, enter cash in hand, and what each partner put in and took out.
 * The difference is saved as "profit before the app".
 */
export default function OpeningSetupScreen() {
  const nav = useNavigation();
  const toast = useToast();
  const [step, setStep] = useState<Step>('1');
  const [counts, setCounts] = useState<Record<string, string>>({});
  const [date, setDate] = useState(today());
  const [cash, setCash] = useState('');
  const [partners, setPartners] = useState<PartnerForm[]>([]);
  const [preview, setPreview] = useState<OpeningBalances | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const filled = useRef(false);

  // Fill the form once from what is already saved (so "Redo" starts from the old figures).
  function fill(s: OwnerSummary, items: InventoryItem[]) {
    const o = s.opening;
    const names = o ? o.owners.map((x) => x.username).concat(s.owners.filter((n) => !o.owners.some((x) => x.username === n))) : s.owners;
    const equal = names.length ? String(Math.round((100 / names.length) * 100) / 100) : '0';
    setPartners(
      names.map((n) => {
        const was = o?.owners.find((x) => x.username === n);
        return {
          username: n,
          capital: was ? String(was.capital) : '',
          drawings: was ? String(was.drawings) : '',
          share: o?.profitShare[n] !== undefined ? String(o.profitShare[n]) : equal,
        };
      })
    );
    if (o) {
      setDate(o.date);
      setCash(String(o.cash));
    }
    const c: Record<string, string> = {};
    items.forEach((i) => (c[i.itemId] = String(i.currentStock)));
    setCounts(c);
  }

  const { data, error: loadError, loading } = useLoader(async () => {
    const [summary, inv] = await Promise.all([api.ownerSummary(), api.inventory()]);
    if (!filled.current) {
      filled.current = true;
      fill(summary, inv.items);
    }
    return { summary, items: inv.items };
  });

  const items: InventoryItem[] = useMemo(() => data?.items ?? [], [data]);
  const already = data?.summary.opening ?? null;

  function input(): OpeningInput {
    const profitShare: Record<string, number> = {};
    partners.forEach((p) => (profitShare[p.username] = toNumber(p.share) || 0));
    return {
      date,
      cash: toNumber(cash) || 0,
      owners: partners.map((p) => ({ username: p.username, capital: toNumber(p.capital) || 0, drawings: toNumber(p.drawings) || 0 })),
      profitShare,
      overwrite: !!already,
    };
  }

  async function run(fn: () => Promise<void>) {
    setError(null);
    setBusy(true);
    try {
      await fn();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  const saveCounts = () =>
    run(async () => {
      const changed = items
        .filter((i) => counts[i.itemId] !== undefined && counts[i.itemId] !== String(i.currentStock))
        .map((i) => ({ itemId: i.itemId, qty: Number(counts[i.itemId]) }));
      const bad = changed.find((c) => !Number.isInteger(c.qty) || c.qty < 0);
      if (bad) throw new Error(`Count for ${bad.itemId} must be a whole number, 0 or more.`);
      if (changed.length) {
        await api.setStockCounts(changed);
        toast(`Stock count saved for ${changed.length} item${changed.length === 1 ? '' : 's'}.`);
      }
      setStep('2');
    });

  const toPartners = () => {
    setError(null);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return setError('Enter the date as YYYY-MM-DD.');
    if (cash === '' || !(toNumber(cash) >= 0)) return setError('Enter the cash in hand (0 if none).');
    setStep('3');
  };

  const check = () =>
    run(async () => {
      const total = partners.reduce((s, p) => s + (toNumber(p.share) || 0), 0);
      if (Math.abs(total - 100) > 0.05) throw new Error(`Profit shares must add up to 100% (now ${Math.round(total * 100) / 100}%).`);
      setPreview(await api.previewOpening(input()));
      setStep('4');
    });

  const save = () =>
    run(async () => {
      await api.saveOpening(input());
      success();
      toast('Opening balances saved.');
      nav.goBack();
    });

  if (!data) {
    return (
      <Screen>
        {loading ? <Loading /> : null}
        <View style={{ padding: 16 }}>
          <ErrorText message={loadError} />
        </View>
      </Screen>
    );
  }

  if (!partners.length) {
    return (
      <Screen>
        <Card style={{ marginTop: 8 }}>
          <SectionLabel>No owners yet</SectionLabel>
          <Text style={[ui.muted, { fontSize: 15 }]}>
            Add each partner as an owner user first (Calico App menu in the Google Sheet → Add or reset a user, role owner). Then come back here.
          </Text>
        </Card>
      </Screen>
    );
  }

  return (
    <Screen>
      <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={{ paddingBottom: 40 }}>
        <View style={{ paddingHorizontal: 16, paddingTop: 4, gap: 12 }}>
          <Segmented<Step>
            value={step}
            onChange={(s) => (s < step ? setStep(s) : undefined)}
            options={[
              { value: '1', label: '1 Stock' },
              { value: '2', label: '2 Cash' },
              { value: '3', label: '3 Partners' },
              { value: '4', label: '4 Check' },
            ]}
          />
          {already ? (
            <Text style={[ui.muted, { color: colors.owed }]}>
              Opening balances were saved for {prettyDate(already.date)}. Saving again replaces them.
            </Text>
          ) : null}
        </View>

        {step === '1' ? (
          <Card>
            <SectionLabel>Count your stock</SectionLabel>
            <Text style={[ui.muted, { marginBottom: 12 }]}>
              Enter how many of each item you have on the go-live day. Sales already in the app are kept.
            </Text>
            {items.map((i, n) => (
              <View key={i.itemId}>
                {n ? <Divider /> : null}
                <View style={[ui.between, { paddingVertical: 8, gap: 12 }]}>
                  <View style={{ flex: 1 }}>
                    <Text style={ui.rowTitle} numberOfLines={1}>
                      {i.name}
                    </Text>
                    <Text style={ui.muted} numberOfLines={1}>
                      {[i.size, i.color].filter(Boolean).join(' / ')} · app says {i.currentStock}
                    </Text>
                  </View>
                  <Input
                    value={counts[i.itemId] ?? ''}
                    onChangeText={(v) => setCounts((c) => ({ ...c, [i.itemId]: v.replace(/[^0-9]/g, '') }))}
                    keyboardType="number-pad"
                    style={{ width: 84, marginBottom: 0 }}
                  />
                </View>
              </View>
            ))}
            {!items.length ? <Text style={ui.muted}>No items yet. Add your products in the Stock tab first.</Text> : null}
            <ErrorText message={error} />
            <Button title="Save count and continue" onPress={saveCounts} loading={busy} style={{ marginTop: 12 }} />
          </Card>
        ) : null}

        {step === '2' ? (
          <Card>
            <SectionLabel>Go-live day and cash</SectionLabel>
            <Text style={[ui.muted, { marginBottom: 12 }]}>
              The day you start recording everything in the app. Count all business cash (in hand and in the business bank account).
            </Text>
            <Input label="Go-live date" value={date} onChangeText={setDate} placeholder="YYYY-MM-DD" autoCapitalize="none" keyboardType="numbers-and-punctuation" />
            <Input label="Cash in hand on that day" prefix="Rs" large value={cash} onChangeText={setCash} keyboardType="decimal-pad" placeholder="0" />
            <ErrorText message={error} />
            <Button title="Continue" onPress={toPartners} />
          </Card>
        ) : null}

        {step === '3' ? (
          <>
            {partners.map((p, n) => (
              <Card key={p.username}>
                <SectionLabel>{p.username}</SectionLabel>
                <Input
                  label="Total money put in so far"
                  prefix="Rs"
                  value={p.capital}
                  onChangeText={(v) => setPartners((all) => all.map((x, i) => (i === n ? { ...x, capital: v } : x)))}
                  keyboardType="decimal-pad"
                  placeholder="0"
                />
                <Input
                  label="Total money taken out so far"
                  prefix="Rs"
                  value={p.drawings}
                  onChangeText={(v) => setPartners((all) => all.map((x, i) => (i === n ? { ...x, drawings: v } : x)))}
                  keyboardType="decimal-pad"
                  placeholder="0"
                />
                <Input
                  label="Profit share (%)"
                  value={p.share}
                  onChangeText={(v) => setPartners((all) => all.map((x, i) => (i === n ? { ...x, share: v } : x)))}
                  keyboardType="decimal-pad"
                  style={{ marginBottom: 0 }}
                />
              </Card>
            ))}
            <View style={{ paddingHorizontal: 16 }}>
              <ErrorText message={error} />
              <Button title="Check the figures" onPress={check} loading={busy} style={{ marginTop: 8 }} />
            </View>
          </>
        ) : null}

        {step === '4' && preview ? (
          <>
            <Card>
              <SectionLabel style={{ marginBottom: 6 }}>What the business had on {prettyDate(preview.date)}</SectionLabel>
              <KeyValue label="Cash in hand" value={money(preview.cash)} />
              <KeyValue label="Stock (at cost)" value={money(preview.stockValue)} />
              <KeyValue label="Owed by customers" value={money(preview.receivable)} />
              <KeyValue label="Total" value={money(preview.cash + preview.stockValue + preview.receivable)} bold />
              <Divider style={{ marginVertical: 4 }} />
              <KeyValue label="Money put in by partners" value={money(preview.capital)} muted />
              <KeyValue label="Money taken out by partners" value={`− ${money(preview.drawings)}`} muted />
              <KeyValue
                label={preview.pastProfit < 0 ? 'Loss before the app' : 'Profit before the app'}
                value={money(preview.pastProfit)}
                bold
                color={preview.pastProfit < 0 ? colors.owed : colors.ok}
              />
              <Text style={ui.muted}>This is the profit (or loss) made before you started using the app, worked out from the figures above.</Text>
            </Card>
            <Card>
              <SectionLabel style={{ marginBottom: 6 }}>Starting balance per partner</SectionLabel>
              {preview.owners.map((o) => {
                const share = preview.profitShare[o.username] ?? 0;
                const bal = o.capital - o.drawings + (preview.pastProfit * share) / 100;
                return <KeyValue key={o.username} label={`${o.username} (${share}%)`} value={money(bal)} bold />;
              })}
              <Text style={ui.muted}>Put in − taken out + share of profit before the app.</Text>
            </Card>
            <View style={{ paddingHorizontal: 16 }}>
              <ErrorText message={error} />
              <Button title={already ? 'Replace opening balances' : 'Save opening balances'} onPress={save} loading={busy} variant={already ? 'danger' : 'primary'} style={{ marginTop: 8 }} />
            </View>
          </>
        ) : null}
      </ScrollView>
    </Screen>
  );
}
