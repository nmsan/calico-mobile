import React, { forwardRef } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { captureRef } from 'react-native-view-shot';
import Share, { Social } from 'react-native-share';
import { ShellMark } from '../brand';
import { invoiceDate, type Invoice } from '../invoices';
import { colors, fonts } from '../theme';
import { money } from '../ui';

/** The native view behind a <View>, which is what gets captured. */
export type InvoiceView = React.ComponentRef<typeof View>;

const STATUS = {
  Paid: [colors.ok, colors.okBg],
  Partial: [colors.low, colors.lowBg],
  Unpaid: [colors.owed, colors.owedBg],
} as const;

/**
 * The invoice drawn for sending as a picture: a fixed width, white page with no buttons or
 * chevrons, so it looks the same on every phone. Render it off screen and pass its ref to
 * `shareInvoiceImage`.
 */
export const InvoiceImage = forwardRef<InvoiceView, { inv: Invoice }>(function InvoiceImage({ inv }, ref) {
  const [fg, bg] = STATUS[inv.status];
  return (
    <View ref={ref} collapsable={false} style={s.page}>
      <View style={s.between}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
          <ShellMark size={30} />
          <Text style={{ fontFamily: fonts.serif, fontSize: 24, color: colors.ink }}>Calico</Text>
        </View>
        <View style={{ alignItems: 'flex-end' }}>
          <Text style={s.label}>INVOICE</Text>
          <Text style={[s.strong, { marginTop: 2 }]}>#{inv.number}</Text>
        </View>
      </View>
      <Text style={[s.muted, { marginTop: 8 }]}>{invoiceDate(inv.date)}</Text>

      <View style={s.rule} />
      <Text style={s.label}>BILL TO</Text>
      <Text style={[s.strong, { marginTop: 4 }]}>{inv.customerName || 'Walk-in customer'}</Text>
      {inv.contact ? <Text style={s.muted}>{inv.contact}</Text> : null}

      <View style={s.rule} />
      <View style={[s.between, { marginBottom: 2 }]}>
        <Text style={s.label}>ITEMS</Text>
        <Text style={s.label}>AMOUNT</Text>
      </View>
      {inv.lines.map((l, i) => (
        <View key={l.row} style={[s.between, { alignItems: 'flex-start', paddingVertical: 8, borderTopWidth: i ? 1 : 0, borderTopColor: colors.line }]}>
          <View style={{ flex: 1, paddingRight: 12 }}>
            <Text style={s.item}>{l.itemName || l.itemId}</Text>
            {l.variant ? <Text style={s.muted}>{l.variant}</Text> : null}
            <Text style={s.muted}>
              {l.qty} × {money(l.unitPrice)}
              {l.discount > 0 ? `  ·  less ${money(l.discount)}` : ''}
            </Text>
          </View>
          <Text style={s.amount}>{money(l.total)}</Text>
        </View>
      ))}

      <View style={[s.rule, { marginTop: 6, marginBottom: 8 }]} />
      {inv.discount > 0 ? (
        <>
          <Row label="Subtotal" value={money(inv.subtotal)} />
          <Row label="Discount" value={`−${money(inv.discount)}`} />
        </>
      ) : null}
      <Row label="Total" value={money(inv.total)} bold />
      <Row label="Paid" value={money(inv.paid)} />
      {inv.balance > 0 ? <Row label="Balance due" value={money(inv.balance)} bold color={colors.owed} /> : null}
      <View style={[s.between, { marginTop: 10 }]}>
        <Text style={s.muted}>Status</Text>
        <View style={{ backgroundColor: bg, paddingHorizontal: 10, paddingVertical: 3, borderRadius: 999 }}>
          <Text style={{ color: fg, fontWeight: '600', fontSize: 13 }}>{inv.status}</Text>
        </View>
      </View>

      <Text style={s.thanks}>Thank you for shopping with Calico!</Text>
    </View>
  );
});

function Row({ label, value, bold, color }: { label: string; value: string; bold?: boolean; color?: string }) {
  return (
    <View style={[s.between, { paddingVertical: 4 }]}>
      <Text style={{ fontSize: 14, color: bold ? colors.ink : colors.muted, fontWeight: bold ? '700' : '400' }}>{label}</Text>
      <Text style={{ fontSize: 14, color: color ?? colors.ink, fontWeight: bold ? '700' : '500', fontVariant: ['tabular-nums'] }}>{value}</Text>
    </View>
  );
}

const capture = (view: InvoiceView, inv: Invoice) =>
  captureRef(view, { format: 'png', quality: 1, result: 'tmpfile', fileName: `calico-invoice-${inv.number}` });

/** The share sheet was closed without sharing: not an error worth showing. */
const dismissed = (e: unknown) => /did not share|cancel/i.test(e instanceof Error ? e.message : String(e));

/**
 * Sends the invoice picture straight to WhatsApp (or WhatsApp Business), where you pick the
 * chat. Falls back to the share sheet when neither is installed.
 */
export async function sendInvoiceImageOnWhatsApp(view: InvoiceView, inv: Invoice) {
  const url = await capture(view, inv);
  const options = { url, type: 'image/png', filename: `calico-invoice-${inv.number}` };
  try {
    for (const [pkg, social] of [
      ['com.whatsapp', Social.Whatsapp],
      ['com.whatsapp.w4b', Social.Whatsappbusiness],
    ] as const) {
      if ((await Share.isPackageInstalled(pkg).catch(() => ({ isInstalled: false }))).isInstalled) {
        await Share.shareSingle({ ...options, social });
        return;
      }
    }
    await Share.open({ ...options, title: `Invoice #${inv.number}` });
  } catch (e) {
    if (!dismissed(e)) throw e;
  }
}

/** The invoice picture through the system share sheet (Messages, email, Drive...). */
export async function shareInvoiceImage(view: InvoiceView, inv: Invoice) {
  const url = await capture(view, inv);
  try {
    await Share.open({ url, type: 'image/png', filename: `calico-invoice-${inv.number}`, title: `Invoice #${inv.number}` });
  } catch (e) {
    if (!dismissed(e)) throw e;
  }
}

const s = StyleSheet.create({
  page: { width: 360, backgroundColor: '#FFFFFF', padding: 22 },
  between: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  label: { fontSize: 11, letterSpacing: 1.4, fontWeight: '600', color: colors.muted },
  strong: { fontSize: 15, fontWeight: '600', color: colors.ink },
  muted: { fontSize: 13, color: colors.muted, marginTop: 1 },
  item: { fontSize: 14, fontWeight: '600', color: colors.ink },
  amount: { fontSize: 14, fontWeight: '600', color: colors.ink, fontVariant: ['tabular-nums'] },
  rule: { height: 1, backgroundColor: colors.line, marginVertical: 14 },
  thanks: { marginTop: 22, textAlign: 'center', fontSize: 13, color: colors.ink2, fontStyle: 'italic' },
});
