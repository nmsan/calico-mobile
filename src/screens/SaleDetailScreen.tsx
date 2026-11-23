import { Ionicons } from '@expo/vector-icons';
import { useNavigation, useRoute, type NavigationProp, type ParamListBase, type RouteProp } from '@react-navigation/native';
import React, { useRef, useState } from 'react';
import { Pressable, ScrollView, Text, View } from 'react-native';
import { ShellMark } from '../brand';
import { InvoiceImage, sendInvoiceImageOnWhatsApp, shareInvoiceImage, type InvoiceView } from '../components/InvoiceImage';
import { invoiceDate, sendOnWhatsApp, whatsappNumber } from '../invoices';
import type { SalesStackParams } from '../navigation';
import { colors, fonts } from '../theme';
import { Avatar, Button, Card, Divider, KeyValue, LinkButton, Screen, SectionLabel, money, tap, ui, useToast } from '../ui';
import { InvoiceStatus } from './SalesScreen';

const WHATSAPP_GREEN = '#1F7A4D'; // darker than WhatsApp's own green so white text stays readable

/** One sale laid out as an invoice, with buttons to send it to the customer. */
export default function SaleDetailScreen() {
  const { invoice: inv, photoId } = useRoute<RouteProp<SalesStackParams, 'SaleDetail'>>().params;
  const nav = useNavigation<NavigationProp<ParamListBase>>();
  const toast = useToast();
  const phone = whatsappNumber(inv.contact);
  const imageRef = useRef<InvoiceView>(null);
  const [busy, setBusy] = useState<'whatsapp' | 'share' | null>(null);

  async function sendImage(how: 'whatsapp' | 'share') {
    if (!imageRef.current || busy) return;
    tap();
    setBusy(how);
    try {
      await (how === 'whatsapp' ? sendInvoiceImageOnWhatsApp : shareInvoiceImage)(imageRef.current, inv);
    } catch (e) {
      toast(e instanceof Error ? e.message : 'Could not share the invoice.', 'error');
    } finally {
      setBusy(null);
    }
  }

  const openCustomer = () => {
    tap();
    nav.navigate('Customers', { screen: 'CustomerDetail', params: { name: inv.customerName, contact: inv.contact, photoId } });
  };

  return (
    <Screen>
      <ScrollView contentContainerStyle={{ paddingBottom: 32 }}>
        <Card style={{ marginTop: 4 }}>
          {/* Header: shop and invoice number */}
          <View style={[ui.between, { alignItems: 'flex-start' }]}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
              <ShellMark size={30} />
              <Text style={{ fontFamily: fonts.serif, fontSize: 22, color: colors.ink }}>Calico</Text>
            </View>
            <View style={{ alignItems: 'flex-end' }}>
              <SectionLabel>Invoice</SectionLabel>
              <Text style={[ui.num, { fontSize: 15, fontWeight: '600', color: colors.ink, marginTop: 2 }]}>#{inv.number}</Text>
            </View>
          </View>
          <Text style={[ui.muted, { marginTop: 10 }]}>{invoiceDate(inv.date)}</Text>

          <Divider style={{ marginVertical: 14 }} />

          {/* Bill to */}
          <SectionLabel style={{ marginBottom: 8 }}>Bill to</SectionLabel>
          <Pressable
            onPress={inv.customerName ? openCustomer : undefined}
            disabled={!inv.customerName}
            accessibilityRole="button"
            accessibilityHint="Opens the customer"
            style={({ pressed }) => ({ flexDirection: 'row', alignItems: 'center', gap: 12, opacity: pressed ? 0.7 : 1 })}
          >
            <Avatar name={inv.customerName} size={40} photoId={photoId} />
            <View style={{ flex: 1 }}>
              <Text style={ui.rowTitle}>{inv.customerName || 'Walk-in customer'}</Text>
              <Text style={ui.muted}>{inv.contact || 'No phone saved'}</Text>
            </View>
            {inv.customerName ? <Ionicons name="chevron-forward" size={18} color={colors.faint} /> : null}
          </Pressable>

          <Divider style={{ marginVertical: 14 }} />

          {/* Items */}
          <View style={[ui.between, { marginBottom: 4 }]}>
            <SectionLabel>Items</SectionLabel>
            <SectionLabel>Amount</SectionLabel>
          </View>
          {inv.lines.map((l, i) => (
            <View key={l.row} style={{ paddingVertical: 10, borderTopWidth: i ? 1 : 0, borderTopColor: colors.line }}>
              <View style={[ui.between, { alignItems: 'flex-start', gap: 12 }]}>
                <View style={{ flex: 1 }}>
                  <Text style={{ fontSize: 15, fontWeight: '600', color: colors.ink }}>{l.itemName || l.itemId}</Text>
                  <Text style={[ui.muted, { marginTop: 2 }]}>
                    {[l.variant, l.itemId].filter(Boolean).join(' · ')}
                  </Text>
                  <Text style={[ui.muted, ui.num, { marginTop: 2 }]}>
                    {l.qty} × {money(l.unitPrice)}
                  </Text>
                </View>
                <View style={{ alignItems: 'flex-end' }}>
                  <Text style={[ui.num, { fontSize: 15, fontWeight: '600', color: colors.ink }]}>{money(l.total)}</Text>
                  {l.discount > 0 ? (
                    <Text style={[ui.muted, ui.num, { marginTop: 2 }]}>
                      {money(l.subtotal)} − {money(l.discount)}
                    </Text>
                  ) : null}
                </View>
              </View>
            </View>
          ))}

          <Divider style={{ marginTop: 6, marginBottom: 8 }} />

          {/* Totals */}
          {inv.discount > 0 ? (
            <>
              <KeyValue label="Subtotal" value={money(inv.subtotal)} muted />
              <KeyValue label="Discount" value={`−${money(inv.discount)}`} muted />
            </>
          ) : null}
          <KeyValue label="Total" value={money(inv.total)} bold />
          <KeyValue label="Paid" value={money(inv.paid)} muted />
          {inv.balance > 0 ? <KeyValue label="Balance due" value={money(inv.balance)} bold color={colors.owed} /> : null}
          <View style={[ui.between, { marginTop: 8 }]}>
            <Text style={ui.muted}>Status</Text>
            <InvoiceStatus inv={inv} />
          </View>
        </Card>

        {/* Send: the invoice picture to WhatsApp first, any other app second, plain text as a fallback. */}
        <View style={{ marginHorizontal: 16, marginTop: 20, gap: 10 }}>
          <Button
            title="Send on WhatsApp"
            icon="logo-whatsapp"
            loading={busy === 'whatsapp'}
            style={{ backgroundColor: WHATSAPP_GREEN }}
            onPress={() => void sendImage('whatsapp')}
          />
          <Button title="Share another way" icon="share-social-outline" variant="secondary" loading={busy === 'share'} onPress={() => void sendImage('share')} />
          <Text style={[ui.muted, { textAlign: 'center', fontSize: 13 }]}>Sends the invoice as a picture. Pick the customer&apos;s chat in WhatsApp.</Text>
          <View style={{ alignItems: 'center', marginTop: 4 }}>
            <LinkButton
              title={phone ? `Or send as text to ${inv.contact}` : 'Or send as a text message'}
              icon="chatbubble-ellipses-outline"
              onPress={() => {
                tap();
                sendOnWhatsApp(inv).catch(() => toast('Could not open WhatsApp.', 'error'));
              }}
            />
          </View>
        </View>
      </ScrollView>
      {/* Drawn off screen at a fixed size; the send buttons turn it into a picture. */}
      <View style={{ position: 'absolute', left: -10000, top: 0 }} pointerEvents="none" accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
        <InvoiceImage ref={imageRef} inv={inv} />
      </View>
    </Screen>
  );
}
